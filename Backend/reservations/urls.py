from django.urls import path

from inspections.views import DepartureInspectionCreateView, ReturnInspectionCreateView
from reservations.views import (
    PriceSimulationView,
    ReservationClientCancelView,
    ReservationClientCancelPreviewView,
    ReservationClientCriticalAnomalyCancelView,
    ReservationClientDepositAuthorizeView,
    ReservationClientDetailView,
    ReservationClientListCreateView,
    ReservationClientPaymentIntentView,
    ReservationLockView,
    ReservationManagementCancellationView,
    ReservationManagementDetailView,
    ReservationManagementCompleteView,
    ReservationManagementDepositReleaseView,
    ReservationManagementIssueView,
    ReservationManagementListView,
    ReservationManagementReviewDecisionView,
    ReservationReassignView,
    ReservationReplacementVehicleListView,
    ReservationUnavailableCancellationView,
    ReservationVehicleUnavailableCancellationView,
    ReservationUnlockView,
)

app_name = "reservations"

urlpatterns = [
    path("simulations/", PriceSimulationView.as_view(), name="price-simulation"),
    path("reservations/", ReservationClientListCreateView.as_view(), name="reservation-list-create"),
    path("reservations/<int:pk>/", ReservationClientDetailView.as_view(), name="reservation-detail"),
    path(
        "reservations/<int:pk>/inspections/departure/",
        DepartureInspectionCreateView.as_view(),
        name="reservation-departure-inspection",
    ),
    path(
        "reservations/<int:pk>/inspections/return/",
        ReturnInspectionCreateView.as_view(),
        name="reservation-return-inspection",
    ),
    path("reservations/<int:pk>/deposit/", ReservationClientDepositAuthorizeView.as_view(), name="reservation-deposit-authorize"),
    path("reservations/<int:pk>/payment-intent/", ReservationClientPaymentIntentView.as_view(), name="reservation-payment-intent"),
    path("reservations/<int:pk>/cancel-preview/", ReservationClientCancelPreviewView.as_view(), name="reservation-cancel-preview"),
    path("reservations/<int:pk>/cancel/", ReservationClientCancelView.as_view(), name="reservation-cancel"),
    path(
        "reservations/<int:pk>/cancel-critical-checkin-anomaly/",
        ReservationClientCriticalAnomalyCancelView.as_view(),
        name="reservation-cancel-critical-checkin-anomaly",
    ),
    path("reservations/<int:pk>/unlock/", ReservationUnlockView.as_view(), name="reservation-unlock"),
    path("reservations/<int:pk>/lock/", ReservationLockView.as_view(), name="reservation-lock"),
    # Management endpoints (point 39F)
    path("management/reservations/", ReservationManagementListView.as_view(), name="management-reservation-list"),
    path("management/reservations/<int:pk>/", ReservationManagementDetailView.as_view(), name="management-reservation-detail"),
    path(
        "management/reservations/<int:pk>/cancel/",
        ReservationManagementCancellationView.as_view(),
        name="management-reservation-cancel",
    ),
    path(
        "management/reservations/<int:pk>/replacement-vehicles/",
        ReservationReplacementVehicleListView.as_view(),
        name="management-reservation-replacement-vehicles",
    ),
    path(
        "management/reservations/<int:pk>/reassign/",
        ReservationReassignView.as_view(),
        name="management-reservation-reassign",
    ),
    path(
        "management/reservations/<int:pk>/cancel-unavailable/",
        ReservationUnavailableCancellationView.as_view(),
        name="management-reservation-cancel-unavailable",
    ),
    path(
        "management/reservations/<int:pk>/cancel-vehicle-unavailable/",
        ReservationVehicleUnavailableCancellationView.as_view(),
        name="management-reservation-cancel-vehicle-unavailable",
    ),
    path(
        "management/reservations/<int:pk>/complete/",
        ReservationManagementCompleteView.as_view(),
        name="management-reservation-complete",
    ),
    path(
        "management/reservations/<int:pk>/report-issue/",
        ReservationManagementIssueView.as_view(),
        name="management-reservation-report-issue",
    ),
    path(
        "management/reservations/<int:pk>/review-decision/",
        ReservationManagementReviewDecisionView.as_view(),
        name="management-reservation-review-decision",
    ),
    path(
        "management/reservations/<int:pk>/release-deposit/",
        ReservationManagementDepositReleaseView.as_view(),
        name="management-reservation-release-deposit",
    ),
]
