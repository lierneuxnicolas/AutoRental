from datetime import timedelta
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Role
from accounts.tests.utils import create_user, ensure_roles
from accounts.models import ClientProfile
from inspections.models import Damage, Inspection, InspectionPhoto
from notifications.models import Notification
from payments.models import Deposit, Payment
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


def _create_test_image_file(name="photo.jpg", image_format="JPEG", content_type="image/jpeg"):
    buffer = BytesIO()
    image = Image.new("RGB", (10, 10), color="red")
    image.save(buffer, format=image_format)
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=content_type)


def _create_corrupted_image_file(name="broken.jpg", content_type="image/jpeg"):
    return SimpleUploadedFile(name, b"not-an-image", content_type=content_type)


class DepartureInspectionTests(TestCase):
    def setUp(self):
        roles = ensure_roles()
        self.client_user = create_user(
            email="departure-client@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        ClientProfile.objects.create(user=self.client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        self.api = APIClient()

        self.brand = Brand.objects.create(name="Brand X", is_active=True)
        self.category = VehicleCategory.objects.create(
            name="Category X",
            description="Test",
            daily_rate=100,
            hourly_rate=15,
            minimum_deposit=300,
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(name="P1", address="Addr", capacity=10, is_active=True)
        space = ParkingSpace.objects.create(parking=parking, number="A1", is_active=True)
        self.vehicle = Vehicle.objects.create(
            brand=self.brand,
            category=self.category,
            parking_space=space,
            registration_number="DEP-001",
            model_name="Model",
            year=2024,
            color="Black",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1000,
            status=Vehicle.Status.DISPONIBLE,
            is_active=True,
        )

    def _reservation(self, *, start_at, status=Reservation.Status.CONFIRMEE, client=None):
        return Reservation.objects.create(
            client=(client or self.client_user.client_profile),
            vehicle=self.vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=3),
            status=status,
            confirmed_at=start_at - timedelta(days=1),
            rental_amount=120,
            deposit_amount=300,
        )

    def _authorize(self, reservation):
        Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=reservation.deposit_amount,
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
        )
        Payment.objects.create(
            reservation=reservation,
            provider=Payment.Provider.STRIPE,
            amount=reservation.rental_amount,
            currency="EUR",
            status=Payment.Status.REUSSI,
            succeeded_at=timezone.now(),
        )

    def test_creates_initial_inspection(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(minutes=5))
        self._authorize(reservation)
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["inspection"]["inspection_type"], Inspection.Type.INITIAL)
        self.assertEqual(response.data["inspection"]["status"], Inspection.Status.BROUILLON)
        self.assertIn("mileage", response.data["missing_fields"])
        self.assertTrue(Inspection.objects.filter(reservation=reservation, inspection_type=Inspection.Type.INITIAL).exists())

    def test_refuses_without_successful_payment(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(minutes=5))
        Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=reservation.deposit_amount,
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
        )
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "PAYMENT_NOT_SUCCESSFUL")

    def test_refuses_too_early(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(hours=4))
        self._authorize(reservation)
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "TOO_EARLY")


class InspectionMediaUploadTests(TestCase):
    def setUp(self):
        roles = ensure_roles()
        self.client_user = create_user(
            email="inspection-client@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.other_client_user = create_user(
            email="inspection-other@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        ClientProfile.objects.create(user=self.client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        ClientProfile.objects.create(user=self.other_client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        self.api = APIClient()

        brand = Brand.objects.create(name="Brand Y", is_active=True)
        category = VehicleCategory.objects.create(
            name="Category Y",
            description="Test",
            daily_rate=100,
            hourly_rate=15,
            minimum_deposit=300,
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(name="P2", address="Addr", capacity=10, is_active=True)
        space = ParkingSpace.objects.create(parking=parking, number="B1", is_active=True)
        self.vehicle = Vehicle.objects.create(
            brand=brand,
            category=category,
            parking_space=space,
            registration_number="INS-001",
            model_name="Model",
            year=2024,
            color="Blue",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1000,
            status=Vehicle.Status.DISPONIBLE,
            is_active=True,
        )
        self.reservation = Reservation.objects.create(
            client=self.client_user.client_profile,
            vehicle=self.vehicle,
            start_at=timezone.now() + timedelta(hours=1),
            end_at=timezone.now() + timedelta(hours=4),
            status=Reservation.Status.CONFIRMEE,
            confirmed_at=timezone.now(),
            rental_amount=120,
            deposit_amount=300,
        )
        self.other_reservation = Reservation.objects.create(
            client=self.other_client_user.client_profile,
            vehicle=self.vehicle,
            start_at=timezone.now() + timedelta(hours=1),
            end_at=timezone.now() + timedelta(hours=4),
            status=Reservation.Status.CONFIRMEE,
            confirmed_at=timezone.now(),
            rental_amount=120,
            deposit_amount=300,
        )
        self.terminated_reservation = Reservation.objects.create(
            client=self.client_user.client_profile,
            vehicle=self.vehicle,
            start_at=timezone.now() + timedelta(hours=2),
            end_at=timezone.now() + timedelta(hours=5),
            status=Reservation.Status.TERMINEE,
            confirmed_at=timezone.now(),
            rental_amount=120,
            deposit_amount=300,
        )
        self.initial_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.EN_COURS,
        )
        self.final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
        )
        self.terminated_inspection = Inspection.objects.create(
            reservation=self.terminated_reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.TERMINE,
        )
        self.other_inspection = Inspection.objects.create(
            reservation=self.other_reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.EN_COURS,
        )

    def _photo_url(self, inspection_id):
        return reverse("inspections:inspection-photos-create", kwargs={"pk": inspection_id})

    def _damage_url(self, inspection_id):
        return reverse("inspections:inspection-damages-create", kwargs={"pk": inspection_id})

    def test_add_jpg_photo(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.initial_inspection.id),
            {"file": _create_test_image_file("photo.jpg", "JPEG", "image/jpeg"), "photo_type": InspectionPhoto.PhotoType.AVANT},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["file"].startswith("http"))

    def test_add_webp_photo(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.initial_inspection.id),
            {"file": _create_test_image_file("photo.webp", "WEBP", "image/webp"), "photo_type": InspectionPhoto.PhotoType.ARRIERE},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_pdf_photo_rejected(self):
        self.api.force_authenticate(self.client_user)
        pdf = SimpleUploadedFile("photo.pdf", b"%PDF-1.5\n", content_type="application/pdf")
        response = self.api.post(
            self._photo_url(self.initial_inspection.id),
            {"file": pdf, "photo_type": InspectionPhoto.PhotoType.AVANT},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)

    def test_corrupted_photo_rejected(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.initial_inspection.id),
            {"file": _create_corrupted_image_file(), "photo_type": InspectionPhoto.PhotoType.AVANT},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)

    def test_too_large_photo_rejected(self):
        self.api.force_authenticate(self.client_user)
        big = SimpleUploadedFile("big.jpg", b"x" * 2048, content_type="image/jpeg")
        with self.settings(INSPECTION_PHOTO_MAX_SIZE=1024):
            response = self.api.post(
                self._photo_url(self.initial_inspection.id),
                {"file": big, "photo_type": InspectionPhoto.PhotoType.AVANT},
                format="multipart",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)

    def test_client_cannot_add_photo_to_other_client_inspection(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.other_inspection.id),
            {"file": _create_test_image_file("x.jpg", "JPEG", "image/jpeg"), "photo_type": InspectionPhoto.PhotoType.AVANT},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_terminated_inspection_rejected(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.terminated_inspection.id),
            {"file": _create_test_image_file("x.jpg", "JPEG", "image/jpeg"), "photo_type": InspectionPhoto.PhotoType.AVANT},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_damage_can_reference_photos(self):
        self.api.force_authenticate(self.client_user)
        photo = InspectionPhoto.objects.create(
            inspection=self.initial_inspection,
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            file=_create_test_image_file("damage.jpg", "JPEG", "image/jpeg"),
        )
        response = self.api.post(
            self._damage_url(self.initial_inspection.id),
            {
                "description": "Rayure sur la porte",
                "severity": Damage.Severity.MINEUR,
                "location": "Porte avant gauche",
                "photo_ids": [photo.id],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["photo_ids"], [photo.id])

    def test_damage_rejects_photos_from_other_inspection(self):
        self.api.force_authenticate(self.client_user)
        other_photo = InspectionPhoto.objects.create(
            inspection=self.final_inspection,
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            file=_create_test_image_file("damage2.jpg", "JPEG", "image/jpeg"),
        )
        response = self.api.post(
            self._damage_url(self.initial_inspection.id),
            {
                "description": "Rayure",
                "severity": Damage.Severity.MINEUR,
                "location": "Porte",
                "photo_ids": [other_photo.id],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("photo_ids", response.data)

    def test_damage_rejects_other_client_inspection(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._damage_url(self.other_inspection.id),
            {
                "description": "Rayure",
                "severity": Damage.Severity.MINEUR,
                "location": "Porte",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class DepartureInspectionCompletionTests(TestCase):
    def setUp(self):
        roles = ensure_roles()
        self.client_user = create_user(
            email="inspection-complete@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.other_client_user = create_user(
            email="inspection-complete-other@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        ClientProfile.objects.create(user=self.client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        ClientProfile.objects.create(user=self.other_client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        self.api = APIClient()

        brand = Brand.objects.create(name="Brand Z", is_active=True)
        category = VehicleCategory.objects.create(
            name="Category Z",
            description="Test",
            daily_rate=100,
            hourly_rate=15,
            minimum_deposit=300,
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(name="P3", address="Addr", capacity=10, is_active=True)
        space = ParkingSpace.objects.create(parking=parking, number="C1", is_active=True)
        self.vehicle = Vehicle.objects.create(
            brand=brand,
            category=category,
            parking_space=space,
            registration_number="CMP-001",
            model_name="Model",
            year=2024,
            color="White",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1000,
            status=Vehicle.Status.DISPONIBLE,
            is_active=True,
        )
        self.reservation = Reservation.objects.create(
            client=self.client_user.client_profile,
            vehicle=self.vehicle,
            start_at=timezone.now() + timedelta(minutes=5),
            end_at=timezone.now() + timedelta(hours=3),
            status=Reservation.Status.CONFIRMEE,
            confirmed_at=timezone.now() - timedelta(days=1),
            rental_amount=120,
            deposit_amount=300,
        )
        self.initial_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.EN_COURS,
        )
        Deposit.objects.create(
            reservation=self.reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=self.reservation.deposit_amount,
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
        )
        Payment.objects.create(
            reservation=self.reservation,
            provider=Payment.Provider.STRIPE,
            amount=self.reservation.rental_amount,
            currency="EUR",
            status=Payment.Status.REUSSI,
            succeeded_at=timezone.now(),
        )

        for photo_type in [
            InspectionPhoto.PhotoType.AVANT,
            InspectionPhoto.PhotoType.ARRIERE,
            InspectionPhoto.PhotoType.COTE_GAUCHE,
            InspectionPhoto.PhotoType.COTE_DROIT,
            InspectionPhoto.PhotoType.INTERIEUR,
            InspectionPhoto.PhotoType.TABLEAU_DE_BORD,
        ]:
            InspectionPhoto.objects.create(
                inspection=self.initial_inspection,
                photo_type=photo_type,
                file=_create_test_image_file(f"{photo_type}.jpg", "JPEG", "image/jpeg"),
                position=0,
            )

    def _complete_url(self, inspection_id):
        return reverse("inspections:inspection-complete", kwargs={"pk": inspection_id})

    def test_completes_initial_departure_inspection(self):
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.api.post(
                self._complete_url(self.initial_inspection.id),
                {"mileage": 1200, "energy_level_percent": 80, "comments": "Pret pour le depart"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.initial_inspection.refresh_from_db()
        self.reservation.refresh_from_db()
        self.vehicle.refresh_from_db()
        self.assertEqual(self.initial_inspection.status, Inspection.Status.TERMINE)
        self.assertEqual(self.initial_inspection.completed_by, self.client_user)
        self.assertEqual(self.initial_inspection.mileage, 1200)
        self.assertEqual(self.initial_inspection.energy_level_percent, 80)
        self.assertEqual(self.reservation.status, Reservation.Status.EN_COURS)
        self.assertEqual(self.vehicle.status, Vehicle.Status.LOUE)
        self.assertEqual(self.vehicle.mileage, 1200)
        self.assertEqual(
            Notification.objects.filter(
                user=self.client_user,
                notification_type="DEPARTURE_INSPECTION_COMPLETED",
                related_object_type="Inspection",
                related_object_id=self.initial_inspection.id,
            ).count(),
            1,
        )

    def test_refuses_second_completion_without_duplicate_notification(self):
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            first_response = self.api.post(
                self._complete_url(self.initial_inspection.id),
                {"mileage": 1200, "energy_level_percent": 80},
                format="json",
            )

        notifications_after_first = Notification.objects.filter(
            user=self.client_user,
            notification_type="DEPARTURE_INSPECTION_COMPLETED",
            related_object_type="Inspection",
            related_object_id=self.initial_inspection.id,
        ).count()

        with self.captureOnCommitCallbacks(execute=True):
            second_response = self.api.post(
                self._complete_url(self.initial_inspection.id),
                {"mileage": 1250, "energy_level_percent": 70},
                format="json",
            )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second_response.data["code"], "INSPECTION_ALREADY_COMPLETED")
        self.assertEqual(
            Notification.objects.filter(
                user=self.client_user,
                notification_type="DEPARTURE_INSPECTION_COMPLETED",
                related_object_type="Inspection",
                related_object_id=self.initial_inspection.id,
            ).count(),
            notifications_after_first,
        )

    def test_refuses_when_mandatory_photo_is_missing(self):
        self.api.force_authenticate(self.client_user)
        InspectionPhoto.objects.filter(
            inspection=self.initial_inspection,
            photo_type=InspectionPhoto.PhotoType.TABLEAU_DE_BORD,
        ).delete()

        response = self.api.post(
            self._complete_url(self.initial_inspection.id),
            {"mileage": 1200, "energy_level_percent": 80},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "MISSING_MANDATORY_PHOTOS")

    def test_refuses_when_critical_damage_is_unresolved(self):
        self.api.force_authenticate(self.client_user)
        Damage.objects.create(
            inspection=self.initial_inspection,
            vehicle=self.vehicle,
            reported_by=self.client_user,
            description="Batterie critique",
            severity=Damage.Severity.CRITIQUE,
            location="Tableau de bord",
            status=Damage.Status.A_ANALYSER,
        )

        response = self.api.post(
            self._complete_url(self.initial_inspection.id),
            {"mileage": 1200, "energy_level_percent": 80},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "CRITICAL_DAMAGE_UNRESOLVED")
