from rest_framework.permissions import BasePermission

from accounts.models import Role


def _user_has_active_role(user, role_code):
	if not user or not getattr(user, "is_authenticated", False):
		return False
	if not getattr(user, "is_active", False):
		return False
	role = getattr(user, "role", None)
	if role is None or not getattr(role, "is_active", False):
		return False
	return role.code == role_code


def _object_assigned_to_request_user(obj, request):
	assigned_to = getattr(obj, "assigned_to", None)
	if assigned_to is None:
		return False
	return assigned_to == request.user


def _is_mechanic_intervention(obj):
	intervention_type = getattr(obj, "type", None)
	if intervention_type is None:
		intervention_type = getattr(obj, "intervention_type", None)
	if intervention_type is None:
		return True
	return str(intervention_type).upper() == "MECANIQUE"


class _RolePermission(BasePermission):
	role_code = None
	message = "Cette action n'est pas autorisee."

	def has_permission(self, request, view):
		return _user_has_active_role(request.user, self.role_code)


class IsClient(_RolePermission):
	role_code = Role.Code.CLIENT
	message = "Cette action est reservee aux clients."


class IsManager(_RolePermission):
	role_code = Role.Code.GESTIONNAIRE_COMPTABLE
	message = "Cette action est reservee aux gestionnaires-comptables."


class IsAdministrator(BasePermission):
	message = "Cette action est reservee aux administrateurs."

	def has_permission(self, request, view):
		user = request.user
		if not user or not getattr(user, "is_authenticated", False):
			return False
		if getattr(user, "is_active", False) and getattr(user, "is_superuser", False):
			return True
		return _user_has_active_role(user, Role.Code.ADMINISTRATEUR)


class IsMechanic(_RolePermission):
	role_code = Role.Code.MECANICIEN
	message = "Cette action est reservee aux mecaniciens."


class IsCleaner(_RolePermission):
	role_code = Role.Code.NETTOYEUR
	message = "Cette action est reservee au service de nettoyage."


class IsManagerOrAdministrator(BasePermission):
	message = "Cette action est reservee aux gestionnaires-comptables ou aux administrateurs."

	def has_permission(self, request, view):
		user = request.user
		if not user or not getattr(user, "is_authenticated", False):
			return False
		if getattr(user, "is_active", False) and getattr(user, "is_superuser", False):
			return True
		return _user_has_active_role(user, Role.Code.GESTIONNAIRE_COMPTABLE) or _user_has_active_role(
			user, Role.Code.ADMINISTRATEUR
		)


class IsReservationOwner(_RolePermission):
	"""Allow access only when Reservation.client.user matches request.user."""

	role_code = Role.Code.CLIENT
	message = "Vous ne pouvez acceder qu'a vos propres reservations."

	def has_permission(self, request, view):
		return super().has_permission(request, view)

	def has_object_permission(self, request, view, obj):
		if not super().has_permission(request, view):
			return False
		client = getattr(obj, "client", None)
		if client is None:
			return False
		owner = getattr(client, "user", None)
		if owner is None:
			return False
		return owner == request.user


class IsAssignedMechanic(_RolePermission):
	"""DRF object permissions do not filter list views automatically; use a queryset like Intervention.objects.filter(assigned_to=request.user). Contract attendu: Intervention.assigned_to."""

	role_code = Role.Code.MECANICIEN
	message = "Cette intervention ne vous est pas attribuee ou n'est pas une intervention mecanique autorisee."

	def has_permission(self, request, view):
		return super().has_permission(request, view)

	def has_object_permission(self, request, view, obj):
		if not super().has_permission(request, view):
			return False
		if not _object_assigned_to_request_user(obj, request):
			return False
		return _is_mechanic_intervention(obj)


class IsAssignedCleaner(_RolePermission):
	"""DRF object permissions do not filter list views automatically; use a queryset like Intervention.objects.filter(assigned_to=request.user). Contract attendu: Intervention.assigned_to."""

	role_code = Role.Code.NETTOYEUR
	message = "Cette intervention de nettoyage ne vous est pas attribuee."

	def has_permission(self, request, view):
		return super().has_permission(request, view)

	def has_object_permission(self, request, view, obj):
		if not super().has_permission(request, view):
			return False
		return _object_assigned_to_request_user(obj, request)