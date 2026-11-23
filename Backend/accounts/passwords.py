from unicodedata import category

from django.core.exceptions import ValidationError

PASSWORD_LENGTH_MESSAGE = "Le mot de passe doit contenir entre 15 et 128 caractères."
PASSWORD_CHARACTER_MESSAGE = "Le mot de passe contient un caractère non autorisé."


class PasswordPolicyValidator:
    def validate(self, password, user=None):
        if not 15 <= len(password) <= 128:
            raise ValidationError(PASSWORD_LENGTH_MESSAGE, code="password_length")
        if password.isspace() or any(
            category(char) in {"Cc", "Cs", "Zl", "Zp"} for char in password
        ):
            raise ValidationError(PASSWORD_CHARACTER_MESSAGE, code="password_characters")

    def get_help_text(self):
        return PASSWORD_LENGTH_MESSAGE
