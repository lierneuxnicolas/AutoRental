import os

from .base import *  # noqa: F401,F403

ALLOW_DEMO_SEED = True

# Keep local file storage stable when switching between working copies.
MEDIA_ROOT = os.getenv("DJANGO_MEDIA_ROOT") or MEDIA_ROOT

DEBUG = os.getenv("DJANGO_DEBUG", "False").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = [
    "127.0.0.1",
    "localhost",
]

# EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
]