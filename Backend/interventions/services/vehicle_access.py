from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from inspections.models import Damage, Inspection
from interventions.models import LockingLog, VehicleAccess
from reservations.models import Reservation
from vehicles.models import Vehicle


@dataclass(frozen=True)
class VehicleAccessLifecycleError(ValueError):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _raise_access_error(code: str, message: str) -> None:
    raise VehicleAccessLifecycleError(code=code, message=message)


def _build_validity_window(*, reservation: Reservation) -> tuple:
    early_tolerance = timedelta(minutes=getattr(settings, "VEHICLE_ACCESS_EARLY_TOLERANCE_MINUTES", 30))
    late_tolerance = timedelta(minutes=getattr(settings, "VEHICLE_ACCESS_LATE_TOLERANCE_MINUTES", 120))
    return reservation.start_at - early_tolerance, reservation.end_at + late_tolerance


def _find_initial_inspection(*, reservation: Reservation) -> Inspection | None:
    return (
        Inspection.objects.filter(
            reservation=reservation,
            inspection_type=Inspection.Type.INITIAL,
        )
        .order_by("-completed_at", "-id")
        .first()
    )


def _has_blocking_critical_issue(*, initial_inspection: Inspection) -> bool:
    if initial_inspection.has_critical_issue:
        return True

    return initial_inspection.damages.filter(
        severity=Damage.Severity.CRITIQUE,
    ).exclude(
        status__in=[Damage.Status.RESOLU, Damage.Status.REJETE]
    ).exists()


def _log_once(
    *,
    vehicle_access: VehicleAccess | None,
    reservation: Reservation,
    vehicle: Vehicle,
    user,
    action: str,
    result: str,
    failure_code: str | None = None,
    failure_message: str | None = None,
    metadata: dict | None = None,
) -> LockingLog:
    metadata_payload = metadata or {}

    existing = LockingLog.objects.filter(
        vehicle_access=vehicle_access,
        reservation=reservation,
        vehicle=vehicle,
        user=user,
        action=action,
        result=result,
        failure_code=failure_code,
        failure_message=failure_message,
        metadata=metadata_payload,
    ).exists()
    if existing:
        return (
            LockingLog.objects.filter(
                vehicle_access=vehicle_access,
                reservation=reservation,
                vehicle=vehicle,
                user=user,
                action=action,
                result=result,
                failure_code=failure_code,
                failure_message=failure_message,
                metadata=metadata_payload,
            )
            .order_by("-created_at", "-id")
            .first()
        )

    return LockingLog.objects.create(
        vehicle_access=vehicle_access,
        reservation=reservation,
        vehicle=vehicle,
        user=user,
        action=action,
        result=result,
        failure_code=failure_code,
        failure_message=failure_message,
        metadata=metadata_payload,
    )


def activate_vehicle_access(
    *,
    reservation,
    requested_by=None,
):
    with transaction.atomic():
        reservation_locked = (
            Reservation.objects.select_for_update()
            .select_related("client", "client__user", "vehicle")
            .get(pk=reservation.pk)
        )
        vehicle_locked = Vehicle.objects.select_for_update().get(pk=reservation_locked.vehicle_id)

        if reservation_locked.vehicle_id != vehicle_locked.id:
            _raise_access_error("VEHICLE_MISMATCH", "Le vehicule de la reservation est incoherent.")

        initial_inspection = _find_initial_inspection(reservation=reservation_locked)
        if initial_inspection is None:
            _raise_access_error("INITIAL_INSPECTION_MISSING", "Inspection INITIAL introuvable.")

        if initial_inspection.status != Inspection.Status.TERMINE:
            _raise_access_error("INITIAL_NOT_COMPLETED", "Inspection INITIAL non terminee.")

        if _has_blocking_critical_issue(initial_inspection=initial_inspection):
            _raise_access_error("CRITICAL_ISSUE_BLOCKING", "Probleme critique detecte sur l'inspection INITIAL.")

        if reservation_locked.status != Reservation.Status.EN_COURS:
            _raise_access_error(
                "INVALID_RESERVATION_STATUS",
                "La reservation doit etre EN_COURS pour activer le droit d'acces.",
            )

        valid_from, valid_until = _build_validity_window(reservation=reservation_locked)
        now = timezone.now()

        vehicle_access, created = VehicleAccess.objects.select_for_update().get_or_create(
            reservation=reservation_locked,
            defaults={
                "vehicle": vehicle_locked,
                "client": reservation_locked.client.user,
                "status": VehicleAccess.Status.PENDING,
                "lock_state": VehicleAccess.LockState.LOCKED,
                "valid_from": valid_from,
                "valid_until": valid_until,
                "is_active": False,
            },
        )

        changed = False
        update_fields = []

        if vehicle_access.vehicle_id != vehicle_locked.id:
            vehicle_access.vehicle = vehicle_locked
            update_fields.append("vehicle")
            changed = True

        expected_client_id = reservation_locked.client.user_id
        if vehicle_access.client_id != expected_client_id:
            vehicle_access.client_id = expected_client_id
            update_fields.append("client")
            changed = True

        if vehicle_access.valid_from != valid_from:
            vehicle_access.valid_from = valid_from
            update_fields.append("valid_from")
            changed = True

        if vehicle_access.valid_until != valid_until:
            vehicle_access.valid_until = valid_until
            update_fields.append("valid_until")
            changed = True

        if vehicle_access.status != VehicleAccess.Status.ACTIVE:
            vehicle_access.status = VehicleAccess.Status.ACTIVE
            update_fields.append("status")
            changed = True

        if not vehicle_access.is_active:
            vehicle_access.is_active = True
            update_fields.append("is_active")
            changed = True

        if vehicle_access.lock_state != VehicleAccess.LockState.LOCKED:
            vehicle_access.lock_state = VehicleAccess.LockState.LOCKED
            update_fields.append("lock_state")
            changed = True

        if vehicle_access.activated_at is None:
            vehicle_access.activated_at = now
            update_fields.append("activated_at")
            changed = True

        if vehicle_access.revoked_at is not None:
            vehicle_access.revoked_at = None
            update_fields.append("revoked_at")
            changed = True

        if changed:
            update_fields.append("updated_at")
            vehicle_access.save(update_fields=update_fields)

        if created or changed:
            _log_once(
                vehicle_access=vehicle_access,
                reservation=reservation_locked,
                vehicle=vehicle_locked,
                user=requested_by,
                action=LockingLog.Action.ACCESS_ACTIVATED,
                result=LockingLog.Result.SUCCESS,
                metadata={"event": "vehicle_access_activation"},
            )

        return vehicle_access


def revoke_vehicle_access(
    *,
    reservation,
    requested_by=None,
    reason,
):
    with transaction.atomic():
        reservation_locked = (
            Reservation.objects.select_for_update()
            .select_related("vehicle")
            .get(pk=reservation.pk)
        )
        vehicle_locked = Vehicle.objects.select_for_update().get(pk=reservation_locked.vehicle_id)

        vehicle_access = (
            VehicleAccess.objects.select_for_update()
            .filter(reservation=reservation_locked)
            .first()
        )
        if vehicle_access is None:
            return None

        if (
            vehicle_access.status == VehicleAccess.Status.REVOKED
            and not vehicle_access.is_active
            and vehicle_access.lock_state == VehicleAccess.LockState.LOCKED
        ):
            return vehicle_access

        now = timezone.now()
        vehicle_access.status = VehicleAccess.Status.REVOKED
        vehicle_access.is_active = False
        vehicle_access.lock_state = VehicleAccess.LockState.LOCKED
        vehicle_access.revoked_at = now
        vehicle_access.save(
            update_fields=["status", "is_active", "lock_state", "revoked_at", "updated_at"]
        )

        _log_once(
            vehicle_access=vehicle_access,
            reservation=reservation_locked,
            vehicle=vehicle_locked,
            user=requested_by,
            action=LockingLog.Action.ACCESS_REVOKED,
            result=LockingLog.Result.SUCCESS,
            metadata={"reason": (reason or "").strip()},
        )

        return vehicle_access


def expire_vehicle_access_if_needed(vehicle_access, now=None):
    reference_now = now or timezone.now()

    with transaction.atomic():
        access_locked = VehicleAccess.objects.select_for_update().get(pk=vehicle_access.pk)

        if reference_now <= access_locked.valid_until:
            return access_locked

        already_expired = (
            access_locked.status == VehicleAccess.Status.EXPIRED
            and not access_locked.is_active
            and access_locked.lock_state == VehicleAccess.LockState.LOCKED
        )
        if already_expired:
            return access_locked

        access_locked.status = VehicleAccess.Status.EXPIRED
        access_locked.is_active = False
        access_locked.lock_state = VehicleAccess.LockState.LOCKED
        access_locked.save(update_fields=["status", "is_active", "lock_state", "updated_at"])

        _log_once(
            vehicle_access=access_locked,
            reservation=access_locked.reservation,
            vehicle=access_locked.vehicle,
            user=None,
            action=LockingLog.Action.ACCESS_REVOKED,
            result=LockingLog.Result.SUCCESS,
            metadata={"reason": "expired"},
        )

        return access_locked
