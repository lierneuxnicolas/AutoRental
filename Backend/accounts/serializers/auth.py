from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from accounts.models import User


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    password_confirm = serializers.CharField(write_only=True, style={"input_type": "password"})
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Un compte avec cet e-mail existe deja.")
        return email

    def validate(self, attrs):
        password = attrs.get("password")
        password_confirm = attrs.pop("password_confirm", None)

        if password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Les mots de passe ne correspondent pas."})

        user = User(
            email=attrs.get("email"),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
            phone=attrs.get("phone", ""),
        )
        validate_password(password, user=user)
        return attrs


class CurrentUserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "email_verified",
            "is_active",
            "date_joined",
        )

    def get_role(self, obj):
        if obj.role is None:
            return None
        return obj.role.code


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField(write_only=True)


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        email = attrs.get(self.username_field, "")
        attrs[self.username_field] = email.strip().lower()

        try:
            data = super().validate(attrs)
        except AuthenticationFailed as exc:
            raise AuthenticationFailed("Identifiants invalides.") from exc

        user = self.user
        if not user.is_active:
            raise AuthenticationFailed("Ce compte est desactive.")

        if not user.email_verified and not user.is_superuser:
            raise AuthenticationFailed("Confirmez votre adresse e-mail avant de vous connecter.")

        data["user"] = {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role.code if user.role else None,
            "email_verified": user.email_verified,
        }
        return data


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=True, write_only=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(write_only=True, required=True, style={"input_type": "password"})
    new_password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={"input_type": "password"},
    )

    default_error_messages = {
        "invalid_link": "Lien de reinitialisation invalide ou expire.",
    }

    def validate(self, attrs):
        password = attrs.get("new_password")
        password_confirm = attrs.get("new_password_confirm")
        if password != password_confirm:
            raise serializers.ValidationError(
                {"new_password_confirm": "Les mots de passe ne correspondent pas."}
            )

        uid = attrs.get("uid")
        token = attrs.get("token")

        try:
            user_id = urlsafe_base64_decode(uid).decode()
        except (TypeError, ValueError, OverflowError, UnicodeDecodeError):
            self.fail("invalid_link")

        user = User.objects.filter(pk=user_id).first()
        if user is None:
            self.fail("invalid_link")

        if not default_token_generator.check_token(user, token):
            self.fail("invalid_link")

        validate_password(password, user=user)

        attrs["user"] = user
        return attrs
