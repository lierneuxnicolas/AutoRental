from django.urls import path

from accounts.views import (
    ClientDocumentDetailView,
    ClientDocumentListCreateView,
    ClientProfileProgressView,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    TokenRefreshView,
    VerifyEmailView,
    ManagementClientDocumentDetailView,
    ManagementClientDocumentListView,
    ManagementClientDocumentRejectView,
    ManagementClientDocumentValidateView,
)

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/verify-email/", VerifyEmailView.as_view(), name="auth-verify-email"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path(
        "auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("users/me/documents/", ClientDocumentListCreateView.as_view(), name="users-me-documents"),
    path(
        "users/me/documents/<int:pk>/",
        ClientDocumentDetailView.as_view(),
        name="users-me-documents-detail",
    ),
    path(
        "management/documents/",
        ManagementClientDocumentListView.as_view(),
        name="management-documents",
    ),
    path(
        "management/documents/<int:pk>/",
        ManagementClientDocumentDetailView.as_view(),
        name="management-documents-detail",
    ),
    path(
        "management/documents/<int:pk>/validate/",
        ManagementClientDocumentValidateView.as_view(),
        name="management-documents-validate",
    ),
    path(
        "management/documents/<int:pk>/reject/",
        ManagementClientDocumentRejectView.as_view(),
        name="management-documents-reject",
    ),
    path("users/me/profile-progress/", ClientProfileProgressView.as_view(), name="users-me-profile-progress"),
]
