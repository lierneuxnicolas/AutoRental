from datetime import timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DataError, IntegrityError, transaction
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
from interventions.models import LockingLog, VehicleAccess
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


class InspectionModelConstraintsTests(TestCase):
    def setUp(self):
        roles = ensure_roles()
        self.client_user = create_user(
            email="inspection-models@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        ClientProfile.objects.create(user=self.client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)

        brand = Brand.objects.create(name="Brand M", is_active=True)
        category = VehicleCategory.objects.create(
            name="Category M",
            description="Test",
            daily_rate=100,
            hourly_rate=15,
            minimum_deposit=300,
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(name="PM", address="Addr", capacity=10, is_active=True)
        space = ParkingSpace.objects.create(parking=parking, number="M1", is_active=True)
        vehicle = Vehicle.objects.create(
            brand=brand,
            category=category,
            parking_space=space,
            registration_number="MOD-001",
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
        now = timezone.now()
        self.reservation = Reservation.objects.create(
            client=self.client_user.client_profile,
            vehicle=vehicle,
            start_at=now + timedelta(hours=1),
            end_at=now + timedelta(hours=4),
            status=Reservation.Status.CONFIRMEE,
            confirmed_at=now,
            rental_amount=120,
            deposit_amount=300,
        )

    def test_one_initial_max_per_reservation(self):
        Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.BROUILLON,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Inspection.objects.create(
                    reservation=self.reservation,
                    inspection_type=Inspection.Type.INITIAL,
                    status=Inspection.Status.BROUILLON,
                )

    def test_one_final_max_per_reservation(self):
        Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.BROUILLON,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Inspection.objects.create(
                    reservation=self.reservation,
                    inspection_type=Inspection.Type.FINAL,
                    status=Inspection.Status.BROUILLON,
                )

    def test_inspection_type_must_be_exact_choice(self):
        inspection = Inspection(
            reservation=self.reservation,
            inspection_type="WRONG_TYPE",
            status=Inspection.Status.BROUILLON,
        )

        with self.assertRaisesMessage(Exception, "inspection_type"):
            inspection.full_clean()

    def test_energy_level_must_be_between_0_and_100(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Inspection.objects.create(
                    reservation=self.reservation,
                    inspection_type=Inspection.Type.INITIAL,
                    status=Inspection.Status.BROUILLON,
                    energy_level_percent=101,
                )

    def test_mileage_must_be_non_negative(self):
        with self.assertRaises((IntegrityError, DataError)):
            with transaction.atomic():
                Inspection.objects.create(
                    reservation=self.reservation,
                    inspection_type=Inspection.Type.INITIAL,
                    status=Inspection.Status.BROUILLON,
                    mileage=-1,
                )

    def test_completed_at_requires_terminated_status(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Inspection.objects.create(
                    reservation=self.reservation,
                    inspection_type=Inspection.Type.INITIAL,
                    status=Inspection.Status.EN_COURS,
                    completed_at=timezone.now(),
                )


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
        self.other_client_user = create_user(
            email="departure-other@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        ClientProfile.objects.create(user=self.client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        ClientProfile.objects.create(user=self.other_client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
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

    def test_refuses_too_late(self):
        reservation = self._reservation(start_at=timezone.now() - timedelta(hours=3))
        self._authorize(reservation)
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "TOO_LATE")

    def test_refuses_other_client_for_departure_creation(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(minutes=5))
        self._authorize(reservation)
        self.api.force_authenticate(self.other_client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_refuses_when_reservation_is_not_confirmed(self):
        reservation = self._reservation(
            start_at=timezone.now() + timedelta(minutes=5),
            status=Reservation.Status.EN_COURS,
        )
        self._authorize(reservation)
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "INVALID_RESERVATION_STATUS")

    def test_accepts_departure_within_tolerance_window(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(minutes=20))
        self._authorize(reservation)
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_refuses_when_departure_inspection_already_exists(self):
        reservation = self._reservation(start_at=timezone.now() + timedelta(minutes=5))
        self._authorize(reservation)
        Inspection.objects.create(
            reservation=reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.BROUILLON,
        )
        self.api.force_authenticate(self.client_user)

        with self.settings(
            DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
            DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
        ):
            response = self.api.post(reverse("reservations:reservation-departure-inspection", kwargs={"pk": reservation.id}), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "INSPECTION_ALREADY_EXISTS")


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

    def _upload_photo(self, *, photo_type, position=None, name="photo.jpg"):
        payload = {"file": _create_test_image_file(name, "JPEG", "image/jpeg"), "photo_type": photo_type}
        if position is not None:
            payload["position"] = position

        return self.api.post(self._photo_url(self.initial_inspection.id), payload, format="multipart")

    def test_add_jpg_photo(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.initial_inspection.id),
            {"file": _create_test_image_file("photo.jpg", "JPEG", "image/jpeg"), "photo_type": InspectionPhoto.PhotoType.AVANT},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["file"].startswith("http"))

    def test_add_png_photo(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.initial_inspection.id),
            {"file": _create_test_image_file("photo.png", "PNG", "image/png"), "photo_type": InspectionPhoto.PhotoType.COTE_GAUCHE},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_add_webp_photo(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(
            self._photo_url(self.initial_inspection.id),
            {"file": _create_test_image_file("photo.webp", "WEBP", "image/webp"), "photo_type": InspectionPhoto.PhotoType.ARRIERE},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_add_all_required_photo_slots(self):
        self.api.force_authenticate(self.client_user)

        cases = [
            ("AVANT", InspectionPhoto.PhotoType.AVANT, None, 0),
            ("ARRIERE", InspectionPhoto.PhotoType.ARRIERE, None, 0),
            ("COTE_GAUCHE", InspectionPhoto.PhotoType.COTE_GAUCHE, None, 0),
            ("COTE_DROIT", InspectionPhoto.PhotoType.COTE_DROIT, None, 0),
            ("TABLEAU_DE_BORD", InspectionPhoto.PhotoType.TABLEAU_DE_BORD, None, 0),
            ("INTERIEUR_AVANT", InspectionPhoto.PhotoType.INTERIEUR, 1, 1),
            ("INTERIEUR_ARRIERE", InspectionPhoto.PhotoType.INTERIEUR, 2, 2),
            ("AUTRE", InspectionPhoto.PhotoType.AUTRE, 1, 1),
        ]

        for label, photo_type, position, expected_position in cases:
            with self.subTest(label=label):
                response = self._upload_photo(photo_type=photo_type, position=position, name=f"{label.lower()}.jpg")
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertEqual(response.data["photo_type"], photo_type)
                self.assertEqual(response.data["position"], expected_position)

                self.assertTrue(
                    InspectionPhoto.objects.filter(
                        inspection=self.initial_inspection,
                        photo_type=photo_type,
                        position=expected_position,
                    ).exists()
                )

        self.assertEqual(InspectionPhoto.objects.filter(inspection=self.initial_inspection).count(), len(cases))

    def test_upload_replaces_existing_slot_photo(self):
        self.api.force_authenticate(self.client_user)

        first_response = self._upload_photo(photo_type=InspectionPhoto.PhotoType.INTERIEUR, position=1, name="first.jpg")
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)

        first_photo = InspectionPhoto.objects.get(pk=first_response.data["id"])
        first_file_name = first_photo.file.name

        second_response = self._upload_photo(photo_type=InspectionPhoto.PhotoType.INTERIEUR, position=1, name="second.jpg")
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)

        self.assertEqual(InspectionPhoto.objects.filter(inspection=self.initial_inspection, photo_type=InspectionPhoto.PhotoType.INTERIEUR, position=1).count(), 1)

        first_photo.refresh_from_db()
        self.assertEqual(first_photo.id, second_response.data["id"])
        self.assertNotEqual(first_file_name, first_photo.file.name)
        self.assertEqual(second_response.data["photo_type"], InspectionPhoto.PhotoType.INTERIEUR)
        self.assertEqual(second_response.data["position"], 1)

    def test_upload_damage_photo_position_1_allowed(self):
        self.api.force_authenticate(self.client_user)

        response = self._upload_photo(
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            position=1,
            name="damage-pos1.jpg",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["inspection"], self.initial_inspection.id)
        self.assertEqual(response.data["photo_type"], InspectionPhoto.PhotoType.DOMMAGE)
        self.assertEqual(response.data["position"], 1)
        self.assertTrue(
            InspectionPhoto.objects.filter(
                inspection=self.initial_inspection,
                photo_type=InspectionPhoto.PhotoType.DOMMAGE,
                position=1,
            ).exists()
        )

    def test_upload_damage_photo_position_2_allowed(self):
        self.api.force_authenticate(self.client_user)

        response = self._upload_photo(
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            position=2,
            name="damage-pos2.jpg",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["inspection"], self.initial_inspection.id)
        self.assertEqual(response.data["photo_type"], InspectionPhoto.PhotoType.DOMMAGE)
        self.assertEqual(response.data["position"], 2)
        self.assertTrue(
            InspectionPhoto.objects.filter(
                inspection=self.initial_inspection,
                photo_type=InspectionPhoto.PhotoType.DOMMAGE,
                position=2,
            ).exists()
        )

    def test_upload_damage_photo_position_3_rejected(self):
        self.api.force_authenticate(self.client_user)

        response = self._upload_photo(
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            position=3,
            name="damage-pos3.jpg",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("position", response.data)

    def test_upload_damage_photo_replaces_existing_same_slot(self):
        self.api.force_authenticate(self.client_user)

        first_response = self._upload_photo(
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            position=1,
            name="damage-first.jpg",
        )
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)

        first_photo = InspectionPhoto.objects.get(pk=first_response.data["id"])
        first_file_name = first_photo.file.name

        second_response = self._upload_photo(
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            position=1,
            name="damage-second.jpg",
        )
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)

        self.assertEqual(
            InspectionPhoto.objects.filter(
                inspection=self.initial_inspection,
                photo_type=InspectionPhoto.PhotoType.DOMMAGE,
                position=1,
            ).count(),
            1,
        )

        first_photo.refresh_from_db()
        self.assertEqual(first_photo.id, second_response.data["id"])
        self.assertNotEqual(first_file_name, first_photo.file.name)

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


class DepartureVehicleStateApiTests(TestCase):
    def setUp(self):
        roles = ensure_roles()
        self.client_user = create_user(
            email="inspection-state@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.manager_user = create_user(
            email="inspection-state-manager@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.GESTIONNAIRE_COMPTABLE],
            email_verified=True,
            is_active=True,
        )
        ClientProfile.objects.create(user=self.client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        self.api = APIClient()

        brand = Brand.objects.create(name="Brand VS", is_active=True)
        category = VehicleCategory.objects.create(
            name="Category VS",
            description="Test",
            daily_rate=100,
            hourly_rate=15,
            minimum_deposit=300,
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(name="PVS", address="Addr", capacity=10, is_active=True)
        space = ParkingSpace.objects.create(parking=parking, number="VS1", is_active=True)
        self.vehicle = Vehicle.objects.create(
            brand=brand,
            category=category,
            parking_space=space,
            registration_number="STATE-001",
            model_name="Model",
            year=2024,
            color="White",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1000,
            status=Vehicle.Status.RESERVE,
            is_active=True,
        )

        self.reservation = Reservation.objects.create(
            client=self.client_user.client_profile,
            vehicle=self.vehicle,
            start_at=timezone.now() + timedelta(minutes=5),
            end_at=timezone.now() + timedelta(hours=4),
            status=Reservation.Status.CONFIRMEE,
            confirmed_at=timezone.now() - timedelta(hours=1),
            rental_amount=120,
            deposit_amount=300,
        )
        self.inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.EN_COURS,
            started_at=timezone.now(),
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
                inspection=self.inspection,
                photo_type=photo_type,
                file=_create_test_image_file(f"{photo_type}.jpg", "JPEG", "image/jpeg"),
                position=0,
            )

    def _state_url(self, inspection_id):
        return reverse("inspections:inspection-vehicle-state-upsert", kwargs={"pk": inspection_id})

    def _complete_url(self, inspection_id):
        return reverse("inspections:inspection-complete", kwargs={"pk": inspection_id})

    def test_vehicle_state_without_anomaly_creates_no_damage(self):
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._state_url(self.inspection.id),
            {
                "mileage": 1100,
                "energy_level_percent": 70,
                "anomaly_present": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["damage"])
        self.inspection.refresh_from_db()
        self.vehicle.refresh_from_db()
        self.assertEqual(self.inspection.mileage, 1100)
        self.assertEqual(self.inspection.energy_level_percent, 70)
        self.assertFalse(self.inspection.has_critical_issue)
        self.assertEqual(self.inspection.critical_issue_description, "")
        self.assertEqual(self.vehicle.status, Vehicle.Status.RESERVE)
        self.assertEqual(Damage.objects.filter(inspection=self.inspection).count(), 0)

    def test_minor_damage_allows_departure_completion(self):
        self.api.force_authenticate(self.client_user)

        state_response = self.api.post(
            self._state_url(self.inspection.id),
            {
                "mileage": 1120,
                "energy_level_percent": 68,
                "anomaly_present": True,
                "anomaly_description": "Rayure legere sur la porte",
                "anomaly_severity": Damage.Severity.MINEUR,
            },
            format="json",
        )

        self.assertEqual(state_response.status_code, status.HTTP_200_OK)
        damage_id = state_response.data["damage"]["id"]
        damage = Damage.objects.get(pk=damage_id)
        self.assertEqual(damage.severity, Damage.Severity.MINEUR)
        self.assertEqual(damage.evidence_photos.count(), 0)

        with self.captureOnCommitCallbacks(execute=True):
            completion_response = self.api.post(
                self._complete_url(self.inspection.id),
                {
                    "mileage": 1120,
                    "energy_level_percent": 68,
                    "comments": "Depart valide",
                },
                format="json",
            )

        self.assertEqual(completion_response.status_code, status.HTTP_200_OK)
        self.reservation.refresh_from_db()
        self.vehicle.refresh_from_db()
        self.assertEqual(self.reservation.status, Reservation.Status.EN_COURS)
        self.assertEqual(self.vehicle.status, Vehicle.Status.LOUE)

    def test_damage_photo_is_optional(self):
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._state_url(self.inspection.id),
            {
                "mileage": 1110,
                "energy_level_percent": 66,
                "anomaly_present": True,
                "anomaly_description": "Micro impact",
                "anomaly_severity": Damage.Severity.MODERE,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        damage = Damage.objects.get(pk=response.data["damage"]["id"])
        self.assertEqual(damage.evidence_photos.count(), 0)

    def test_vehicle_state_can_be_saved_after_departure_window_when_inspection_exists(self):
        self.api.force_authenticate(self.client_user)

        future_time = self.reservation.start_at + timedelta(hours=4)
        with patch("inspections.services.departure.timezone.now", return_value=future_time):
            response = self.api.post(
                self._state_url(self.inspection.id),
                {
                    "mileage": 1115,
                    "energy_level_percent": 67,
                    "anomaly_present": False,
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["damage"])
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.mileage, 1115)
        self.assertEqual(self.inspection.energy_level_percent, 67)

    def test_critical_damage_blocks_completion_sets_vehicle_status_and_notifies_manager(self):
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            state_response = self.api.post(
                self._state_url(self.inspection.id),
                {
                    "mileage": 1130,
                    "energy_level_percent": 72,
                    "anomaly_present": True,
                    "anomaly_description": "Voyant moteur rouge",
                    "anomaly_severity": Damage.Severity.CRITIQUE,
                },
                format="json",
            )

        self.assertEqual(state_response.status_code, status.HTTP_200_OK)
        self.inspection.refresh_from_db()
        self.vehicle.refresh_from_db()
        self.assertTrue(self.inspection.has_critical_issue)
        self.assertEqual(self.inspection.critical_issue_description, "Voyant moteur rouge")
        self.assertEqual(self.vehicle.status, Vehicle.Status.A_CONTROLER)

        self.assertEqual(
            Notification.objects.filter(
                user=self.manager_user,
                notification_type="VEHICLE_REQUIRES_REVIEW",
                related_object_type="Inspection",
                related_object_id=self.inspection.id,
            ).count(),
            1,
        )

        completion_response = self.api.post(
            self._complete_url(self.inspection.id),
            {
                "mileage": 1130,
                "energy_level_percent": 72,
                "comments": "Tentative de cloture",
            },
            format="json",
        )

        self.assertEqual(completion_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(completion_response.data["code"], "CRITICAL_ISSUE_UNRESOLVED")
        self.vehicle.refresh_from_db()
        self.assertEqual(self.vehicle.status, Vehicle.Status.A_CONTROLER)

    def test_critical_damage_notification_has_no_duplicate(self):
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            first = self.api.post(
                self._state_url(self.inspection.id),
                {
                    "mileage": 1140,
                    "energy_level_percent": 64,
                    "anomaly_present": True,
                    "anomaly_description": "Bruit moteur anormal",
                    "anomaly_severity": Damage.Severity.CRITIQUE,
                },
                format="json",
            )
            second = self.api.post(
                self._state_url(self.inspection.id),
                {
                    "mileage": 1141,
                    "energy_level_percent": 63,
                    "anomaly_present": True,
                    "anomaly_description": "Bruit moteur anormal persistant",
                    "anomaly_severity": Damage.Severity.CRITIQUE,
                },
                format="json",
            )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Notification.objects.filter(
                user=self.manager_user,
                notification_type="VEHICLE_REQUIRES_REVIEW",
                related_object_type="Inspection",
                related_object_id=self.inspection.id,
            ).count(),
            1,
        )

    def test_critical_damage_can_attach_existing_photos(self):
        self.api.force_authenticate(self.client_user)
        anomaly_photo = InspectionPhoto.objects.create(
            inspection=self.inspection,
            photo_type=InspectionPhoto.PhotoType.AUTRE,
            file=_create_test_image_file("anomaly.jpg", "JPEG", "image/jpeg"),
            position=1,
        )

        response = self.api.post(
            self._state_url(self.inspection.id),
            {
                "mileage": 1150,
                "energy_level_percent": 62,
                "anomaly_present": True,
                "anomaly_description": "Fuite visible",
                "anomaly_severity": Damage.Severity.CRITIQUE,
                "photo_ids": [anomaly_photo.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["damage"]["photo_ids"], [anomaly_photo.id])
        damage = Damage.objects.get(pk=response.data["damage"]["id"])
        self.assertEqual(list(damage.evidence_photos.values_list("id", flat=True)), [anomaly_photo.id])


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
        self.assertEqual(response.data["status"], Inspection.Status.TERMINE)
        self.assertEqual(response.data["comments"], "Pret pour le depart")
        self.assertIsNotNone(response.data["completed_at"])
        self.initial_inspection.refresh_from_db()
        self.reservation.refresh_from_db()
        self.vehicle.refresh_from_db()
        self.assertEqual(self.initial_inspection.status, Inspection.Status.TERMINE)
        self.assertEqual(self.initial_inspection.completed_by, self.client_user)
        self.assertEqual(self.initial_inspection.mileage, 1200)
        self.assertEqual(self.initial_inspection.energy_level_percent, 80)
        self.assertEqual(self.initial_inspection.comments, "Pret pour le depart")
        self.assertIsNotNone(self.initial_inspection.completed_at)
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

    def test_allows_completion_after_departure_window_when_inspection_was_created_in_time(self):
        self.api.force_authenticate(self.client_user)

        future_time = self.reservation.start_at + timedelta(hours=4)
        with patch("inspections.services.departure.timezone.now", return_value=future_time):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.api.post(
                    self._complete_url(self.initial_inspection.id),
                    {"mileage": 1200, "energy_level_percent": 80, "comments": "Cloture apres fenetre"},
                    format="json",
                )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Inspection.Status.TERMINE)
        self.initial_inspection.refresh_from_db()
        self.reservation.refresh_from_db()
        self.vehicle.refresh_from_db()
        self.assertEqual(self.initial_inspection.status, Inspection.Status.TERMINE)
        self.assertIsNotNone(self.initial_inspection.completed_at)
        self.assertEqual(self.reservation.status, Reservation.Status.EN_COURS)
        self.assertEqual(self.vehicle.status, Vehicle.Status.LOUE)
        self.assertEqual(self.vehicle.mileage, 1200)

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

    def test_refuses_when_mileage_is_missing(self):
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._complete_url(self.initial_inspection.id),
            {"energy_level_percent": 80},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("mileage", response.data)

    def test_refuses_when_energy_level_is_missing(self):
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._complete_url(self.initial_inspection.id),
            {"mileage": 1200},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("energy_level_percent", response.data)

    def test_refuses_when_critical_issue_flagged(self):
        self.api.force_authenticate(self.client_user)
        self.initial_inspection.has_critical_issue = True
        self.initial_inspection.critical_issue_description = "Bruit moteur"
        self.initial_inspection.save(update_fields=["has_critical_issue", "critical_issue_description", "updated_at"])

        response = self.api.post(
            self._complete_url(self.initial_inspection.id),
            {"mileage": 1200, "energy_level_percent": 80},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "CRITICAL_ISSUE_UNRESOLVED")


class ReturnInspectionFlowTests(TestCase):
    def setUp(self):
        roles = ensure_roles()
        self.client_user = create_user(
            email="inspection-return@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.other_client_user = create_user(
            email="inspection-return-other@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.CLIENT],
            email_verified=True,
            is_active=True,
        )
        self.manager_user = create_user(
            email="inspection-manager@example.com",
            password="StrongPass123!",
            role=roles[Role.Code.GESTIONNAIRE_COMPTABLE],
            email_verified=True,
            is_active=True,
        )
        ClientProfile.objects.create(user=self.client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        ClientProfile.objects.create(user=self.other_client_user, profile_status=ClientProfile.ProfileStatus.VALIDE)
        self.api = APIClient()

        brand = Brand.objects.create(name="Brand Return", is_active=True)
        category = VehicleCategory.objects.create(
            name="Category Return",
            description="Test",
            daily_rate=100,
            hourly_rate=15,
            minimum_deposit=300,
            minimum_rental_hours=1,
            is_active=True,
        )
        parking = Parking.objects.create(name="PR", address="Addr", capacity=10, is_active=True)
        space = ParkingSpace.objects.create(parking=parking, number="R1", is_active=True)
        self.vehicle = Vehicle.objects.create(
            brand=brand,
            category=category,
            parking_space=space,
            registration_number="RET-001",
            model_name="Model",
            year=2024,
            color="Gray",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1000,
            status=Vehicle.Status.LOUE,
            is_active=True,
        )

        now = timezone.now()
        self.reservation = Reservation.objects.create(
            client=self.client_user.client_profile,
            vehicle=self.vehicle,
            start_at=now - timedelta(days=1),
            end_at=now + timedelta(hours=1),
            status=Reservation.Status.EN_COURS,
            confirmed_at=now - timedelta(days=2),
            rental_amount=120,
            deposit_amount=300,
        )
        self.initial_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.TERMINE,
            mileage=1100,
            energy_level_percent=85,
            completed_at=now - timedelta(hours=1),
            completed_by=self.client_user,
        )

    def _create_return_url(self, reservation_id):
        return reverse("reservations:reservation-return-inspection", kwargs={"pk": reservation_id})

    def _complete_url(self, inspection_id):
        return reverse("inspections:inspection-complete", kwargs={"pk": inspection_id})

    def _state_url(self, inspection_id):
        return reverse("inspections:inspection-vehicle-state-upsert", kwargs={"pk": inspection_id})

    def _create_required_photos(self, inspection):
        for photo_type in [
            InspectionPhoto.PhotoType.AVANT,
            InspectionPhoto.PhotoType.ARRIERE,
            InspectionPhoto.PhotoType.COTE_GAUCHE,
            InspectionPhoto.PhotoType.COTE_DROIT,
            InspectionPhoto.PhotoType.INTERIEUR,
            InspectionPhoto.PhotoType.TABLEAU_DE_BORD,
        ]:
            InspectionPhoto.objects.create(
                inspection=inspection,
                photo_type=photo_type,
                file=_create_test_image_file(f"{photo_type}.jpg", "JPEG", "image/jpeg"),
                position=0,
            )

    def _create_active_unlocked_vehicle_access(self):
        now = timezone.now()
        return VehicleAccess.objects.create(
            reservation=self.reservation,
            vehicle=self.vehicle,
            client=self.client_user,
            status=VehicleAccess.Status.ACTIVE,
            lock_state=VehicleAccess.LockState.UNLOCKED,
            valid_from=now - timedelta(hours=1),
            valid_until=now + timedelta(hours=1),
            is_active=True,
        )

    def test_creates_final_inspection_in_draft(self):
        self.api.force_authenticate(self.client_user)
        response = self.api.post(self._create_return_url(self.reservation.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["inspection"]["inspection_type"], Inspection.Type.FINAL)
        self.assertEqual(response.data["inspection"]["status"], Inspection.Status.BROUILLON)
        self.assertTrue(
            Inspection.objects.filter(
                reservation=self.reservation,
                inspection_type=Inspection.Type.FINAL,
                status=Inspection.Status.BROUILLON,
            ).exists()
        )

    def test_refuses_final_creation_when_initial_not_completed(self):
        self.initial_inspection.status = Inspection.Status.EN_COURS
        self.initial_inspection.completed_at = None
        self.initial_inspection.save(update_fields=["status", "completed_at", "updated_at"])
        self.api.force_authenticate(self.client_user)

        response = self.api.post(self._create_return_url(self.reservation.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "INITIAL_INSPECTION_NOT_COMPLETED")

    def test_refuses_final_creation_when_initial_missing(self):
        self.initial_inspection.delete()
        self.api.force_authenticate(self.client_user)

        response = self.api.post(self._create_return_url(self.reservation.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "INITIAL_INSPECTION_MISSING")

    def test_refuses_final_creation_when_reservation_not_en_cours(self):
        self.reservation.status = Reservation.Status.CONFIRMEE
        self.reservation.save(update_fields=["status", "updated_at"])
        self.api.force_authenticate(self.client_user)

        response = self.api.post(self._create_return_url(self.reservation.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "INVALID_RESERVATION_STATUS")

    def test_refuses_final_creation_when_already_exists(self):
        Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.BROUILLON,
        )
        self.api.force_authenticate(self.client_user)

        response = self.api.post(self._create_return_url(self.reservation.id), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "RETURN_INSPECTION_ALREADY_EXISTS")

    def test_saves_return_vehicle_state_without_anomaly(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.BROUILLON,
        )
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._state_url(final_inspection.id),
            {
                "mileage": 1200,
                "energy_level_percent": 72,
                "anomaly_present": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["damage"])
        final_inspection.refresh_from_db()
        self.assertEqual(final_inspection.mileage, 1200)
        self.assertEqual(final_inspection.energy_level_percent, 72)
        self.assertFalse(final_inspection.has_critical_issue)
        self.assertEqual(final_inspection.critical_issue_description, "")
        self.assertEqual(Damage.objects.filter(inspection=final_inspection).count(), 0)

    def test_saves_return_vehicle_state_with_anomaly(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.BROUILLON,
        )
        photo = InspectionPhoto.objects.create(
            inspection=final_inspection,
            photo_type=InspectionPhoto.PhotoType.DOMMAGE,
            file=_create_test_image_file("damage.jpg", "JPEG", "image/jpeg"),
            position=1,
        )
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._state_url(final_inspection.id),
            {
                "mileage": 1210,
                "energy_level_percent": 65,
                "anomaly_present": True,
                "anomaly_description": "Rayure pare-chocs",
                "anomaly_severity": Damage.Severity.MODERE,
                "photo_ids": [photo.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data["damage"])
        final_inspection.refresh_from_db()
        self.assertEqual(final_inspection.mileage, 1210)
        self.assertEqual(final_inspection.energy_level_percent, 65)
        self.assertFalse(final_inspection.has_critical_issue)
        damage = Damage.objects.get(pk=response.data["damage"]["id"])
        self.assertEqual(damage.severity, Damage.Severity.MODERE)
        self.assertEqual(damage.description, "Rayure pare-chocs")
        self.assertEqual(list(damage.evidence_photos.values_list("id", flat=True)), [photo.id])

    def test_completes_return_inspection_and_applies_effects(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
        )
        self._create_required_photos(final_inspection)
        Deposit.objects.create(
            reservation=self.reservation,
            mode=Deposit.Mode.STRIPE_TEST,
            amount=Decimal("500.00"),
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
            stripe_payment_intent_id="pi_dep_return_001",
        )
        self._create_active_unlocked_vehicle_access()
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.api.post(
                self._complete_url(final_inspection.id),
                {"mileage": 1300, "energy_level_percent": 70, "comments": "Retour effectue"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["comments"], "Retour effectue")
        self.assertIsNotNone(response.data["completed_at"])
        final_inspection.refresh_from_db()
        self.reservation.refresh_from_db()
        self.vehicle.refresh_from_db()

        self.assertEqual(final_inspection.status, Inspection.Status.TERMINE)
        self.assertEqual(final_inspection.completed_by, self.client_user)
        self.assertEqual(final_inspection.mileage, 1300)
        self.assertEqual(final_inspection.energy_level_percent, 70)
        self.assertEqual(final_inspection.comments, "Retour effectue")
        self.assertIsNotNone(final_inspection.completed_at)
        self.assertEqual(self.reservation.status, Reservation.Status.TERMINEE)
        self.assertEqual(self.vehicle.status, Vehicle.Status.DISPONIBLE)
        self.assertEqual(self.vehicle.mileage, 1300)

        deposit = Deposit.objects.get(reservation=self.reservation)
        self.assertEqual(deposit.status, Deposit.Status.A_VERIFIER)
        self.assertIsNone(deposit.released_at)

        self.assertEqual(
            Notification.objects.filter(
                user=self.client_user,
                notification_type="RETURN_INSPECTION_COMPLETED",
                related_object_type="Inspection",
                related_object_id=final_inspection.id,
            ).count(),
            1,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.manager_user,
                notification_type="VEHICLE_REQUIRES_REVIEW",
                related_object_type="Inspection",
                related_object_id=final_inspection.id,
            ).count(),
            1,
        )
        manager_notification = Notification.objects.get(
            user=self.manager_user,
            notification_type="VEHICLE_REQUIRES_REVIEW",
            related_object_type="Inspection",
            related_object_id=final_inspection.id,
        )
        self.assertEqual(manager_notification.message, "Un véhicule restitué est en attente de vérification.")

    def test_completes_return_inspection_when_vehicle_already_locked(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
        )
        self._create_required_photos(final_inspection)
        Deposit.objects.create(
            reservation=self.reservation,
            mode=Deposit.Mode.STRIPE_TEST,
            amount=Decimal("500.00"),
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now(),
            stripe_payment_intent_id="pi_dep_return_002",
        )
        now = timezone.now()
        VehicleAccess.objects.create(
            reservation=self.reservation,
            vehicle=self.vehicle,
            client=self.client_user,
            status=VehicleAccess.Status.ACTIVE,
            lock_state=VehicleAccess.LockState.LOCKED,
            valid_from=now - timedelta(hours=1),
            valid_until=now + timedelta(hours=1),
            is_active=True,
        )
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.api.post(
                self._complete_url(final_inspection.id),
                {"mileage": 1310, "energy_level_percent": 66, "comments": "Retour avec vehicule deja verrouille"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        final_inspection.refresh_from_db()
        self.reservation.refresh_from_db()
        self.vehicle.refresh_from_db()

        self.assertEqual(final_inspection.status, Inspection.Status.TERMINE)
        self.assertEqual(self.reservation.status, Reservation.Status.TERMINEE)
        self.assertEqual(self.vehicle.status, Vehicle.Status.DISPONIBLE)

        access = VehicleAccess.objects.get(reservation=self.reservation)
        self.assertEqual(access.lock_state, VehicleAccess.LockState.LOCKED)

        self.assertFalse(
            LockingLog.objects.filter(
                reservation=self.reservation,
                action=LockingLog.Action.LOCK,
                result=LockingLog.Result.SUCCESS,
            ).exists()
        )

    def test_refuses_second_completion_without_duplicate_notifications(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
        )
        self._create_required_photos(final_inspection)
        self._create_active_unlocked_vehicle_access()
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            first_response = self.api.post(
                self._complete_url(final_inspection.id),
                {"mileage": 1300, "energy_level_percent": 70},
                format="json",
            )

        client_notifications = Notification.objects.filter(
            user=self.client_user,
            notification_type="RETURN_INSPECTION_COMPLETED",
            related_object_type="Inspection",
            related_object_id=final_inspection.id,
        ).count()
        manager_notifications = Notification.objects.filter(
            user=self.manager_user,
            notification_type="VEHICLE_REQUIRES_REVIEW",
            related_object_type="Inspection",
            related_object_id=final_inspection.id,
        ).count()

        with self.captureOnCommitCallbacks(execute=True):
            second_response = self.api.post(
                self._complete_url(final_inspection.id),
                {"mileage": 1320, "energy_level_percent": 65},
                format="json",
            )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(second_response.data["code"], "INSPECTION_ALREADY_COMPLETED")
        self.assertEqual(
            Notification.objects.filter(
                user=self.client_user,
                notification_type="RETURN_INSPECTION_COMPLETED",
                related_object_type="Inspection",
                related_object_id=final_inspection.id,
            ).count(),
            client_notifications,
        )
        self.assertEqual(
            Notification.objects.filter(
                user=self.manager_user,
                notification_type="VEHICLE_REQUIRES_REVIEW",
                related_object_type="Inspection",
                related_object_id=final_inspection.id,
            ).count(),
            manager_notifications,
        )

    def test_refuses_completion_when_mileage_is_lower_than_departure(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
        )
        self._create_required_photos(final_inspection)
        self._create_active_unlocked_vehicle_access()
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._complete_url(final_inspection.id),
            {"mileage": 1005, "energy_level_percent": 70},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "INVALID_MILEAGE")

    def test_refuses_completion_when_mandatory_photos_missing(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
        )
        self._create_active_unlocked_vehicle_access()
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._complete_url(final_inspection.id),
            {"mileage": 1300, "energy_level_percent": 70},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "MISSING_MANDATORY_PHOTOS")

    def test_refuses_completion_when_issue_flagged_without_damage(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
            has_critical_issue=True,
            critical_issue_description="Impact visible",
        )
        self._create_required_photos(final_inspection)
        self._create_active_unlocked_vehicle_access()
        self.api.force_authenticate(self.client_user)

        response = self.api.post(
            self._complete_url(final_inspection.id),
            {"mileage": 1300, "energy_level_percent": 70},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "DAMAGES_REQUIRED")

    def test_allows_completion_when_issue_flagged_with_damage(self):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
            has_critical_issue=True,
            critical_issue_description="Impact visible",
        )
        self._create_required_photos(final_inspection)
        self._create_active_unlocked_vehicle_access()
        Damage.objects.create(
            inspection=final_inspection,
            vehicle=self.vehicle,
            reported_by=self.client_user,
            description="Impact pare-chocs",
            severity=Damage.Severity.MODERE,
            location="Pare-chocs avant",
        )
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.api.post(
                self._complete_url(final_inspection.id),
                {"mileage": 1310, "energy_level_percent": 68},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    @patch("inspections.services.return_inspection._integrate_intervention_for_major_or_critical_damage")
    def test_major_damage_triggers_intervention_hook(self, mock_integrate):
        final_inspection = Inspection.objects.create(
            reservation=self.reservation,
            inspection_type=Inspection.Type.FINAL,
            status=Inspection.Status.EN_COURS,
        )
        self._create_required_photos(final_inspection)
        self._create_active_unlocked_vehicle_access()
        Damage.objects.create(
            inspection=final_inspection,
            vehicle=self.vehicle,
            reported_by=self.client_user,
            description="Choc important",
            severity=Damage.Severity.MAJEUR,
            location="Aile arriere",
        )
        self.api.force_authenticate(self.client_user)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.api.post(
                self._complete_url(final_inspection.id),
                {"mileage": 1320, "energy_level_percent": 65},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_integrate.assert_called_once()
