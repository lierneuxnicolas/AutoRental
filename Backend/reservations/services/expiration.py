from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction
from django.utils import timezone

from common.models import SystemLog
from common.services import create_system_log
from inspections.models import Inspection
from inspections.services.departure import is_departure_window_expired
from payments.models import Payment
from payments.services.deposits import (
    DepositReleaseError,
    mark_authorized_deposit_for_verification,
    release_authorized_deposit,
)
from reservations.models import Reservation
from vehicles.models import Vehicle
from vehicles.services import get_blocking_reservation_statuses


SYSTEM_CANCELLATION_REASON = "Reservation annulee automatiquement : delai de prise en charge depasse."


@dataclass
class ExpireMissedReservationsStats:
    analyzed: int = 0
    cancelled: int = 0
    ignored: int = 0
    errors: int = 0


def _has_initial_inspection(*, reservation_id: int) -> bool:
    return Inspection.objects.filter(
        reservation_id=reservation_id,
        inspection_type=Inspection.Type.INITIAL,
    ).exists()


def _has_other_blocking_reservations(*, reservation: Reservation, reference_time) -> bool:
    return Reservation.objects.filter(
        vehicle_id=reservation.vehicle_id,
        status__in=get_blocking_reservation_statuses(),
        end_at__gt=reference_time,
    ).exclude(pk=reservation.pk).exists()


def _release_deposit_if_possible(*, reservation: Reservation) -> tuple[bool, str | None]:
    try:
        moved_to_review = mark_authorized_deposit_for_verification(reservation=reservation)
        if moved_to_review is None:
            return False, None

        released = release_authorized_deposit(reservation=reservation)
        if released is None:
            return False, "caution a verifier mais non liberee"

        return True, None
    except DepositReleaseError as exc:
        return False, exc.message


def _expire_single_reservation(*, reservation_id: int, reference_time) -> bool:
    with transaction.atomic():
        reservation = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle")
            .get(pk=reservation_id)
        )
        vehicle = Vehicle.objects.select_for_update().get(pk=reservation.vehicle_id)

        if reservation.status != Reservation.Status.CONFIRMEE:
            return False

        if _has_initial_inspection(reservation_id=reservation.id):
            return False

        if not is_departure_window_expired(reservation=reservation, reference_time=reference_time):
            return False

        reservation.status = Reservation.Status.ANNULEE
        reservation.cancelled_at = reference_time
        reservation.cancellation_reason = SYSTEM_CANCELLATION_REASON
        reservation.save(update_fields=["status", "cancelled_at", "cancellation_reason", "updated_at"])

        vehicle_unblocked = False
        if vehicle.status == Vehicle.Status.RESERVE and not _has_other_blocking_reservations(
            reservation=reservation,
            reference_time=reference_time,
        ):
            vehicle.status = Vehicle.Status.DISPONIBLE
            vehicle.save(update_fields=["status", "updated_at"])
            vehicle_unblocked = True

        payment_success_exists = Payment.objects.filter(
            reservation=reservation,
            status=Payment.Status.REUSSI,
        ).exists()

        deposit_released, deposit_error = _release_deposit_if_possible(reservation=reservation)

        financial_note = (
            "paiement reussi detecte: traitement financier manuel requis"
            if payment_success_exists
            else "aucun paiement reussi"
        )
        deposit_note = "caution liberee" if deposit_released else "caution inchangee"
        if deposit_error:
            deposit_note = f"{deposit_note} ({deposit_error})"

        create_system_log(
            action="MISSED_RESERVATION_EXPIRED",
            message=(
                f"Reservation {reservation.reference} (id={reservation.id}) annulee automatiquement apres depassement de la fenetre de depart. "
                f"Vehicle id={vehicle.id}, status={vehicle.status}, unblocked={vehicle_unblocked}. "
                f"{financial_note}. {deposit_note}."
            ),
            level=SystemLog.Level.WARNING,
            user=None,
        )

    return True


def expire_missed_reservations(*, reference_time=None) -> ExpireMissedReservationsStats:
    now = reference_time or timezone.now()
    stats = ExpireMissedReservationsStats()

    reservation_ids = list(
        Reservation.objects.filter(status=Reservation.Status.CONFIRMEE)
        .order_by("id")
        .values_list("id", flat=True)
    )

    for reservation_id in reservation_ids:
        stats.analyzed += 1
        try:
            cancelled = _expire_single_reservation(reservation_id=reservation_id, reference_time=now)
        except Exception as exc:
            stats.errors += 1
            create_system_log(
                action="MISSED_RESERVATION_EXPIRE_ERROR",
                message=f"Reservation id={reservation_id}: echec expiration automatique ({exc}).",
                level=SystemLog.Level.ERROR,
                user=None,
            )
            continue

        if cancelled:
            stats.cancelled += 1
        else:
            stats.ignored += 1

    return stats
