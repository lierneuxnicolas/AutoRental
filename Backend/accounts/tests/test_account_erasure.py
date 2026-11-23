from datetime import timedelta
from decimal import Decimal
from io import StringIO
from tempfile import TemporaryDirectory
from unittest.mock import patch

from common.models import SystemLog
from django.core.cache import caches
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from inspections.models import Inspection
from django.db import IntegrityError, OperationalError, transaction
from django.test import Client, override_settings
from django.urls import reverse
from django.utils import timezone
from interventions.models import VehicleAccess
from invoicing.models import Invoice
from notifications.models import Notification
from payments.models import Deposit, Payment, Refund, StripeEvent
from reservations.models import Reservation
from reservations.tests import ReservationTestDataMixin
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import AccountErasureRequest, ClientDocument, DocumentVerificationChange, User
from accounts.services.account_erasure import request_account_erasure
from accounts.services.erasure_processing import process_closed_account_erasure


@override_settings(AUTH_RATE_LIMIT_REDIS_URL="", AUTH_RATE_LIMIT_REQUIRE_SHARED=False)
class AccountErasureTests(ReservationTestDataMixin, APITestCase):
    password = "Pass1234!"

    @classmethod
    def setUpClass(cls):
        media = TemporaryDirectory()
        cls.addClassCleanup(media.cleanup)
        cls.enterClassContext(override_settings(MEDIA_ROOT=media.name))
        super().setUpClass()

    def setUp(self):
        # SQL is rolled back between test methods, but storage deletions are permanent.
        for document in ClientDocument.objects.filter(client=self.client_profile_1):
            if not document.file.storage.exists(document.file.name):
                document.file.storage.save(document.file.name, ContentFile(b"document fictif"))
        caches["auth_rate_limit"].clear()
        self.addCleanup(caches["auth_rate_limit"].clear)
        self.url = reverse("accounts:users-me-erasure-requests")

    def request_erasure(self, password=None):
        return self.client.post(self.url, {"password": password or self.password}, format="json")

    def login(self):
        return self.client.post(
            reverse("accounts:auth-login"),
            {"email": self.client_user_1.email, "password": self.password},
            format="json",
        )

    def test_closure_revokes_jwts_and_sessions_without_removing_profile(self):
        login = self.login()
        self.assertEqual(login.status_code, 200)
        access = login.data["access"]
        refresh = login.data["refresh"]
        jti = RefreshToken(refresh)["jti"]
        another_refresh_jti = RefreshToken.for_user(self.client_user_1)["jti"]
        session_client = Client()
        session_client.force_login(self.client_user_1)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.request_erasure()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "CLOSED")
        self.assertTrue(response.data["closed_at"])
        self.client_user_1.refresh_from_db()
        self.assertFalse(self.client_user_1.is_active)
        self.assertFalse(self.client_user_1.has_usable_password())
        self.assertTrue(self.client_user_1.email.endswith("@getacar.invalid"))
        self.assertEqual(response.data["processing_status"], "COMPLETED")
        profile = self.client_user_1.client_profile
        self.assertEqual((profile.address, profile.date_of_birth), ("", None))
        self.assertEqual((self.client_user_1.first_name, self.client_user_1.last_name, self.client_user_1.phone), ("", "", ""))
        self.assertEqual(self.client_user_1.client_profile.pk, self.client_profile_1.pk)
        self.assertFalse(session_client.get(reverse("admin:login")).wsgi_request.user.is_authenticated)
        self.assertEqual(BlacklistedToken.objects.filter(token__jti__in=(jti, another_refresh_jti)).count(), 2)
        self.assertEqual(self.client.get(reverse("accounts:auth-me")).status_code, 401)
        self.assertEqual(self.request_erasure().status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post(
            reverse("accounts:auth-token-refresh"), {"refresh": refresh}, format="json"
        ).status_code, 401)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(request_account_erasure(user_id=self.client_user_1.pk, password=self.password).status, "CLOSED")
        self.assertEqual(AccountErasureRequest.objects.count(), 1)

    def test_closure_database_error_has_safe_message_and_allows_retry(self):
        self.client.force_authenticate(self.client_user_1)
        with patch("accounts.views.erasure.request_account_erasure", side_effect=OperationalError("private")), self.assertLogs(
            "accounts.views.erasure", level="ERROR",
        ) as logs:
            response = self.request_erasure()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "ERASURE_DATABASE_ERROR")
        self.assertNotIn("private", str(response.data) + str(logs.output))
        self.assertNotIn(self.password, str(logs.output))
        self.client_user_1.refresh_from_db()
        self.assertTrue(self.client_user_1.is_active)
        self.assertFalse(AccountErasureRequest.objects.exists())
        self.assertEqual(self.request_erasure().status_code, 200)

    def test_closed_account_cannot_be_reactivated_by_staff_or_database_update(self):
        self.client.force_authenticate(self.client_user_1)
        self.assertEqual(self.request_erasure().status_code, 200)
        self.client.force_authenticate(self.manager_user)
        listing = self.client.get(reverse("accounts:management-users"))
        self.assertEqual(listing.status_code, 200)
        row = next(user for user in listing.data["results"] if user["id"] == self.client_user_1.pk)
        self.assertFalse(row["is_active"])
        self.assertTrue(row["email"].endswith("@getacar.invalid"))
        for actor, endpoint in (
            (self.admin_user, "accounts:admin-users-status"),
            (self.manager_user, "accounts:management-users-status"),
        ):
            self.client.force_authenticate(actor)
            response = self.client.patch(reverse(endpoint, args=[self.client_user_1.pk]), {"is_active": True}, format="json")
            self.assertEqual(response.status_code, 409)
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.filter(pk=self.client_user_1.pk).update(is_active=True)

    def test_completed_rental_keeps_reservation_payment_invoice_and_erases_documents(self):
        reservation = self._create_reservation(status=Reservation.Status.TERMINEE)
        payment = Payment.objects.create(reservation=reservation, amount=Decimal("120.00"), status=Payment.Status.REUSSI)
        invoice = Invoice.objects.create(
            reservation=reservation, client=self.client_profile_1,
            subtotal=Decimal("120.00"), total_amount=Decimal("120.00"),
            billing_name="Client fictif", billing_address="Adresse de test",
        )
        documents_before = list(ClientDocument.objects.filter(client=self.client_profile_1))
        self.assertEqual(len(documents_before), 2)
        change = DocumentVerificationChange.objects.create(
            document=documents_before[0], manager=self.client_user_2, changes={"previous": "fictif"},
        )
        document = documents_before[0]
        log_prefix = f"Document #{document.pk} ({document.document_type}) valide"
        log = SystemLog.objects.create(
            action="DOCUMENT_VALIDATED", message=f"{log_prefix} pour client {self.client_user_1.email}.",
        )
        self.assertTrue(all(doc.file.storage.exists(doc.file.name) for doc in documents_before))
        notification = Notification.objects.create(
            user=self.client_user_1, notification_type=Notification.NotificationType.INVOICE_AVAILABLE,
            title="Facture", message="Notification fictive",
        )
        self.client.force_authenticate(self.client_user_1)
        self.assertEqual(self.request_erasure().status_code, 200)
        invoice.refresh_from_db()
        self.assertEqual(invoice.client_id, self.client_profile_1.pk)
        self.assertEqual(invoice.reservation_id, reservation.pk)
        self.assertEqual(invoice.billing_name, "Client fictif")
        self.assertTrue(Payment.objects.filter(pk=payment.pk, reservation=reservation).exists())
        self.assertEqual(invoice.billing_address, "Adresse de test")
        self.assertFalse(ClientDocument.objects.filter(client=self.client_profile_1).exists())
        self.assertFalse(DocumentVerificationChange.objects.filter(pk=change.pk).exists())
        self.assertFalse(Notification.objects.filter(pk=notification.pk).exists())
        log.refresh_from_db()
        self.assertEqual(log.message, f"{log_prefix}.")
        self.assertTrue(all(not doc.file.storage.exists(doc.file.name) for doc in documents_before))

    def test_storage_failure_leaves_references_and_retry_is_idempotent(self):
        documents = list(ClientDocument.objects.filter(client=self.client_profile_1).order_by("id"))
        storage = documents[0].file.storage
        delete = storage.delete

        def delete_except_last(name):
            if name == documents[-1].file.name:
                raise OSError("test")
            delete(name)

        self.client.force_authenticate(self.client_user_1)
        with patch.object(storage, "delete", side_effect=delete_except_last):
            response = self.request_erasure()
            self.assertEqual(response.status_code, 202)
            self.assertEqual(response.data["status"], "CLOSED")
            self.assertEqual(response.data["processing_status"], "FAILED")
            self.assertIn("incomplet", response.data["detail"])
            self.assertEqual(response.data["processing_error"], "FILE_DELETE_FAILED")
            request = AccountErasureRequest.objects.get(user=self.client_user_1)
            with self.assertRaisesMessage(CommandError, "FILE_DELETE_FAILED"):
                call_command("process_account_erasure", request.pk, stdout=StringIO())
        self.assertFalse(storage.exists(documents[0].file.name))
        self.assertTrue(storage.exists(documents[-1].file.name))
        self.assertEqual(ClientDocument.objects.filter(client=self.client_profile_1).count(), 2)
        call_command("process_account_erasure", request.pk, stdout=StringIO())
        request.refresh_from_db()
        self.assertEqual(request.processing_status, "COMPLETED")
        self.assertEqual(request.processing_error, "")
        self.assertFalse(storage.exists(documents[-1].file.name))
        with patch.object(storage, "delete") as delete_again:
            repeat = process_closed_account_erasure(request.pk)
        delete_again.assert_not_called()
        self.assertEqual(repeat.processed_at, request.processed_at)

    def test_legal_hold_preserves_data_and_release_allows_retry(self):
        request = AccountErasureRequest.objects.create(user=self.client_user_1, retention_hold=True)
        self.client.force_authenticate(self.client_user_1)
        response = self.request_erasure()
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["processing_status"], "HELD")
        self.assertEqual(ClientDocument.objects.filter(client=self.client_profile_1).count(), 2)
        AccountErasureRequest.objects.filter(pk=request.pk).update(retention_hold=False)
        self.assertEqual(process_closed_account_erasure(request.pk).processing_status, "COMPLETED")

    def test_clears_only_unevidenced_draft_inspection_comments(self):
        reservation = self._create_reservation(status=Reservation.Status.TERMINEE)
        scratch = Inspection.objects.create(
            reservation=reservation, inspection_type=Inspection.Type.INITIAL, comments="Note privée fictive",
        )
        evidence = Inspection.objects.create(
            reservation=reservation, inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.TERMINE, comments="Preuve fictive",
        )
        self.client.force_authenticate(self.client_user_1)
        self.assertEqual(self.request_erasure().data["processing_status"], "COMPLETED")
        scratch.refresh_from_db()
        evidence.refresh_from_db()
        self.assertEqual(scratch.comments, "")
        self.assertEqual(evidence.comments, "Preuve fictive")

    def test_active_rental_defers_once_blocks_new_bookings_and_keeps_existing_access(self):
        reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
        self.client.force_authenticate(self.client_user_1)
        first = self.request_erasure()
        self.assertEqual(first.status_code, 202)
        self.assertEqual(first.data["reason"], "RESERVATION")
        self.assertIn("encore ouverte", first.data["detail"])
        self.assertEqual(first.data["processing_status"], "PENDING")
        self.assertEqual(ClientDocument.objects.filter(client=self.client_profile_1).count(), 2)
        self.assertEqual(self.request_erasure().data["requested_at"], first.data["requested_at"])
        self.assertEqual(AccountErasureRequest.objects.count(), 1)
        self.client_user_1.refresh_from_db()
        self.assertTrue(self.client_user_1.is_active)
        self.assertTrue(self.client_user_1.check_password(self.password))
        self.assertEqual(self.client.get(reverse("reservations:reservation-detail", args=[reservation.pk])).status_code, 200)

        start, end = self._daily_period(start_offset_days=12)
        response = self.client.post(reverse("reservations:reservation-list-create"), {
            "vehicle_id": self.vehicle_available.pk,
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "ACCOUNT_ERASURE_PENDING")
        self.assertEqual(Reservation.objects.filter(client=self.client_profile_1).count(), 1)

        Reservation.objects.filter(pk=reservation.pk).update(status=Reservation.Status.TERMINEE)
        result = self.request_erasure()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["requested_at"], first.data["requested_at"])

    def test_vehicle_access_defers_until_rental_finishes_then_client_can_retry(self):
        now = timezone.now()
        reservation = self._create_reservation(status=Reservation.Status.EN_COURS)
        access = VehicleAccess.objects.create(
            reservation=reservation, vehicle=reservation.vehicle, client=self.client_user_1,
            status=VehicleAccess.Status.ACTIVE, is_active=True,
            valid_from=now - timedelta(hours=1), valid_until=now + timedelta(hours=1),
        )
        self.client.force_authenticate(self.client_user_1)
        first = self.request_erasure()
        self.assertEqual(first.status_code, 202)
        self.assertEqual(first.data["reason"], "VEHICLE_ACCESS")
        self.assertIn("accès véhicule", first.data["detail"])
        Reservation.objects.filter(pk=reservation.pk).update(status=Reservation.Status.TERMINEE)
        self.assertEqual(AccountErasureRequest.objects.get().status, "PENDING")
        result = self.request_erasure()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["requested_at"], first.data["requested_at"])
        self.assertEqual(result.data["processing_status"], "COMPLETED")
        access.refresh_from_db()
        self.assertTrue(access.is_active)

    def test_expired_accesses_from_final_reservations_allow_erasure(self):
        now = timezone.now()
        for status in (Reservation.Status.TERMINEE, Reservation.Status.ANNULEE, Reservation.Status.NON_UTILISEE):
            reservation = self._create_reservation(status=status)
            VehicleAccess.objects.create(
                reservation=reservation, vehicle=reservation.vehicle, client=self.client_user_1,
                status=VehicleAccess.Status.ACTIVE, is_active=True,
                valid_from=now - timedelta(days=3), valid_until=now - timedelta(days=2),
            )
        self.client.force_authenticate(self.client_user_1)
        response = self.request_erasure()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["processing_status"], "COMPLETED")
        self.client_user_1.refresh_from_db()
        self.assertFalse(self.client_user_1.is_active)
        self.assertFalse(ClientDocument.objects.filter(client=self.client_profile_1).exists())

    def test_future_reservation_and_return_review_are_blockers(self):
        reservation = self._create_reservation(status=Reservation.Status.CONFIRMEE)
        self.client.force_authenticate(self.client_user_1)
        self.assertEqual(self.request_erasure().data["reason"], "RESERVATION")
        Reservation.objects.filter(pk=reservation.pk).update(status=Reservation.Status.A_CONTROLER)
        self.assertEqual(self.request_erasure().data["reason"], "RETURN_REVIEW")

    def test_open_financial_obligations_defer_closure(self):
        reservation = self._create_reservation(status=Reservation.Status.TERMINEE)
        now = timezone.now()
        VehicleAccess.objects.create(
            reservation=reservation, vehicle=reservation.vehicle, client=self.client_user_1,
            status=VehicleAccess.Status.ACTIVE, is_active=True,
            valid_from=now - timedelta(days=2), valid_until=now - timedelta(days=1),
        )
        deposit = Deposit.objects.create(reservation=reservation, amount=350, status=Deposit.Status.AUTORISEE)
        payment = Payment.objects.create(
            reservation=reservation, amount=120, status=Payment.Status.TRAITEMENT,
            stripe_payment_intent_id="pi_fixture_erasure",
        )
        refund = Refund.objects.create(payment=payment, reservation=reservation, amount=10, status=Refund.Status.EN_COURS)
        self.client.force_authenticate(self.client_user_1)

        self.assertEqual(self.request_erasure().data["reason"], "DEPOSIT")
        Deposit.objects.filter(pk=deposit.pk).update(status=Deposit.Status.LIBEREE)
        self.assertEqual(self.request_erasure().data["reason"], "PAYMENT")
        Payment.objects.filter(pk=payment.pk).update(status=Payment.Status.REUSSI)
        self.assertEqual(self.request_erasure().data["reason"], "REFUND")
        Refund.objects.filter(pk=refund.pk).update(status=Refund.Status.REUSSI)

        StripeEvent.objects.create(
            stripe_event_id="evt_payment_fixture",
            event_type="payment_intent.succeeded",
            payload={"data": {"object": {"id": "pi_fixture_erasure", "latest_charge": "ch_fixture_erasure"}}},
        )

        def event(name, event_type, event_time, dispute_status):
            StripeEvent.objects.create(stripe_event_id=name, event_type=event_type, payload={
                "created": event_time,
                "data": {"object": {"id": "du_fixture", "status": dispute_status, "charge": "ch_fixture_erasure"}},
            })

        event("evt_open", "charge.dispute.created", 100, "needs_response")
        self.assertEqual(self.request_erasure().data["reason"], "DISPUTE")
        event("evt_closed", "charge.dispute.closed", 200, "won")
        event("evt_older", "charge.dispute.updated", 150, "under_review")
        self.assertEqual(self.request_erasure().status_code, 200)

    def test_permissions_password_and_account_rate_limit(self):
        self.assertEqual(self.request_erasure().status_code, 401)
        self.client.force_authenticate(self.manager_user)
        self.assertEqual(self.request_erasure().status_code, 403)
        self.client.force_authenticate(self.client_user_1)
        for attempt in range(6):
            response = self.client.post(
                self.url, {"password": "incorrect"}, format="json", REMOTE_ADDR=f"192.0.2.{attempt + 1}",
            )
            self.assertEqual(response.status_code, 400 if attempt < 5 else 429)
        self.assertFalse(AccountErasureRequest.objects.exists())

