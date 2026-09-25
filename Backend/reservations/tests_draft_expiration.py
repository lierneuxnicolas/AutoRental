from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounts.models import ClientDocument, ClientProfile
from accounts.tests.utils import create_user, ensure_roles
from payments.services.deposits import DepositAuthorizationError, authorize_deposit
from payments.models import Deposit
from reservations.models import Reservation
from reservations.services.expiration import (
    DRAFT_CANCELLATION_REASON,
    expire_stale_draft_reservations,
)
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory
from vehicles.services import is_vehicle_available


class DraftReservationExpirationTestsMixin:
    @classmethod
    def setUpTestData(cls):
        roles = ensure_roles()
        cls.client_role = roles["CLIENT"]

        cls.user = create_user(
            email="draft-expire@example.com",
            password="StrongPass123!",
            role=cls.client_role,
            email_verified=True,
            is_active=True,
        )
        cls.client_profile = ClientProfile.objects.create(
            user=cls.user,
            date_of_birth=date(1990, 1, 1),
            address="Rue Brouillon 1",
            profile_status=ClientProfile.ProfileStatus.VALIDE,
        )
        expiration = timezone.localdate() + timedelta(days=365)
        for document_type in (
            ClientDocument.DocumentType.CARTE_IDENTITE,
            ClientDocument.DocumentType.PERMIS_CONDUIRE,
        ):
            ClientDocument.objects.create(
                client=cls.client_profile,
                document_type=document_type,
                document_number=f"DRAFT-{document_type}",
                file="client_documents/test.pdf",
                expiration_date=expiration,
                status=ClientDocument.Status.VALIDE,
                is_active=True,
            )

        cls.brand = Brand.objects.create(name="DraftBrand", is_active=True)
        cls.category = VehicleCategory.objects.create(
            name="DraftCategory",
            description="Category",
            daily_rate=Decimal("50.00"),
            hourly_rate=Decimal("10.00"),
            minimum_deposit=Decimal("300.00"),
            minimum_rental_hours=1,
            is_active=True,
        )
        cls.parking = Parking.objects.create(
            name="Draft Parking",
            address="Rue Commande 2",
            latitude=Decimal("50.850340"),
            longitude=Decimal("4.351710"),
            capacity=50,
            is_active=True,
        )
        cls._space_index = 0
        cls._reg_index = 0

    @classmethod
    def _create_vehicle(cls, *, status=Vehicle.Status.RESERVE) -> Vehicle:
        cls._space_index += 1
        cls._reg_index += 1
        space = ParkingSpace.objects.create(parking=cls.parking, number=f"D{cls._space_index}", is_active=True)
        return Vehicle.objects.create(
            brand=cls.brand,
            category=cls.category,
            parking_space=space,
            registration_number=f"DFT-{cls._reg_index:03d}",
            model_name="Draft Car",
            year=2026,
            color="White",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=500,
            status=status,
            is_active=True,
        )

    def _create_draft_reservation(self, *, vehicle, start_at, end_at, created_at=None):
        reservation = Reservation.objects.create(
            client=self.client_profile,
            vehicle=vehicle,
            start_at=start_at,
            end_at=end_at,
            status=Reservation.Status.BROUILLON,
            rental_amount=Decimal("120.00"),
            insurance_type=Reservation.InsuranceType.STANDARD,
            deposit_amount=Decimal("350.00"),
        )
        if created_at is not None:
            Reservation.objects.filter(pk=reservation.pk).update(created_at=created_at)
            reservation.refresh_from_db()
        return reservation


class DraftReservationAvailabilityTests(DraftReservationExpirationTestsMixin, TestCase):
    def test_recent_draft_blocks_availability(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.DISPONIBLE)
        start_at = timezone.now() + timedelta(hours=6)
        end_at = start_at + timedelta(hours=4)
        self._create_draft_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=end_at,
            created_at=timezone.now() - timedelta(minutes=5),
        )

        self.assertFalse(is_vehicle_available(vehicle=vehicle, start=start_at, end=end_at))

    def test_stale_draft_does_not_block_availability(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.DISPONIBLE)
        start_at = timezone.now() + timedelta(hours=6)
        end_at = start_at + timedelta(hours=4)
        self._create_draft_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=end_at,
            created_at=timezone.now() - timedelta(minutes=20),
        )

        self.assertTrue(is_vehicle_available(vehicle=vehicle, start=start_at, end=end_at))


class ExpireStaleDraftReservationsTests(DraftReservationExpirationTestsMixin, TestCase):
    def test_recent_draft_is_unchanged(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() + timedelta(hours=6)
        reservation = self._create_draft_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
            created_at=timezone.now() - timedelta(minutes=5),
        )

        expire_stale_draft_reservations()

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.BROUILLON)
        self.assertEqual(vehicle.status, Vehicle.Status.RESERVE)

    def test_stale_draft_is_cancelled_and_vehicle_released(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() + timedelta(hours=6)
        reservation = self._create_draft_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
            created_at=timezone.now() - timedelta(minutes=20),
        )

        expire_stale_draft_reservations()

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertIsNotNone(reservation.cancelled_at)
        self.assertEqual(reservation.cancellation_reason, DRAFT_CANCELLATION_REASON)
        self.assertEqual(vehicle.status, Vehicle.Status.DISPONIBLE)

    def test_confirmed_reservation_is_never_touched(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() + timedelta(hours=6)
        reservation = Reservation.objects.create(
            client=self.client_profile,
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
            status=Reservation.Status.CONFIRMEE,
            rental_amount=Decimal("120.00"),
            insurance_type=Reservation.InsuranceType.STANDARD,
            deposit_amount=Decimal("350.00"),
            confirmed_at=timezone.now(),
        )
        Reservation.objects.filter(pk=reservation.pk).update(
            created_at=timezone.now() - timedelta(minutes=20)
        )

        expire_stale_draft_reservations()

        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.CONFIRMEE)


class AuthorizeDepositDraftExpirationTests(DraftReservationExpirationTestsMixin, TestCase):
    def test_authorize_deposit_rejected_for_expired_draft(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.DISPONIBLE)
        start_at = timezone.now() + timedelta(hours=6)
        reservation = self._create_draft_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
            created_at=timezone.now() - timedelta(minutes=20),
        )

        with self.assertRaises(DepositAuthorizationError) as ctx:
            authorize_deposit(
                reservation=reservation,
                requested_by=self.user,
                mode=Deposit.Mode.SIMULATED,
            )

        self.assertEqual(ctx.exception.code, "DRAFT_EXPIRED")

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertEqual(reservation.cancellation_reason, DRAFT_CANCELLATION_REASON)
        self.assertEqual(vehicle.status, Vehicle.Status.DISPONIBLE)

    def test_authorize_deposit_succeeds_for_recent_draft(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.DISPONIBLE)
        start_at = timezone.now() + timedelta(hours=6)
        reservation = self._create_draft_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
            created_at=timezone.now() - timedelta(minutes=5),
        )

        result = authorize_deposit(
            reservation=reservation,
            requested_by=self.user,
            mode=Deposit.Mode.SIMULATED,
        )

        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.EN_ATTENTE_PAIEMENT)
        self.assertEqual(result["deposit"].status, Deposit.Status.AUTORISEE)
