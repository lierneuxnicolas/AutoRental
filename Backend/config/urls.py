"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import (
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    VerifyEmailView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/register/", RegisterView.as_view(), name="auth-register"),
    path("api/v1/auth/login/", LoginView.as_view(), name="auth-login"),
    path("api/v1/auth/token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("api/v1/auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("api/v1/auth/password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path(
        "api/v1/auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("api/v1/auth/me/", MeView.as_view(), name="auth-me"),
    path("api/v1/auth/verify-email/", VerifyEmailView.as_view(), name="auth-verify-email"),
]
