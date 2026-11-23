from datetime import timedelta

from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from interventions.models import VehicleAccess
from payments.models import Deposit, Payment, Refund, StripeEvent
from reservations.models import Reservation
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)

from accounts.models import AccountErasureRequest, Role, User


def _has_open_dispute(payments, deposits):
    intent_ids = {
        value for queryset in (payments, deposits)
        for value in queryset.values_list("stripe_payment_intent_id", flat=True) if value
    }
    if not intent_ids:
        return False

    intent_events = StripeEvent.objects.filter(
        event_type__startswith="payment_intent.",
        payload__data__object__id__in=intent_ids,
    ).values_list("payload__data__object__latest_charge", flat=True)
    charge_ids = set()
    for charge in intent_events:
        reference = charge.get("id") if isinstance(charge, dict) else charge
        if isinstance(reference, str):
            charge_ids.add(reference)

    events = StripeEvent.objects.filter(event_type__startswith="charge.dispute.").filter(
        Q(payload__data__object__payment_intent__in=intent_ids)
        | Q(payload__data__object__payment_intent__id__in=intent_ids)
        | Q(payload__data__object__charge__payment_intent__in=intent_ids)
        | Q(payload__data__object__charge__payment_intent__id__in=intent_ids)
        | Q(payload__data__object__charge__in=charge_ids)
        | Q(payload__data__object__charge__id__in=charge_ids)
    ).values_list("payload", "created_at")
    terminal = {"won", "lost", "warning_closed", "prevented"}
    latest = {}
    for payload, received_at in events:
        dispute = payload["data"]["object"]
        dispute_id = dispute.get("id")
        if not dispute_id:
            return True
        created = payload.get("created")
        event_time = created if isinstance(created, int) else int(received_at.timestamp())
        # At equal timestamps, favour deferral over declaring a dispute resolved.
        candidate = (event_time, dispute.get("status") not in terminal)
        if dispute_id not in latest or candidate > latest[dispute_id]:
            latest[dispute_id] = candidate
    return any(is_open for _, is_open in latest.values())


def _deferral_reason(user_id):
    reason = AccountErasureRequest.Reason
    reservations = Reservation.objects.filter(client__user_id=user_id)
    if reservations.filter(status=Reservation.Status.A_CONTROLER).exists():
        return reason.RETURN_REVIEW
    now = timezone.now()
    if VehicleAccess.objects.filter(
        client_id=user_id, reservation__client__user_id=user_id,
        reservation__status__in=(Reservation.Status.CONFIRMEE, Reservation.Status.EN_COURS),
        status=VehicleAccess.Status.ACTIVE, is_active=True,
        revoked_at__isnull=True, valid_from__lte=now, valid_until__gte=now,
    ).exists():
        return reason.VEHICLE_ACCESS
    fresh_draft = now - timedelta(minutes=Reservation.DRAFT_HOLD_MINUTES)
    if reservations.filter(
        Q(status__in=Reservation.ACTIVE_BOOKING_STATUSES)
        | Q(status=Reservation.Status.BROUILLON, created_at__gte=fresh_draft)
    ).exists():
        return reason.RESERVATION

    payments = Payment.objects.filter(reservation__client__user_id=user_id)
    deposits = Deposit.objects.filter(reservation__client__user_id=user_id)
    if deposits.exclude(status__in=(
        Deposit.Status.CAPTUREE, Deposit.Status.LIBEREE, Deposit.Status.ECHOUEE,
        Deposit.Status.ANNULEE, Deposit.Status.EXPIREE,
    )).exists() or deposits.filter(status=Deposit.Status.CAPTUREE, captured_amount__isnull=True).exists():
        return reason.DEPOSIT
    if payments.exclude(status__in=(Payment.Status.REUSSI, Payment.Status.ECHOUE, Payment.Status.ANNULE)).exists():
        return reason.PAYMENT
    if Refund.objects.filter(
        Q(payment__reservation__client__user_id=user_id) | Q(reservation__client__user_id=user_id),
    ).exclude(status__in=(Refund.Status.REUSSI, Refund.Status.ANNULE)).exists():
        return reason.REFUND
    if _has_open_dispute(payments, deposits):
        return reason.DISPUTE
    return ""


@transaction.atomic
def request_account_erasure(*, user_id, password):
    user = User.objects.select_for_update().get(pk=user_id)
    existing = AccountErasureRequest.objects.filter(user=user).first()
    if existing and existing.status == AccountErasureRequest.Status.CLOSED:
        return existing
    if not user.is_active or not user.role or not user.role.is_active or user.role.code != Role.Code.CLIENT:
        raise PermissionDenied("Cette action est réservée aux clients actifs.")
    if not check_password(password, user.password):
        raise ValidationError({"password": "Le mot de passe actuel est incorrect."})

    request = existing or AccountErasureRequest(user=user)
    reason = _deferral_reason(user_id)
    if reason:
        if reason != request.reason:
            request.reason = reason
            request.save()
        return request

    user.account_closed_at = timezone.now()
    user.is_active = False
    # Also invalidates the password fingerprints in access JWTs and Django sessions.
    user.set_unusable_password()
    user.save(update_fields=["account_closed_at", "is_active", "password"])
    for token_id in OutstandingToken.objects.filter(
        user=user, expires_at__gt=user.account_closed_at, blacklistedtoken__isnull=True,
    ).values_list("pk", flat=True):
        BlacklistedToken.objects.get_or_create(token_id=token_id)
    request.status = AccountErasureRequest.Status.CLOSED
    request.reason = ""
    request.save()
    return request
