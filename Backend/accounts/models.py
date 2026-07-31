from django.contrib.auth.models import AbstractUser, BaseUserManager, Group, Permission
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Role(models.Model):
	class Code(models.TextChoices):
		CLIENT = "CLIENT", "Client"
		GESTIONNAIRE_COMPTABLE = "GESTIONNAIRE_COMPTABLE", "Gestionnaire comptable"
		ADMINISTRATEUR = "ADMINISTRATEUR", "Administrateur"
		MECANICIEN = "MECANICIEN", "Mecanicien"
		NETTOYEUR = "NETTOYEUR", "Nettoyeur"

	code = models.CharField(max_length=40, choices=Code.choices, unique=True)
	label = models.CharField(max_length=120)
	description = models.TextField(blank=True, null=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["label"]
		indexes = [
			models.Index(fields=["is_active"], name="role_is_active_idx"),
			models.Index(fields=["created_at"], name="role_created_at_idx"),
		]
		constraints = [
			models.UniqueConstraint(fields=["code"], name="role_code_unique"),
		]

	def __str__(self) -> str:
		return f"{self.label} ({self.code})"


class UserManager(BaseUserManager):
	use_in_migrations = True

	def create_user(self, email, password=None, **extra_fields):
		if not email:
			raise ValueError("The email field must be set")
		email = self.normalize_email(email)
		user = self.model(email=email, **extra_fields)
		user.set_password(password)
		user.save(using=self._db)
		return user

	def create_superuser(self, email, password=None, **extra_fields):
		extra_fields.setdefault("is_staff", True)
		extra_fields.setdefault("is_superuser", True)
		extra_fields.setdefault("is_active", True)

		if extra_fields.get("is_staff") is not True:
			raise ValueError("Superuser must have is_staff=True.")
		if extra_fields.get("is_superuser") is not True:
			raise ValueError("Superuser must have is_superuser=True.")

		return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
	username = None
	email = models.EmailField(_("email address"), unique=True)
	first_name = models.CharField(max_length=150)
	last_name = models.CharField(max_length=150)
	phone = models.CharField(max_length=30, blank=True)
	role = models.ForeignKey(
		Role,
		on_delete=models.PROTECT,
		related_name="users",
		null=True,
		blank=True,
	)
	email_verified = models.BooleanField(default=False)
	is_active = models.BooleanField(default=True)
	date_joined = models.DateTimeField(auto_now_add=True)

	# Keep distinct reverse names while AUTH_USER_MODEL is not switched yet.
	groups = models.ManyToManyField(
		Group,
		verbose_name=_("groups"),
		blank=True,
		help_text=_(
			"The groups this user belongs to. A user will get all permissions "
			"granted to each of their groups."
		),
		related_name="accounts_user_set",
		related_query_name="accounts_user",
	)
	user_permissions = models.ManyToManyField(
		Permission,
		verbose_name=_("user permissions"),
		blank=True,
		help_text=_("Specific permissions for this user."),
		related_name="accounts_user_set",
		related_query_name="accounts_user",
	)

	USERNAME_FIELD = "email"
	REQUIRED_FIELDS = []

	objects = UserManager()

	class Meta:
		ordering = ["-date_joined", "id"]
		indexes = [
			models.Index(fields=["last_name", "first_name"], name="user_name_idx"),
			models.Index(fields=["role", "is_active"], name="user_role_active_idx"),
			models.Index(fields=["date_joined"], name="user_joined_idx"),
		]

	def __str__(self) -> str:
		return self.email


class ClientProfile(models.Model):
	class ProfileStatus(models.TextChoices):
		INCOMPLET = "INCOMPLET", "Incomplet"
		EN_ATTENTE = "EN_ATTENTE", "En attente"
		VALIDE = "VALIDE", "Valide"
		REFUSE = "REFUSE", "Refuse"
		EXPIRE = "EXPIRE", "Expire"

	user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="client_profile")
	date_of_birth = models.DateField(null=True, blank=True)
	address = models.TextField(blank=True)
	profile_status = models.CharField(
		max_length=20,
		choices=ProfileStatus.choices,
		default=ProfileStatus.INCOMPLET,
	)
	rejection_reason = models.TextField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ["-updated_at", "id"]
		indexes = [
			models.Index(fields=["profile_status"], name="client_profile_status_idx"),
			models.Index(fields=["created_at"], name="client_profile_created_idx"),
			models.Index(fields=["updated_at"], name="client_profile_updated_idx"),
		]

	def clean(self):
		super().clean()
		if self.date_of_birth:
			today = timezone.localdate()
			if self.date_of_birth > today:
				raise ValidationError({"date_of_birth": "La date de naissance ne peut pas etre dans le futur."})
			oldest_allowed = today.replace(year=today.year - 120)
			if self.date_of_birth < oldest_allowed:
				raise ValidationError({"date_of_birth": "La date de naissance semble invalide."})

	@property
	def is_actionable(self) -> bool:
		return self.profile_status in {
			self.ProfileStatus.INCOMPLET,
			self.ProfileStatus.EN_ATTENTE,
			self.ProfileStatus.REFUSE,
		}

	def __str__(self) -> str:
		return f"ClientProfile<{self.user.email}>"
