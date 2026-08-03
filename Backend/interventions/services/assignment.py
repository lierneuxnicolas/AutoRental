from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction

from accounts.models import Role, User
from interventions.models import Intervention
from notifications.services import create_notification


@dataclass(frozen=True)
class InterventionAssignmentError(ValueError):
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _raise_assignment_error(code: str, message: str) -> None:
    raise InterventionAssignmentError(code=code, message=message)


def _assert_manager_role(*, manager) -> None:
    if manager is None or not getattr(manager, "is_authenticated", False):
        _raise_assignment_error("AUTH_REQUIRED", "Authentification manager requise.")

    if not getattr(manager, "is_active", False):
        _raise_assignment_error("MANAGER_INACTIVE", "Le manager est inactif.")

    role_code = getattr(getattr(manager, "role", None), "code", None)
    if role_code not in {Role.Code.GESTIONNAIRE_COMPTABLE, Role.Code.ADMINISTRATEUR}:
        _raise_assignment_error(
            "FORBIDDEN_MANAGER_ROLE",
            "Le manager doit avoir le role GESTIONNAIRE_COMPTABLE ou ADMINISTRATEUR.",
        )


def _assert_assignee_role(*, intervention: Intervention, assigned_user) -> None:
    if assigned_user is None:
        _raise_assignment_error("ASSIGNED_USER_REQUIRED", "assigned_user est obligatoire pour l'attribution.")

    if not getattr(assigned_user, "is_active", False):
        _raise_assignment_error("ASSIGNED_USER_INACTIVE", "L'utilisateur assigne est inactif.")

    assignee_role_code = getattr(getattr(assigned_user, "role", None), "code", None)
    if intervention.intervention_type == Intervention.Type.MECANIQUE:
        expected_role = Role.Code.MECANICIEN
    elif intervention.intervention_type == Intervention.Type.NETTOYAGE:
        expected_role = Role.Code.NETTOYEUR
    else:
        _raise_assignment_error(
            "INVALID_INTERVENTION_TYPE",
            "Type d'intervention non supporte pour l'attribution.",
        )

    if assignee_role_code != expected_role:
        _raise_assignment_error(
            "INVALID_ASSIGNEE_ROLE",
            f"Le role assigne doit etre {expected_role}.",
        )


def _resolve_assigned_user(*, assigned_user_id: int):
    return User.objects.filter(pk=assigned_user_id).first()


def assign_intervention(*, intervention, assigned_user_id: int, manager):
    _assert_manager_role(manager=manager)
    assigned_user = _resolve_assigned_user(assigned_user_id=assigned_user_id)

    with transaction.atomic():
        intervention_locked = Intervention.objects.select_for_update().get(pk=intervention.pk)
        _assert_assignee_role(intervention=intervention_locked, assigned_user=assigned_user)

        intervention_locked.assigned_to = assigned_user
        intervention_locked.status = Intervention.Status.ATTRIBUEE
        intervention_locked.save(update_fields=["assigned_to", "status", "updated_at"])

        notification_message = (
            f"Une intervention {intervention_locked.reference} vous a ete attribuee."
        )
        transaction.on_commit(
            lambda: create_notification(
                user=assigned_user,
                notification_type="INTERVENTION_ASSIGNED",
                title="Intervention attribuee",
                message=notification_message,
                related_object_type="Intervention",
                related_object_id=intervention_locked.id,
            )
        )

        intervention.assigned_to = intervention_locked.assigned_to
        intervention.status = intervention_locked.status

    return intervention
