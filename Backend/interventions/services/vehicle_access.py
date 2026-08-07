from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import Role
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


class VehicleAccessError(ValueError):
    def __init__(self, code: str, message: str, http_status: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status


def _raise_vehicle_access_error(code: str, message: str, *, http_status: int | None = None) -> None:
    raise VehicleAccessError(code=code, message=message, http_status=http_status)


def _extract_audit_context(*, request_context: Any = None) -> tuple[str | None, str | None]:
    ip_address = None
    user_agent = None

    if isinstance(request_context, dict):
        ip_address = request_context.get("ip_address") or request_context.get("ip")
        user_agent = request_context.get("user_agent")

        headers = request_context.get("headers")
        if not user_agent and isinstance(headers, dict):
            user_agent = headers.get("User-Agent") or headers.get("user-agent")

        forwarded = request_context.get("x_forwarded_for") or request_context.get("X-Forwarded-For")
        if not ip_address and isinstance(forwarded, str):
            ip_address = forwarded.split(",")[0].strip()
    else:
        meta = getattr(request_context, "META", None)
        if isinstance(meta, dict):
            forwarded = meta.get("HTTP_X_FORWARDED_FOR")
            if isinstance(forwarded, str) and forwarded.strip():
                ip_address = forwarded.split(",")[0].strip()
            else:
                ip_address = meta.get("REMOTE_ADDR")
            user_agent = meta.get("HTTP_USER_AGENT")

    if isinstance(ip_address, str):
        ip_address = ip_address.strip() or None
    else:
        ip_address = None

    if isinstance(user_agent, str):
        user_agent = user_agent.strip()[:512] or None
    else:
        user_agent = None

    return ip_address, user_agent


def _assert_unlock_identity(*, requested_by) -> None:
    if not requested_by or not getattr(requested_by, "is_authenticated", False):
        _raise_vehicle_access_error(
            "UNAUTHENTICATED",
            "Authentification requise.",
            http_status=401,
        )

    if not getattr(requested_by, "is_active", False):
        _raise_vehicle_access_error(
            "UNAUTHENTICATED",
            "Compte utilisateur inactif.",
            http_status=401,
        )

    role = getattr(requested_by, "role", None)
    if role is None or role.code != Role.Code.CLIENT:
        _raise_vehicle_access_error(
            "INVALID_ROLE",
            "Seul un client peut declencher le deverrouillage simule.",
            http_status=403,
        )


def _assert_client_identity(*, requested_by, action_label: str) -> None:
    if not requested_by or not getattr(requested_by, "is_authenticated", False):
        _raise_vehicle_access_error(
            "UNAUTHENTICATED",
            "Authentification requise.",
            http_status=401,
        )

    if not getattr(requested_by, "is_active", False):
        _raise_vehicle_access_error(
            "UNAUTHENTICATED",
            "Compte utilisateur inactif.",
            http_status=401,
        )

    role = getattr(requested_by, "role", None)
    if role is None or role.code != Role.Code.CLIENT:
        _raise_vehicle_access_error(
            "INVALID_ROLE",
            f"Seul un client peut declencher le {action_label} simule.",
            http_status=403,
        )


def _assert_unlock_business_rules(
    *,
    reservation: Reservation,
    requested_by,
    vehicle: Vehicle,
    vehicle_access: VehicleAccess,
) -> None:
    if reservation.client.user_id != requested_by.id:
        _raise_vehicle_access_error(
            "NOT_OWNER",
            "Cette reservation n'appartient pas a l'utilisateur authentifie.",
            http_status=403,
        )

    if reservation.status != Reservation.Status.EN_COURS:
        _raise_vehicle_access_error(
            "INVALID_RESERVATION_STATUS",
            "La reservation doit etre EN_COURS.",
            http_status=409,
        )

    initial_inspection = _find_initial_inspection(reservation=reservation)
    if initial_inspection is None:
        _raise_vehicle_access_error(
            "INITIAL_INSPECTION_REQUIRED",
            "Inspection INITIAL introuvable.",
            http_status=409,
        )

    if initial_inspection.status != Inspection.Status.TERMINE:
        _raise_vehicle_access_error(
            "INITIAL_INSPECTION_NOT_COMPLETED",
            "Inspection INITIAL non terminee.",
            http_status=409,
        )

    if _has_blocking_critical_issue(initial_inspection=initial_inspection):
        _raise_vehicle_access_error(
            "CRITICAL_ISSUE",
            "Un probleme critique bloque le deverrouillage.",
            http_status=409,
        )

    if vehicle_access.vehicle_id != reservation.vehicle_id:
        _raise_vehicle_access_error(
            "WRONG_VEHICLE",
            "Le vehicule d'acces ne correspond pas a la reservation.",
            http_status=409,
        )

    if vehicle_access.client_id != requested_by.id:
        _raise_vehicle_access_error(
            "NOT_OWNER",
            "L'acces vehicule ne correspond pas a l'utilisateur authentifie.",
            http_status=403,
        )

    if not vehicle_access.is_active:
        _raise_vehicle_access_error(
            "ACCESS_NOT_ACTIVE",
            "L'acces vehicule est inactif.",
            http_status=409,
        )

    if vehicle_access.status != VehicleAccess.Status.ACTIVE:
        if vehicle_access.status == VehicleAccess.Status.PENDING:
            _raise_vehicle_access_error(
                "ACCESS_NOT_STARTED",
                "L'acces vehicule n'a pas encore demarre.",
                http_status=409,
            )

        if vehicle_access.status == VehicleAccess.Status.EXPIRED:
            _raise_vehicle_access_error(
                "ACCESS_EXPIRED",
                "L'acces vehicule a expire.",
                http_status=409,
            )

        _raise_vehicle_access_error(
            "ACCESS_NOT_ACTIVE",
            "Le statut de l'acces vehicule ne permet pas le deverrouillage.",
            http_status=409,
        )

    now = timezone.now()
    if now < vehicle_access.valid_from:
        _raise_vehicle_access_error(
            "ACCESS_NOT_STARTED",
            "La fenetre de validite n'a pas commence.",
            http_status=409,
        )

    if now > vehicle_access.valid_until:
        _raise_vehicle_access_error(
            "ACCESS_EXPIRED",
            "La fenetre de validite est depassee.",
            http_status=409,
        )

    if vehicle.id != reservation.vehicle_id or vehicle_access.vehicle_id != vehicle.id:
        _raise_vehicle_access_error(
            "WRONG_VEHICLE",
            "Vehicule cible invalide pour cette reservation.",
            http_status=409,
        )

    if vehicle.status != Vehicle.Status.LOUE:
        _raise_vehicle_access_error(
            "VEHICLE_NOT_RENTED",
            "Le vehicule n'est pas en statut LOUE.",
            http_status=409,
        )

    if vehicle_access.lock_state == VehicleAccess.LockState.UNLOCKED:
        _raise_vehicle_access_error(
            "ALREADY_UNLOCKED",
            "Le vehicule est deja deverrouille.",
            http_status=409,
        )

    if vehicle_access.lock_state != VehicleAccess.LockState.LOCKED:
        _raise_vehicle_access_error(
            "ACCESS_NOT_ACTIVE",
            "Etat de verrouillage invalide.",
            http_status=409,
        )


def _log_unlock_failure(
    *,
    reservation,
    vehicle,
    vehicle_access,
    requested_by,
    failure: VehicleAccessError,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    attempted_reservation_id = getattr(reservation, "id", None)

    with transaction.atomic():
        LockingLog.objects.create(
            vehicle_access=vehicle_access,
            reservation=reservation if getattr(reservation, "id", None) else None,
            vehicle=vehicle if getattr(vehicle, "id", None) else None,
            user=requested_by if getattr(requested_by, "is_authenticated", False) else None,
            action=LockingLog.Action.UNLOCK,
            result=LockingLog.Result.FAILURE,
            failure_code=failure.code,
            failure_message=failure.message,
            attempted_reservation_id=attempted_reservation_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={},
        )


def _log_lock_failure(
    *,
    reservation,
    vehicle,
    vehicle_access,
    requested_by,
    failure: VehicleAccessError,
    ip_address: str | None,
    user_agent: str | None,
) -> None:
    attempted_reservation_id = getattr(reservation, "id", None)

    with transaction.atomic():
        LockingLog.objects.create(
            vehicle_access=vehicle_access,
            reservation=reservation if getattr(reservation, "id", None) else None,
            vehicle=vehicle if getattr(vehicle, "id", None) else None,
            user=requested_by if getattr(requested_by, "is_authenticated", False) else None,
            action=LockingLog.Action.LOCK,
            result=LockingLog.Result.FAILURE,
            failure_code=failure.code,
            failure_message=failure.message,
            attempted_reservation_id=attempted_reservation_id,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata={},
        )


def _assert_lock_business_rules(
    *,
    reservation: Reservation,
    requested_by,
    vehicle: Vehicle,
    vehicle_access: VehicleAccess,
    final_lock: bool,
) -> None:
    if reservation.client.user_id != requested_by.id:
        _raise_vehicle_access_error(
            "NOT_OWNER",
            "Cette reservation n'appartient pas a l'utilisateur authentifie.",
            http_status=403,
        )

    if reservation.status not in {Reservation.Status.EN_COURS, Reservation.Status.A_CONTROLER}:
        _raise_vehicle_access_error(
            "INVALID_RESERVATION_STATUS",
            "La reservation doit etre EN_COURS ou A_CONTROLER.",
            http_status=409,
        )

    if reservation.status == Reservation.Status.A_CONTROLER and not final_lock:
        _raise_vehicle_access_error(
            "INVALID_RESERVATION_STATUS",
            "La reservation A_CONTROLER autorise uniquement le verrouillage final.",
            http_status=409,
        )

    if reservation.status == Reservation.Status.A_CONTROLER and final_lock:
        final_inspection = _find_final_inspection(reservation=reservation)
        if final_inspection is None:
            _raise_vehicle_access_error(
                "FINAL_INSPECTION_REQUIRED",
                "Inspection FINAL introuvable pour le verrouillage final.",
                http_status=409,
            )

        if final_inspection.status != Inspection.Status.TERMINE:
            _raise_vehicle_access_error(
                "FINAL_INSPECTION_NOT_COMPLETED",
                "Inspection FINAL non terminee.",
                http_status=409,
            )

    if vehicle_access.status == VehicleAccess.Status.REVOKED:
        _raise_vehicle_access_error(
            "ACCESS_REVOKED",
            "L'acces vehicule est deja revoque.",
            http_status=409,
        )

    if vehicle_access.vehicle_id != reservation.vehicle_id:
        _raise_vehicle_access_error(
            "WRONG_VEHICLE",
            "Le vehicule d'acces ne correspond pas a la reservation.",
            http_status=409,
        )

    if vehicle_access.client_id != requested_by.id:
        _raise_vehicle_access_error(
            "NOT_OWNER",
            "L'acces vehicule ne correspond pas a l'utilisateur authentifie.",
            http_status=403,
        )

    if vehicle.id != reservation.vehicle_id or vehicle_access.vehicle_id != vehicle.id:
        _raise_vehicle_access_error(
            "WRONG_VEHICLE",
            "Vehicule cible invalide pour cette reservation.",
            http_status=409,
        )

    if vehicle_access.lock_state == VehicleAccess.LockState.LOCKED:
        _raise_vehicle_access_error(
            "ALREADY_LOCKED",
            "Le vehicule est deja verrouille.",
            http_status=409,
        )

    if vehicle_access.lock_state != VehicleAccess.LockState.UNLOCKED:
        _raise_vehicle_access_error(
            "ALREADY_LOCKED",
            "Etat de verrouillage invalide pour un verrouillage client.",
            http_status=409,
        )


def _lock_vehicle_internal(
    *,
    reservation,
    requested_by,
    request_context,
    final_lock: bool,
    revoke_after_lock: bool,
):
    ip_address, user_agent = _extract_audit_context(request_context=request_context)
    resolved_reservation = reservation
    resolved_vehicle = getattr(reservation, "vehicle", None)
    resolved_vehicle_access = None

    try:
        _assert_client_identity(requested_by=requested_by, action_label="verrouillage")

        with transaction.atomic():
            reservation_locked = (
                Reservation.objects.select_for_update()
                .select_related("client", "client__user", "vehicle")
                .get(pk=reservation.pk)
            )
            vehicle_locked = Vehicle.objects.select_for_update().get(pk=reservation_locked.vehicle_id)
            vehicle_access_locked = (
                VehicleAccess.objects.select_for_update()
                .select_related("reservation", "vehicle", "client")
                .filter(reservation=reservation_locked)
                .first()
            )

            resolved_reservation = reservation_locked
            resolved_vehicle = vehicle_locked

            if vehicle_access_locked is None:
                _raise_vehicle_access_error(
                    "ACCESS_NOT_FOUND",
                    "Aucun acces vehicule n'est associe a cette reservation.",
                    http_status=404,
                )

            resolved_vehicle_access = vehicle_access_locked

            # Avoid incoherent duplicate logs on repeated finalization calls.
            if (
                final_lock
                and revoke_after_lock
                and reservation_locked.status == Reservation.Status.A_CONTROLER
                and vehicle_access_locked.status == VehicleAccess.Status.REVOKED
                and not vehicle_access_locked.is_active
                and vehicle_access_locked.lock_state == VehicleAccess.LockState.LOCKED
            ):
                return {
                    "state": VehicleAccess.LockState.LOCKED,
                    "locked_at": vehicle_access_locked.last_locked_at,
                }

            _assert_lock_business_rules(
                reservation=reservation_locked,
                requested_by=requested_by,
                vehicle=vehicle_locked,
                vehicle_access=vehicle_access_locked,
                final_lock=final_lock,
            )

            locked_at = timezone.now()
            vehicle_access_locked.lock_state = VehicleAccess.LockState.LOCKED
            vehicle_access_locked.last_locked_at = locked_at
            vehicle_access_locked.save(update_fields=["lock_state", "last_locked_at", "updated_at"])

            LockingLog.objects.create(
                vehicle_access=vehicle_access_locked,
                reservation=reservation_locked,
                vehicle=vehicle_locked,
                user=requested_by,
                action=LockingLog.Action.LOCK,
                result=LockingLog.Result.SUCCESS,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={},
            )

            if revoke_after_lock:
                now = timezone.now()
                vehicle_access_locked.status = VehicleAccess.Status.REVOKED
                vehicle_access_locked.is_active = False
                vehicle_access_locked.revoked_at = now
                vehicle_access_locked.save(update_fields=["status", "is_active", "revoked_at", "updated_at"])

                _log_once(
                    vehicle_access=vehicle_access_locked,
                    reservation=reservation_locked,
                    vehicle=vehicle_locked,
                    user=requested_by,
                    action=LockingLog.Action.ACCESS_REVOKED,
                    result=LockingLog.Result.SUCCESS,
                    metadata={"reason": "return_final_lock"},
                )

            return {
                "state": VehicleAccess.LockState.LOCKED,
                "locked_at": locked_at,
            }
    except VehicleAccessError as exc:
        try:
            _log_lock_failure(
                reservation=resolved_reservation,
                vehicle=resolved_vehicle,
                vehicle_access=resolved_vehicle_access,
                requested_by=requested_by,
                failure=exc,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception:
            pass
        raise


def lock_vehicle(
    *,
    reservation,
    requested_by,
    request_context=None,
):
    return _lock_vehicle_internal(
        reservation=reservation,
        requested_by=requested_by,
        request_context=request_context,
        final_lock=False,
        revoke_after_lock=False,
    )


def lock_and_revoke_after_return(
    *,
    reservation,
    requested_by,
    request_context=None,
):
    return _lock_vehicle_internal(
        reservation=reservation,
        requested_by=requested_by,
        request_context=request_context,
        final_lock=True,
        revoke_after_lock=True,
    )


def unlock_vehicle(
    *,
    reservation,
    requested_by,
    request_context=None,
):
    ip_address, user_agent = _extract_audit_context(request_context=request_context)
    resolved_reservation = reservation
    resolved_vehicle = getattr(reservation, "vehicle", None)
    resolved_vehicle_access = None

    try:
        _assert_unlock_identity(requested_by=requested_by)

        with transaction.atomic():
            reservation_locked = (
                Reservation.objects.select_for_update()
                .select_related("client", "client__user", "vehicle")
                .get(pk=reservation.pk)
            )
            vehicle_locked = Vehicle.objects.select_for_update().get(pk=reservation_locked.vehicle_id)
            vehicle_access_locked = (
                VehicleAccess.objects.select_for_update()
                .select_related("reservation", "vehicle", "client")
                .filter(reservation=reservation_locked)
                .first()
            )

            resolved_reservation = reservation_locked
            resolved_vehicle = vehicle_locked

            if vehicle_access_locked is None:
                _raise_vehicle_access_error(
                    "ACCESS_NOT_FOUND",
                    "Aucun acces vehicule n'est associe a cette reservation.",
                    http_status=404,
                )

            resolved_vehicle_access = vehicle_access_locked

            _assert_unlock_business_rules(
                reservation=reservation_locked,
                requested_by=requested_by,
                vehicle=vehicle_locked,
                vehicle_access=vehicle_access_locked,
            )

            unlocked_at = timezone.now()
            vehicle_access_locked.lock_state = VehicleAccess.LockState.UNLOCKED
            vehicle_access_locked.last_unlocked_at = unlocked_at
            vehicle_access_locked.save(update_fields=["lock_state", "last_unlocked_at", "updated_at"])

            LockingLog.objects.create(
                vehicle_access=vehicle_access_locked,
                reservation=reservation_locked,
                vehicle=vehicle_locked,
                user=requested_by,
                action=LockingLog.Action.UNLOCK,
                result=LockingLog.Result.SUCCESS,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata={},
            )

            return {
                "state": VehicleAccess.LockState.UNLOCKED,
                "unlocked_at": unlocked_at,
            }
    except VehicleAccessError as exc:
        try:
            _log_unlock_failure(
                reservation=resolved_reservation,
                vehicle=resolved_vehicle,
                vehicle_access=resolved_vehicle_access,
                requested_by=requested_by,
                failure=exc,
                ip_address=ip_address,
                user_agent=user_agent,
            )
        except Exception:
            pass
        raise


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

def _find_final_inspection(*, reservation: Reservation) -> Inspection | None:
    return (
        Inspection.objects.filter(
            reservation=reservation,
            inspection_type=Inspection.Type.FINAL,
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
