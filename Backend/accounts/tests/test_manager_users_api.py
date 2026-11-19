from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ClientDocument, ClientProfile, Role
from common.models import SystemLog

from .utils import create_user, ensure_roles


class ManagerUsersApiTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.manager = create_user(
            email="manager-users-list@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        self.client_user = create_user(
            email="client-users-list@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        self.mechanic = create_user(
            email="mechanic-users-list@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.MECANICIEN],
        )
        self.admin = create_user(
            email="admin-users-list@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.ADMINISTRATEUR],
            is_superuser=True,
        )
        self.client_profile = ClientProfile.objects.create(
            user=self.client_user,
            date_of_birth=date(1990, 1, 2),
        )
        self.list_url = reverse("accounts:management-users")
        self.status_url = lambda user_id: reverse(
            "accounts:management-users-status",
            kwargs={"pk": user_id},
        )

    def test_manager_can_list_users_without_sensitive_fields(self):
        self.client.force_authenticate(self.manager)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["count"], 4)
        item = next(result for result in response.data["results"] if result["id"] == self.client_user.id)
        self.assertEqual(item["role"], Role.Code.CLIENT)
        self.assertIn("date_joined", item)
        self.assertNotIn("password", item)
        self.assertNotIn("phone", item)
        self.assertNotIn("date_of_birth", item)
        self.assertNotIn("email_verified", item)

    def test_manager_can_view_user_details_read_only(self):
        self.client.force_authenticate(self.manager)

        response = self.client.get(reverse("accounts:management-users-detail", kwargs={"pk": self.client_user.id}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["date_of_birth"], "1990-01-02")
        self.assertEqual(response.data["phone"], self.client_user.phone)
        self.assertNotIn("password", response.data)

    def test_other_roles_cannot_list_or_toggle_users(self):
        self.client.force_authenticate(self.mechanic)

        self.assertEqual(self.client.get(self.list_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.patch(self.status_url(self.client_user.id), {"is_active": False}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_manager_can_deactivate_and_reactivate_client_and_mechanic(self):
        self.client.force_authenticate(self.manager)

        for target in (self.client_user, self.mechanic):
            deactivated = self.client.patch(
                self.status_url(target.id),
                {"is_active": False},
                format="json",
            )
            target.refresh_from_db()
            self.assertEqual(deactivated.status_code, status.HTTP_200_OK)
            self.assertFalse(target.is_active)
            self.assertFalse(deactivated.data["is_active"])

            reactivated = self.client.patch(
                self.status_url(target.id),
                {"is_active": True},
                format="json",
            )
            target.refresh_from_db()
            self.assertEqual(reactivated.status_code, status.HTTP_200_OK)
            self.assertTrue(target.is_active)
            self.assertTrue(reactivated.data["is_active"])

        self.assertEqual(SystemLog.objects.filter(action="USER_DEACTIVATED", user=self.manager).count(), 2)
        self.assertEqual(SystemLog.objects.filter(action="USER_ACTIVATED", user=self.manager).count(), 2)

    def test_manager_cannot_toggle_self_manager_or_administrator(self):
        self.client.force_authenticate(self.manager)

        for target in (self.manager, self.admin):
            response = self.client.patch(
                self.status_url(target.id),
                {"is_active": False},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN if target == self.admin else status.HTTP_400_BAD_REQUEST)

        another_manager = create_user(
            email="another-manager-users-list@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        response = self.client.patch(
            self.status_url(another_manager.id),
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_document_list_can_be_scoped_to_user(self):
        document = ClientDocument.objects.create(
            client=self.client_profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="ID-MANAGER-LIST",
            file="client_documents/manager-list.pdf",
        )
        other_client = create_user(
            email="other-client-users-list@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        other_profile = ClientProfile.objects.create(user=other_client)
        ClientDocument.objects.create(
            client=other_profile,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            document_number="LICENSE-OTHER",
            file="client_documents/other-list.pdf",
        )
        self.client.force_authenticate(self.manager)

        response = self.client.get(
            reverse("accounts:management-documents"),
            {"user_id": self.client_user.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data["results"]], [document.id])
