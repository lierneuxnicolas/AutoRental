from datetime import timedelta
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import ClientDocument, ClientProfile, Role
from notifications.models import Notification

from .utils import create_user, ensure_roles


@override_settings(CLIENT_DOCUMENT_MAX_SIZE=1024)
class ClientDocumentsUploadTests(APITestCase):
    def setUp(self):
        self.roles = ensure_roles()
        self.login_url = reverse("accounts:auth-login")
        self.documents_url = reverse("accounts:users-me-documents")

        self.user = create_user(
            email="docs-client@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        self.profile = ClientProfile.objects.create(user=self.user)

    def _authenticate(self, email="docs-client@example.com", password="StrongPass123!"):
        response = self.client.post(
            self.login_url,
            {"email": email, "password": password},
            format="json",
        )
        token = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def _make_image_file(self, *, ext="png", content_type="image/png"):
        image = Image.new("RGB", (4, 4), color="red")
        buffer = BytesIO()
        image_format = "JPEG" if ext in {"jpg", "jpeg"} else ext.upper()
        image.save(buffer, format=image_format)
        return SimpleUploadedFile(
            f"test.{ext}",
            buffer.getvalue(),
            content_type=content_type,
        )

    def _make_pdf_file(self, *, valid=True, content_type="application/pdf"):
        content = b"%PDF-1.4\n%test\n" if valid else b"NOTPDF"
        return SimpleUploadedFile("test.pdf", content, content_type=content_type)

    def _payload(
        self,
        uploaded_file,
        doc_type=ClientDocument.DocumentType.CARTE_IDENTITE,
    ):
        payload = {
            "document_type": doc_type,
            "document_number": "DOC-123",
            "expiration_date": (timezone.localdate() + timedelta(days=30)).isoformat(),
            "file": uploaded_file,
        }
        return payload

    def test_accepts_jpg(self):
        self._authenticate()
        response = self.client.post(self.documents_url, self._payload(self._make_image_file(ext="jpg", content_type="image/jpeg")))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_accepts_jpeg(self):
        self._authenticate()
        response = self.client.post(self.documents_url, self._payload(self._make_image_file(ext="jpeg", content_type="image/jpeg")))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_accepts_png(self):
        self._authenticate()
        response = self.client.post(self.documents_url, self._payload(self._make_image_file(ext="png", content_type="image/png")))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_accepts_webp(self):
        self._authenticate()
        response = self.client.post(self.documents_url, self._payload(self._make_image_file(ext="webp", content_type="image/webp")))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_accepts_pdf(self):
        self._authenticate()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.documents_url, self._payload(self._make_pdf_file(valid=True)))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        document = ClientDocument.objects.latest("id")
        self.assertTrue(
            Notification.objects.filter(
                user=self.user,
                notification_type="DOCUMENT_UPLOADED",
                title="Document transmis",
                related_object_type="document",
                related_object_id=document.id,
            ).exists()
        )
        self.assertEqual(
            response.data["file"],
            reverse("accounts:users-me-documents-file", kwargs={"pk": document.id}),
        )

    def test_license_upload_without_declared_type_stays_pending_and_unverified(self):
        self._authenticate()
        payload = self._payload(
            self._make_pdf_file(valid=True),
            doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
        )
        response = self.client.post(self.documents_url, payload)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = ClientDocument.objects.latest("id")
        self.addCleanup(document.file.delete, save=False)
        self.assertEqual(document.status, ClientDocument.Status.EN_ATTENTE)
        self.assertIsNone(document.driving_license_transmission_declared)
        self.assertIsNone(document.driving_license_transmission)
        self.assertIsNone(document.driving_license_category)

    def test_license_upload_accepts_optional_declaration_without_validating_it(self):
        self._authenticate()
        payload = self._payload(
            self._make_pdf_file(valid=True),
            doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
        )
        payload["driving_license_transmission_declared"] = (
            ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY
        )

        response = self.client.post(self.documents_url, payload)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = ClientDocument.objects.latest("id")
        self.addCleanup(document.file.delete, save=False)
        self.assertEqual(
            document.driving_license_transmission_declared,
            ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY,
        )
        self.assertEqual(document.status, ClientDocument.Status.EN_ATTENTE)
        self.assertIsNone(document.driving_license_transmission)
        self.assertIsNone(document.driving_license_category)

    def test_owner_can_view_uploaded_document_through_private_endpoint(self):
        self._authenticate()
        response = self.client.post(
            self.documents_url,
            self._payload(self._make_image_file(ext="png", content_type="image/png")),
        )
        document = ClientDocument.objects.latest("id")
        self.addCleanup(document.file.delete, save=False)

        file_url = reverse("accounts:users-me-documents-file", kwargs={"pk": document.id})
        preview = self.client.get(file_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        self.assertEqual(preview["Content-Type"], "image/png")
        self.assertEqual(preview["Cache-Control"], "private, no-store")
        self.assertEqual(preview["X-Content-Type-Options"], "nosniff")
        self.assertTrue(b"".join(preview.streaming_content).startswith(b"\x89PNG"))

    def test_document_file_is_not_available_from_public_media_url(self):
        self._authenticate()
        response = self.client.post(
            self.documents_url,
            self._payload(self._make_pdf_file(valid=True)),
        )
        document = ClientDocument.objects.latest("id")
        self.addCleanup(document.file.delete, save=False)

        public_url = f"/media/{document.file.name}"
        response = self.client.get(public_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


    def test_rejects_forbidden_extension(self):
        self._authenticate()
        bad_file = SimpleUploadedFile("evil.exe", b"MZ", content_type="application/octet-stream")
        response = self.client.post(self.documents_url, self._payload(bad_file))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_fake_mime(self):
        self._authenticate()
        response = self.client.post(
            self.documents_url,
            self._payload(self._make_image_file(ext="png", content_type="application/pdf")),
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_corrupted_image(self):
        self._authenticate()
        corrupted = SimpleUploadedFile("bad.png", b"not an image", content_type="image/png")
        response = self.client.post(self.documents_url, self._payload(corrupted))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_fake_pdf(self):
        self._authenticate()
        response = self.client.post(self.documents_url, self._payload(self._make_pdf_file(valid=False)))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_too_large_file(self):
        self._authenticate()
        large = SimpleUploadedFile("large.pdf", b"%PDF-" + b"a" * 3000, content_type="application/pdf")
        response = self.client.post(self.documents_url, self._payload(large))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_missing_document_number(self):
        self._authenticate()
        payload = self._payload(self._make_pdf_file(valid=True))
        payload["document_number"] = "   "
        response = self.client.post(self.documents_url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_past_expiration_date(self):
        self._authenticate()
        payload = self._payload(self._make_pdf_file(valid=True))
        payload["expiration_date"] = (timezone.localdate() - timedelta(days=1)).isoformat()
        response = self.client.post(self.documents_url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_old_active_document_is_deactivated(self):
        self._authenticate()
        today = timezone.localdate()
        old_doc = ClientDocument.objects.create(
            client=self.profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="OLD-123",
            file="client_documents/old.pdf",
            expiration_date=today + timedelta(days=60),
            status=ClientDocument.Status.EN_ATTENTE,
            is_active=True,
        )

        response = self.client.post(self.documents_url, self._payload(self._make_pdf_file(valid=True)))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        old_doc.refresh_from_db()
        self.assertFalse(old_doc.is_active)

    def test_replacing_valid_document_creates_a_new_pending_document(self):
        manager = create_user(
            email="docs-manager@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        old_document = ClientDocument.objects.create(
            client=self.profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="APPROVED-OLD",
            file="client_documents/approved-old.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.VALIDE,
            validated_at=timezone.now(),
            validated_by=manager,
            is_active=True,
        )
        ClientDocument.objects.create(
            client=self.profile,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            document_number="LICENSE-APPROVED",
            file="client_documents/approved-license.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.VALIDE,
            validated_at=timezone.now(),
            validated_by=manager,
            is_active=True,
        )
        self._authenticate()

        response = self.client.post(
            self.documents_url,
            self._payload(self._make_pdf_file(valid=True)),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        old_document.refresh_from_db()
        replacement = ClientDocument.objects.latest("id")
        self.addCleanup(replacement.file.delete, save=False)
        self.assertFalse(old_document.is_active)
        self.assertEqual(replacement.status, ClientDocument.Status.EN_ATTENTE)
        self.assertIsNone(replacement.validated_at)
        self.assertIsNone(replacement.validated_by)
        self.assertTrue(replacement.is_active)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.profile_status, ClientProfile.ProfileStatus.EN_ATTENTE)

    def test_replacing_valid_license_requires_new_license_details(self):
        manager = create_user(
            email="license-manager@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
        )
        old_license = ClientDocument.objects.create(
            client=self.profile,
            document_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            document_number="LICENSE-OLD",
            file="client_documents/license-old.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.VALIDE,
            driving_license_category=ClientDocument.DrivingLicenseCategory.B,
            driving_license_transmission=ClientDocument.DrivingLicenseTransmission.AUTOMATIC_ONLY,
            validated_at=timezone.now(),
            validated_by=manager,
            is_active=True,
        )
        self._authenticate()

        response = self.client.post(
            self.documents_url,
            self._payload(
                self._make_pdf_file(valid=True),
                doc_type=ClientDocument.DocumentType.PERMIS_CONDUIRE,
            ),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        old_license.refresh_from_db()
        replacement = ClientDocument.objects.latest("id")
        self.addCleanup(replacement.file.delete, save=False)
        self.assertFalse(old_license.is_active)
        self.assertEqual(replacement.status, ClientDocument.Status.EN_ATTENTE)
        self.assertIsNone(replacement.driving_license_category)
        self.assertIsNone(replacement.driving_license_transmission)

    def test_client_sees_only_own_documents(self):
        other_user = create_user(
            email="docs-other@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        other_profile = ClientProfile.objects.create(user=other_user)

        ClientDocument.objects.create(
            client=self.profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="OWN-1",
            file="client_documents/own.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.EN_ATTENTE,
            is_active=True,
        )
        ClientDocument.objects.create(
            client=other_profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="OTHER-1",
            file="client_documents/other.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.EN_ATTENTE,
            is_active=True,
        )

        self._authenticate()
        response = self.client.get(self.documents_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["document_number"], "OWN-1")

    def test_expired_valid_document_is_reported_without_changing_document_history(self):
        today = timezone.localdate()
        document = ClientDocument.objects.create(
            client=self.profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="EXPIRED-IDENTITY",
            file="client_documents/expired-identity.pdf",
            expiration_date=today - timedelta(days=1),
            status=ClientDocument.Status.VALIDE,
            is_active=True,
        )
        self.profile.profile_status = ClientProfile.ProfileStatus.VALIDE
        self.profile.save(update_fields=["profile_status"])
        self._authenticate()

        documents_response = self.client.get(self.documents_url)
        profile_response = self.client.get(reverse("accounts:users-me"))

        self.assertEqual(documents_response.status_code, status.HTTP_200_OK)
        self.assertEqual(documents_response.data["results"][0]["status"], ClientDocument.Status.EXPIRE)
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_response.data["profile_status"], ClientProfile.ProfileStatus.INCOMPLET)
        document.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(document.status, ClientDocument.Status.VALIDE)
        self.assertEqual(self.profile.profile_status, ClientProfile.ProfileStatus.INCOMPLET)

    def test_client_cannot_access_another_client_document_detail(self):
        other_user = create_user(
            email="docs-other2@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        other_profile = ClientProfile.objects.create(user=other_user)

        foreign_doc = ClientDocument.objects.create(
            client=other_profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="OTHER-2",
            file="client_documents/other2.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            status=ClientDocument.Status.EN_ATTENTE,
            is_active=True,
        )

        self._authenticate()
        detail_url = reverse("accounts:users-me-documents-detail", kwargs={"pk": foreign_doc.pk})
        response = self.client.get(detail_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_client_cannot_view_another_clients_document_file(self):
        other_user = create_user(
            email="docs-other-file@example.com",
            password="StrongPass123!",
            role=self.roles[Role.Code.CLIENT],
        )
        other_profile = ClientProfile.objects.create(user=other_user)
        foreign_doc = ClientDocument.objects.create(
            client=other_profile,
            document_type=ClientDocument.DocumentType.CARTE_IDENTITE,
            document_number="OTHER-FILE",
            file="client_documents/other-file.pdf",
            expiration_date=timezone.localdate() + timedelta(days=90),
            is_active=True,
        )

        self._authenticate()
        response = self.client.get(
            reverse("accounts:users-me-documents-file", kwargs={"pk": foreign_doc.pk})
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
