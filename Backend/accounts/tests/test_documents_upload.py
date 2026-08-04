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

    def _payload(self, uploaded_file, doc_type=ClientDocument.DocumentType.CARTE_IDENTITE):
        return {
            "document_type": doc_type,
            "document_number": "DOC-123",
            "expiration_date": (timezone.localdate() + timedelta(days=30)).isoformat(),
            "file": uploaded_file,
        }

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
