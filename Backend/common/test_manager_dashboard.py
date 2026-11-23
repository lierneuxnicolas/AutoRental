from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import ClientDocument
from interventions.models import Intervention
from payments.models import Payment
from reservations.models import Reservation
from reservations.tests import ReservationTestDataMixin


class ManagerDashboardTests(ReservationTestDataMixin, TestCase):
    def setUp(self):
        self.api = APIClient()
        self.url = reverse("common:management-dashboard")
        self.now = datetime(2026, 11, 22, 12, tzinfo=ZoneInfo("Europe/Brussels"))

    def test_only_active_managers_and_administrators_can_access_dashboard(self):
        self.assertEqual(self.api.get(self.url).status_code, 401)
        for user, expected in (
            (self.manager_user, 200),
            (self.admin_user, 200),
            (self.client_user_1, 403),
            (self.mechanic_user, 403),
            (self.cleaner_user, 403),
        ):
            with self.subTest(role=user.role.code):
                self.api.force_authenticate(user)
                self.assertEqual(self.api.get(self.url).status_code, expected)
        self.admin_user.is_active = False
        self.api.force_authenticate(self.admin_user)
        self.assertEqual(self.api.get(self.url).status_code, 403)

    def test_returns_only_current_aggregates_and_monthly_gross_revenue(self):
        self.api.force_authenticate(self.manager_user)
        ClientDocument.objects.filter(
            client=self.client_profile_1, document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
        ).update(status=ClientDocument.Status.EN_ATTENTE)
        ClientDocument.objects.filter(
            client=self.client_profile_2, document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
        ).update(status=ClientDocument.Status.EN_ATTENTE, is_active=False)
        reservation = self._create_reservation(status=Reservation.Status.A_CONTROLER)
        month_start = self.now.replace(day=1, hour=0)
        for payment_status, amount, currency, paid_at in (
            (Payment.Status.REUSSI, "120.10", "EUR", month_start),
            (Payment.Status.REUSSI, "24.25", "EUR", self.now),
            (Payment.Status.REUSSI, "100.00", "EUR", month_start - timedelta(seconds=1)),
            (Payment.Status.REUSSI, "100.00", "EUR", self.now + timedelta(seconds=1)),
            (Payment.Status.REUSSI, "100.00", "USD", self.now),
            (Payment.Status.EN_ATTENTE, "100.00", "EUR", None),
        ):
            Payment.objects.create(
                reservation=reservation, status=payment_status,
                amount=Decimal(amount), currency=currency, succeeded_at=paid_at,
            )
        with patch("common.manager_dashboard.timezone.now", return_value=self.now):
            response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response.json(), {
            "pending_documents": 1,
            "available_vehicles": 1,
            "reservations_to_check": 1,
            "active_users": 6,
            "open_interventions": 0,
            "revenue": {
                "amount": "144.35", "currency": "EUR",
                "period_start": "2026-11-01", "period_end": "2026-11-22",
            },
        })

    def test_counts_active_accounts_and_interventions_that_are_still_open(self):
        self.api.force_authenticate(self.manager_user)
        self.client_user_2.is_active = False
        self.client_user_2.save(update_fields=["is_active"])

        for intervention_status in (
            Intervention.Status.A_ATTRIBUER,
            Intervention.Status.EN_COURS,
            Intervention.Status.EN_PAUSE,
            Intervention.Status.TERMINEE,
            Intervention.Status.ANNULEE,
        ):
            Intervention.objects.create(
                vehicle=self.vehicle_available, created_by=self.manager_user,
                assigned_to=self.mechanic_user,
                reference=f"DASHBOARD-{intervention_status}", intervention_type=Intervention.Type.MECANIQUE,
                status=intervention_status,
                started_at=self.now if intervention_status in {
                    Intervention.Status.EN_COURS, Intervention.Status.EN_PAUSE, Intervention.Status.TERMINEE,
                } else None,
            )
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["active_users"], 5)
        self.assertEqual(response.json()["open_interventions"], 3)

    def test_excludes_current_overlaps_and_ignores_future_interventions(self):
        self.api.force_authenticate(self.manager_user)
        reservation = self._create_reservation(
            status=Reservation.Status.CONFIRMEE, start_at=self.now, end_at=self.now + timedelta(hours=1),
        )
        intervention = Intervention.objects.create(
            vehicle=self.vehicle_available, created_by=self.manager_user,
            reference="DASHBOARD-TEST", intervention_type=Intervention.Type.MECANIQUE,
            planned_start_at=self.now + timedelta(hours=1), planned_end_at=self.now + timedelta(hours=2),
        )
        with patch("common.manager_dashboard.timezone.now", return_value=self.now):
            self.assertEqual(self.api.get(self.url).json()["available_vehicles"], 0)
            Reservation.objects.filter(pk=reservation.pk).update(
                start_at=self.now - timedelta(hours=1), end_at=self.now,
            )
            self.assertEqual(self.api.get(self.url).json()["available_vehicles"], 1)
            Intervention.objects.filter(pk=intervention.pk).update(planned_start_at=self.now)
            self.assertEqual(self.api.get(self.url).json()["available_vehicles"], 0)
