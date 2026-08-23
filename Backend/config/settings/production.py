import os

from .base import *  # noqa: F401,F403

DEBUG = False


def _env_list(name: str) -> list[str]:
    raw_value = os.getenv(name, "")
    return [item.strip() for item in raw_value.split(",") if item.strip()]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS")
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = [
        "getacar-backend.salmonmushroom-b250896e.northeurope.azurecontainerapps.io",
    ]

_default_frontend_origins = [
    "https://getacar.be",
    "https://www.getacar.be",
]
_frontend_url = (os.getenv("FRONTEND_URL", "") or "").strip()
if _frontend_url.startswith("http://") or _frontend_url.startswith("https://"):
    _default_frontend_origins.append(_frontend_url.rstrip("/"))

CORS_ALLOWED_ORIGINS = _env_list("DJANGO_CORS_ALLOWED_ORIGINS")
if not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = _default_frontend_origins
CORS_ALLOWED_ORIGINS = _dedupe(CORS_ALLOWED_ORIGINS)

CSRF_TRUSTED_ORIGINS = _env_list("DJANGO_CSRF_TRUSTED_ORIGINS")
if not CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS.copy()
CSRF_TRUSTED_ORIGINS = _dedupe(CSRF_TRUSTED_ORIGINS)

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

DATABASES["default"]["OPTIONS"] = {
    **DATABASES["default"].get("OPTIONS", {}),
    "ssl": {
        "ca": os.getenv("DB_SSL_CA", "/etc/ssl/certs/ca-certificates.crt"),
    },
}

AZURE_ACCOUNT_NAME = os.getenv("AZURE_ACCOUNT_NAME", "")
AZURE_ACCOUNT_KEY = os.getenv("AZURE_ACCOUNT_KEY", "")
AZURE_CONTAINER = os.getenv("AZURE_CONTAINER", "media")

STORAGES = {
    "default": {
        "BACKEND": "storages.backends.azure_storage.AzureStorage",
        "OPTIONS": {
            "account_name": AZURE_ACCOUNT_NAME,
            "account_key": AZURE_ACCOUNT_KEY,
            "azure_container": AZURE_CONTAINER,
            "overwrite_files": False,
            "expiration_secs": 3600,
        },
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}