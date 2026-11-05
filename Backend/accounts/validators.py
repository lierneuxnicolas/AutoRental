import unicodedata

from rest_framework import serializers


_NAME_SEPARATORS = {" ", "'", "\u2019", "-"}


def validate_person_name(value: str, *, label: str) -> str:
    cleaned = unicodedata.normalize("NFC", value.strip())
    is_valid = bool(cleaned)
    for index, character in enumerate(cleaned):
        category = unicodedata.category(character)
        if category.startswith("L"):
            continue
        if category.startswith("M") and index > 0 and unicodedata.category(cleaned[index - 1])[0] in {"L", "M"}:
            continue
        if (
            character in _NAME_SEPARATORS
            and index > 0
            and index < len(cleaned) - 1
            and unicodedata.category(cleaned[index - 1])[0] in {"L", "M"}
            and unicodedata.category(cleaned[index + 1])[0] in {"L", "M"}
        ):
            continue
        is_valid = False
        break

    if not is_valid:
        raise serializers.ValidationError(
            f"Le {label} ne peut contenir que des lettres, des espaces, des apostrophes ou des traits d'union."
        )
    return cleaned


def validate_phone_number(value: str) -> str:
    cleaned = value.strip()
    if cleaned and (len(cleaned) != 10 or not all("0" <= digit <= "9" for digit in cleaned)):
        raise serializers.ValidationError(
            "Le numéro de téléphone doit contenir exactement 10 chiffres."
        )
    return cleaned
