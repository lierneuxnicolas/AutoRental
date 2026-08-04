from datetime import date, timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ClientDocument, ClientProfile, Role
from notifications.models import Notification

from .utils import create_user, ensure_roles


class DocumentManagementEndpointsTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.login_url = reverse("accounts:auth-login")
        self.management_list_url = reverse("accounts:management-documents")

        self.manager = create_user(
            email="manager-docs@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        self.client_user = create_user(
            email="managed-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
            email_verified=True,
        )
        self.client_profile = ClientProfile.objects.create(
            user=self.client_user,
            date_of_birth=date(1990, 1, 1),
            address="Rue Test",
            profile_status=ClientProfile.ProfileStatus.INCOMPLET,
        )

        self.document = ClientDocument.objects.create(
            client=self.client_profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="MGMT-123",
            file="client_documents/mgmt.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.EN_ATTENTE,
            is_active=True,
        )

    def _authenticate(self, email, password):
        response = self.client.post(
            self.login_url,
            {"email": email, "password": password},
            format="json",
        )
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_list_accessible_to_manager(self):
        self._authenticate("manager-docs@example.com", "StrongPass123!")
        response = self.client.get(self.management_list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_client_is_forbidden(self):
        self._authenticate("managed-client@example.com", "StrongPass123!")
        response = self.client.get(self.management_list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_mechanic_is_forbidden(self):
        mechanic = create_user(
            email="mechanic-docs@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.MECANICIEN],
        )
        ClientProfile.objects.create(user=mechanic)

        self._authenticate("mechanic-docs@example.com", "StrongPass123!")
        response = self.client.get(self.management_list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_validate_success_sets_validated_fields_and_creates_notification(self):
        self._authenticate("manager-docs@example.com", "StrongPass123!")
        validate_url = reverse("accounts:management-documents-validate", kwargs={"pk": self.document.pk})

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(validate_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.document.refresh_from_db()
        self.client_profile.refresh_from_db()

        self.assertEqual(self.document.status, ClientDocument.Status.VALIDE)
        self.assertEqual(self.document.validated_by_id, self.manager.id)
        self.assertIsNotNone(self.document.validated_at)
        self.assertTrue(
            Notification.objects.filter(
                user=self.client_user,
                notification_type="DOCUMENT_VALIDATED",
                title="Document valide",
                related_object_type="document",
                related_object_id=self.document.id,
            ).exists()
        )
        self.assertEqual(self.client_profile.profile_status, ClientProfile.ProfileStatus.INCOMPLET)

    def test_validate_expired_document_is_rejected(self):
        self.document.expiration_date = timezone.localdate() - timedelta(days=1)
        self.document.save(update_fields=["expiration_date"])

        self._authenticate("manager-docs@example.com", "StrongPass123!")
        validate_url = reverse("accounts:management-documents-validate", kwargs={"pk": self.document.pk})
        response = self.client.post(validate_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_success_with_reason(self):
        self._authenticate("manager-docs@example.com", "StrongPass123!")
        reject_url = reverse("accounts:management-documents-reject", kwargs={"pk": self.document.pk})

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reject_url, {"reason": "Document illisible"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.document.refresh_from_db()
        self.client_profile.refresh_from_db()

        self.assertEqual(self.document.status, ClientDocument.Status.REFUSE)
        self.assertEqual(self.document.rejection_reason, "Document illisible")
        self.assertEqual(self.document.validated_by_id, self.manager.id)
        self.assertIsNotNone(self.document.validated_at)
        self.assertEqual(self.client_profile.profile_status, ClientProfile.ProfileStatus.REFUSE)
        self.assertTrue(
            Notification.objects.filter(
                user=self.client_user,
                notification_type="DOCUMENT_REJECTED",
                title="Document refuse",
                related_object_type="document",
                related_object_id=self.document.id,
            ).exists()
        )

    def test_reject_without_reason_is_rejected(self):
        self._authenticate("manager-docs@example.com", "StrongPass123!")
        reject_url = reverse("accounts:management-documents-reject", kwargs={"pk": self.document.pk})

        response = self.client.post(reject_url, {"reason": "   "}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_repeated_action_is_refused(self):
        self._authenticate("manager-docs@example.com", "StrongPass123!")
        validate_url = reverse("accounts:management-documents-validate", kwargs={"pk": self.document.pk})

        first_response = self.client.post(validate_url, {}, format="json")
        second_response = self.client.post(validate_url, {}, format="json")

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
