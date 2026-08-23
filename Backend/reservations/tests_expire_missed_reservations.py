from datetime import timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import ClientProfile
from accounts.tests.utils import create_user, ensure_roles
from inspections.models import Inspection
from payments.models import Deposit, Payment
from reservations.models import Reservation
from vehicles.models import Brand, Parking, ParkingSpace, Vehicle, VehicleCategory


@override_settings(
    DEPARTURE_INSPECTION_EARLY_TOLERANCE_MINUTES=30,
    DEPARTURE_INSPECTION_LATE_TOLERANCE_MINUTES=120,
)
class ExpireMissedReservationsCommandTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        roles = ensure_roles()
        cls.client_role = roles["CLIENT"]

        cls.user = create_user(
            email="expire-missed@example.com",
            password="StrongPass123!",
            role=cls.client_role,
            email_verified=True,
            is_active=True,
        )
        cls.client_profile = ClientProfile.objects.create(user=cls.user)

        cls.brand = Brand.objects.create(name="ExpireBrand", is_active=True)
        cls.category = VehicleCategory.objects.create(
            name="ExpireCategory",
            description="Category",
            daily_rate=Decimal("50.00"),
            hourly_rate=Decimal("10.00"),
            minimum_deposit=Decimal("300.00"),
            minimum_rental_hours=1,
            is_active=True,
        )
        cls.parking = Parking.objects.create(
            name="Expire Parking",
            address="Rue Commande 1",
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
        space = ParkingSpace.objects.create(parking=cls.parking, number=f"E{cls._space_index}", is_active=True)
        return Vehicle.objects.create(
            brand=cls.brand,
            category=cls.category,
            parking_space=space,
            registration_number=f"EXP-{cls._reg_index:03d}",
            model_name="Expire Car",
            year=2026,
            color="Black",
            energy_type="Hybrid",
            transmission="Auto",
            seats=5,
            doors=5,
            mileage=1000,
            status=status,
            is_active=True,
        )

    def _create_confirmed_reservation(self, *, vehicle: Vehicle, start_at, end_at) -> Reservation:
        return Reservation.objects.create(
            client=self.client_profile,
            vehicle=vehicle,
            start_at=start_at,
            end_at=end_at,
            status=Reservation.Status.CONFIRMEE,
            rental_amount=Decimal("120.00"),
            insurance_type=Reservation.InsuranceType.STANDARD,
            deposit_amount=Decimal("500.00"),
            confirmed_at=timezone.now(),
        )

    def test_confirmed_past_without_initial_is_cancelled(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() - timedelta(hours=6)
        reservation = self._create_confirmed_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
        )

        payment = Payment.objects.create(
            reservation=reservation,
            amount=Decimal("120.00"),
            currency="EUR",
            status=Payment.Status.REUSSI,
        )
        Deposit.objects.create(
            reservation=reservation,
            mode=Deposit.Mode.SIMULATED,
            amount=Decimal("500.00"),
            currency="EUR",
            status=Deposit.Status.AUTORISEE,
            authorized_at=timezone.now() - timedelta(days=1),
        )

        call_command("expire_missed_reservations")

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        payment.refresh_from_db()
        deposit = reservation.deposits.order_by("-id").first()

        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertIsNotNone(reservation.cancelled_at)
        self.assertEqual(
            reservation.cancellation_reason,
            "Reservation annulee automatiquement : delai de prise en charge depasse.",
        )
        self.assertEqual(vehicle.status, Vehicle.Status.DISPONIBLE)
        self.assertEqual(payment.status, Payment.Status.REUSSI)
        self.assertIsNotNone(deposit)
        self.assertEqual(deposit.status, Deposit.Status.LIBEREE)

    def test_reservation_within_window_is_unchanged(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() - timedelta(minutes=30)
        reservation = self._create_confirmed_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=2),
        )

        call_command("expire_missed_reservations")

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.CONFIRMEE)
        self.assertEqual(vehicle.status, Vehicle.Status.RESERVE)

    def test_vehicle_reserve_is_released_to_disponible_when_no_other_blocker(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() - timedelta(hours=6)
        reservation = self._create_confirmed_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
        )

        call_command("expire_missed_reservations")

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertEqual(vehicle.status, Vehicle.Status.DISPONIBLE)

    def test_reservation_with_initial_inspection_is_unchanged(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() - timedelta(hours=6)
        reservation = self._create_confirmed_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
        )
        Inspection.objects.create(
            reservation=reservation,
            inspection_type=Inspection.Type.INITIAL,
            status=Inspection.Status.BROUILLON,
        )

        call_command("expire_missed_reservations")

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.CONFIRMEE)
        self.assertEqual(vehicle.status, Vehicle.Status.RESERVE)

    def test_maintenance_vehicle_is_never_forced_to_disponible(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.MAINTENANCE)
        start_at = timezone.now() - timedelta(hours=6)
        reservation = self._create_confirmed_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
        )

        call_command("expire_missed_reservations")

        reservation.refresh_from_db()
        vehicle.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertEqual(vehicle.status, Vehicle.Status.MAINTENANCE)

    def test_second_run_is_idempotent(self):
        vehicle = self._create_vehicle(status=Vehicle.Status.RESERVE)
        start_at = timezone.now() - timedelta(hours=6)
        reservation = self._create_confirmed_reservation(
            vehicle=vehicle,
            start_at=start_at,
            end_at=start_at + timedelta(hours=4),
        )

        out_first = StringIO()
        call_command("expire_missed_reservations", stdout=out_first)

        reservation.refresh_from_db()
        first_cancelled_at = reservation.cancelled_at
        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertIsNotNone(first_cancelled_at)

        out_second = StringIO()
        call_command("expire_missed_reservations", stdout=out_second)

        reservation.refresh_from_db()
        self.assertEqual(reservation.status, Reservation.Status.ANNULEE)
        self.assertEqual(reservation.cancelled_at, first_cancelled_at)
        self.assertIn("annulees=0", out_second.getvalue())
