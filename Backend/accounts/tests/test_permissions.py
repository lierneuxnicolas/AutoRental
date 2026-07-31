from types import SimpleNamespace

from django.contrib.auth.models import AnonymousUser
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from accounts.models import ClientProfile, Role, User
from accounts.permissions import (
	IsAdministrator,
	IsAssignedCleaner,
	IsAssignedMechanic,
	IsCleaner,
	IsClient,
	IsManager,
	IsManagerOrAdministrator,
	IsMechanic,
	IsReservationOwner,
)


class PermissionTestMixin:
	permission_class = None
	view = object()
	method = "get"

	def setUp(self):
		super().setUp()
		self.factory = APIRequestFactory()

	def build_request(self, user=None):
		request = self.factory.get("/")
		request.user = user if user is not None else AnonymousUser()
		return request

	def assert_permission(self, user, expected):
		permission = self.permission_class()
		request = self.build_request(user)
		self.assertEqual(permission.has_permission(request, self.view), expected)


class AccountsPermissionTests(TestCase):
	@classmethod
	def setUpTestData(cls):
		cls.roles = {}
		for code, label in [
			(Role.Code.CLIENT, "Client"),
			(Role.Code.GESTIONNAIRE_COMPTABLE, "Gestionnaire-comptable"),
			(Role.Code.ADMINISTRATEUR, "Administrateur"),
			(Role.Code.MECANICIEN, "Mecanicien"),
			(Role.Code.NETTOYEUR, "Nettoyeur"),
		]:
			cls.roles[code] = Role.objects.create(
				code=code,
				label=label,
				description=f"Role {label}",
				is_active=True,
			)

		cls.inactive_role = Role.objects.create(
			code="ROLE_INACTIF_TEST",
			label="Role inactif",
			description="Role de test inactif",
			is_active=False,
		)

		cls.client_user = User.objects.create_user(
			email="client@example.com",
			password="Password123!",
			first_name="Client",
			last_name="Test",
			phone="0102030405",
			role=cls.roles[Role.Code.CLIENT],
		)
		cls.manager_user = User.objects.create_user(
			email="manager@example.com",
			password="Password123!",
			first_name="Manager",
			last_name="Test",
			phone="0102030406",
			role=cls.roles[Role.Code.GESTIONNAIRE_COMPTABLE],
		)
		cls.admin_user = User.objects.create_user(
			email="admin@example.com",
			password="Password123!",
			first_name="Admin",
			last_name="Test",
			phone="0102030407",
			role=cls.roles[Role.Code.ADMINISTRATEUR],
			is_staff=True,
		)
		cls.mechanic_user = User.objects.create_user(
			email="mechanic@example.com",
			password="Password123!",
			first_name="Mechanic",
			last_name="Test",
			phone="0102030408",
			role=cls.roles[Role.Code.MECANICIEN],
		)
		cls.cleaner_user = User.objects.create_user(
			email="cleaner@example.com",
			password="Password123!",
			first_name="Cleaner",
			last_name="Test",
			phone="0102030409",
			role=cls.roles[Role.Code.NETTOYEUR],
		)
		cls.inactive_user = User.objects.create_user(
			email="inactive@example.com",
			password="Password123!",
			first_name="Inactive",
			last_name="User",
			phone="0102030410",
			role=cls.roles[Role.Code.CLIENT],
			is_active=False,
		)
		cls.no_role_user = User.objects.create_user(
			email="norole@example.com",
			password="Password123!",
			first_name="No",
			last_name="Role",
			phone="0102030411",
			role=None,
		)
		cls.inactive_role_user = User.objects.create_user(
			email="inactive-role@example.com",
			password="Password123!",
			first_name="Inactive",
			last_name="Role",
			phone="0102030412",
			role=cls.inactive_role,
		)
		cls.superuser = User.objects.create_superuser(
			email="superuser@example.com",
			password="Password123!",
			first_name="Super",
			last_name="User",
			phone="0102030413",
		)

	def make_request(self, user=None):
		request = APIRequestFactory().get("/")
		request.user = user if user is not None else AnonymousUser()
		return request

	def assert_general_access(self, permission_class, allowed_user, denied_user):
		permission = permission_class()
		self.assertTrue(permission.has_permission(self.make_request(allowed_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(denied_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(None), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.no_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_role_user), object()))

	def test_is_client(self):
		self.assertGeneral = self.assert_general_access
		permission = IsClient()
		self.assertTrue(permission.has_permission(self.make_request(self.client_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.manager_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(None), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.no_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.superuser), object()))

	def test_is_manager(self):
		permission = IsManager()
		self.assertTrue(permission.has_permission(self.make_request(self.manager_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.client_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(None), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.no_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.superuser), object()))

	def test_is_administrator(self):
		permission = IsAdministrator()
		self.assertTrue(permission.has_permission(self.make_request(self.admin_user), object()))
		self.assertTrue(permission.has_permission(self.make_request(self.superuser), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.client_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(None), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.no_role_user), object()))

	def test_is_mechanic(self):
		permission = IsMechanic()
		self.assertTrue(permission.has_permission(self.make_request(self.mechanic_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.client_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(None), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.no_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.superuser), object()))

	def test_is_cleaner(self):
		permission = IsCleaner()
		self.assertTrue(permission.has_permission(self.make_request(self.cleaner_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.client_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(None), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.no_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.superuser), object()))

	def test_is_manager_or_administrator(self):
		permission = IsManagerOrAdministrator()
		self.assertTrue(permission.has_permission(self.make_request(self.manager_user), object()))
		self.assertTrue(permission.has_permission(self.make_request(self.admin_user), object()))
		self.assertTrue(permission.has_permission(self.make_request(self.superuser), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.client_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(None), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.inactive_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.no_role_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.mechanic_user), object()))
		self.assertFalse(permission.has_permission(self.make_request(self.cleaner_user), object()))


class ReservationOwnerPermissionTests(TestCase):
	@classmethod
	def setUpTestData(cls):
		cls.client_role = Role.objects.create(
			code=Role.Code.CLIENT,
			label="Client",
			description="Role client",
			is_active=True,
		)
		cls.manager_role = Role.objects.create(
			code=Role.Code.GESTIONNAIRE_COMPTABLE,
			label="Gestionnaire-comptable",
			description="Role gestionnaire",
			is_active=True,
		)
		cls.admin_role = Role.objects.create(
			code=Role.Code.ADMINISTRATEUR,
			label="Administrateur",
			description="Role administrateur",
			is_active=True,
		)
		cls.other_role = Role.objects.create(
			code=Role.Code.MECANICIEN,
			label="Mecanicien",
			description="Role mecanicien",
			is_active=True,
		)
		cls.client_user = User.objects.create_user(
			email="reservation-client@example.com",
			password="Password123!",
			first_name="Client",
			last_name="Owner",
			phone="0102030401",
			role=cls.client_role,
		)
		cls.other_client_user = User.objects.create_user(
			email="reservation-other@example.com",
			password="Password123!",
			first_name="Other",
			last_name="Client",
			phone="0102030402",
			role=cls.client_role,
		)
		cls.manager_user = User.objects.create_user(
			email="reservation-manager@example.com",
			password="Password123!",
			first_name="Manager",
			last_name="Owner",
			phone="0102030403",
			role=cls.manager_role,
		)
		cls.admin_user = User.objects.create_user(
			email="reservation-admin@example.com",
			password="Password123!",
			first_name="Admin",
			last_name="Owner",
			phone="0102030404",
			role=cls.admin_role,
			is_staff=True,
		)
		cls.other_role_user = User.objects.create_user(
			email="reservation-other-role@example.com",
			password="Password123!",
			first_name="Other",
			last_name="Role",
			phone="0102030405",
			role=cls.other_role,
		)

	def make_request(self, user):
		request = APIRequestFactory().get("/")
		request.user = user
		return request

	def test_owner_permission(self):
		permission = IsReservationOwner()
		owned = SimpleNamespace(client=SimpleNamespace(user=self.client_user))
		other = SimpleNamespace(client=SimpleNamespace(user=self.other_client_user))
		manager_owned = SimpleNamespace(client=SimpleNamespace(user=self.manager_user))
		admin_owned = SimpleNamespace(client=SimpleNamespace(user=self.admin_user))
		missing_client = SimpleNamespace()
		client_none = SimpleNamespace(client=None)
		client_without_user = SimpleNamespace(client=SimpleNamespace(user=None))

		self.assertTrue(permission.has_permission(self.make_request(self.client_user), object()))
		self.assertTrue(permission.has_object_permission(self.make_request(self.client_user), object(), owned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.client_user), object(), other))
		self.assertFalse(permission.has_object_permission(self.make_request(self.manager_user), object(), manager_owned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.admin_user), object(), admin_owned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.client_user), object(), missing_client))
		self.assertFalse(permission.has_object_permission(self.make_request(self.client_user), object(), client_none))
		self.assertFalse(permission.has_object_permission(self.make_request(self.client_user), object(), client_without_user))


class AssignedMechanicPermissionTests(TestCase):
	@classmethod
	def setUpTestData(cls):
		cls.mechanic_role = Role.objects.create(
			code=Role.Code.MECANICIEN,
			label="Mecanicien",
			description="Role mecanicien",
			is_active=True,
		)
		cls.cleaner_role = Role.objects.create(
			code=Role.Code.NETTOYEUR,
			label="Nettoyeur",
			description="Role nettoyeur",
			is_active=True,
		)
		cls.manager_role = Role.objects.create(
			code=Role.Code.GESTIONNAIRE_COMPTABLE,
			label="Gestionnaire-comptable",
			description="Role gestionnaire",
			is_active=True,
		)
		cls.mechanic_user = User.objects.create_user(
			email="assigned-mechanic@example.com",
			password="Password123!",
			first_name="Mechanic",
			last_name="Assigned",
			phone="0102030401",
			role=cls.mechanic_role,
		)
		cls.other_mechanic_user = User.objects.create_user(
			email="other-mechanic@example.com",
			password="Password123!",
			first_name="Other",
			last_name="Mechanic",
			phone="0102030402",
			role=cls.mechanic_role,
		)
		cls.cleaner_user = User.objects.create_user(
			email="assigned-cleaner@example.com",
			password="Password123!",
			first_name="Cleaner",
			last_name="Assigned",
			phone="0102030403",
			role=cls.cleaner_role,
		)
		cls.manager_user = User.objects.create_user(
			email="assigned-manager@example.com",
			password="Password123!",
			first_name="Manager",
			last_name="Assigned",
			phone="0102030404",
			role=cls.manager_role,
		)

	def make_request(self, user):
		request = APIRequestFactory().get("/")
		request.user = user
		return request

	def test_assigned_mechanic_permission(self):
		permission = IsAssignedMechanic()
		assigned = SimpleNamespace(assigned_to=self.mechanic_user, type="MECANIQUE")
		other_mechanic = SimpleNamespace(assigned_to=self.other_mechanic_user, type="MECANIQUE")
		cleaner_assigned = SimpleNamespace(assigned_to=self.cleaner_user, type="MECANIQUE")
		manager_assigned = SimpleNamespace(assigned_to=self.manager_user, type="MECANIQUE")
		non_mechanical = SimpleNamespace(assigned_to=self.mechanic_user, type="NETTOYAGE")
		missing_assigned_to = SimpleNamespace(type="MECANIQUE")
		assigned_to_none = SimpleNamespace(assigned_to=None, type="MECANIQUE")

		self.assertTrue(permission.has_permission(self.make_request(self.mechanic_user), object()))
		self.assertTrue(permission.has_object_permission(self.make_request(self.mechanic_user), object(), assigned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.mechanic_user), object(), other_mechanic))
		self.assertFalse(permission.has_object_permission(self.make_request(self.mechanic_user), object(), cleaner_assigned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.mechanic_user), object(), manager_assigned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.mechanic_user), object(), non_mechanical))
		self.assertFalse(permission.has_object_permission(self.make_request(self.mechanic_user), object(), missing_assigned_to))
		self.assertFalse(permission.has_object_permission(self.make_request(self.mechanic_user), object(), assigned_to_none))


class AssignedCleanerPermissionTests(TestCase):
	@classmethod
	def setUpTestData(cls):
		cls.cleaner_role = Role.objects.create(
			code=Role.Code.NETTOYEUR,
			label="Nettoyeur",
			description="Role nettoyeur",
			is_active=True,
		)
		cls.mechanic_role = Role.objects.create(
			code=Role.Code.MECANICIEN,
			label="Mecanicien",
			description="Role mecanicien",
			is_active=True,
		)
		cls.cleaner_user = User.objects.create_user(
			email="assigned-cleaner2@example.com",
			password="Password123!",
			first_name="Cleaner",
			last_name="Assigned",
			phone="0102030401",
			role=cls.cleaner_role,
		)
		cls.other_cleaner_user = User.objects.create_user(
			email="other-cleaner@example.com",
			password="Password123!",
			first_name="Other",
			last_name="Cleaner",
			phone="0102030402",
			role=cls.cleaner_role,
		)
		cls.mechanic_user = User.objects.create_user(
			email="assigned-mechanic2@example.com",
			password="Password123!",
			first_name="Mechanic",
			last_name="Assigned",
			phone="0102030403",
			role=cls.mechanic_role,
		)
		cls.admin_role = Role.objects.create(
			code=Role.Code.ADMINISTRATEUR,
			label="Administrateur",
			description="Role administrateur",
			is_active=True,
		)
		cls.admin_user = User.objects.create_user(
			email="assigned-admin@example.com",
			password="Password123!",
			first_name="Admin",
			last_name="Assigned",
			phone="0102030404",
			role=cls.admin_role,
			is_staff=True,
		)

	def make_request(self, user):
		request = APIRequestFactory().get("/")
		request.user = user
		return request

	def test_assigned_cleaner_permission(self):
		permission = IsAssignedCleaner()
		assigned = SimpleNamespace(assigned_to=self.cleaner_user)
		other_cleaner = SimpleNamespace(assigned_to=self.other_cleaner_user)
		mechanic_assigned = SimpleNamespace(assigned_to=self.mechanic_user)
		admin_assigned = SimpleNamespace(assigned_to=self.admin_user)
		missing_assigned_to = SimpleNamespace()
		assigned_to_none = SimpleNamespace(assigned_to=None)

		self.assertTrue(permission.has_permission(self.make_request(self.cleaner_user), object()))
		self.assertTrue(permission.has_object_permission(self.make_request(self.cleaner_user), object(), assigned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.cleaner_user), object(), other_cleaner))
		self.assertFalse(permission.has_object_permission(self.make_request(self.cleaner_user), object(), mechanic_assigned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.cleaner_user), object(), admin_assigned))
		self.assertFalse(permission.has_object_permission(self.make_request(self.cleaner_user), object(), missing_assigned_to))
		self.assertFalse(permission.has_object_permission(self.make_request(self.cleaner_user), object(), assigned_to_none))
