from django.urls import path

from inspections.views import DepartureInspectionCreateView, ReturnInspectionCreateView
from reservations.views import (
    PriceSimulationView,
    ReservationClientCancelView,
    ReservationClientDepositAuthorizeView,
    ReservationClientDetailView,
    ReservationClientListCreateView,
    ReservationClientPaymentIntentView,
    ReservationLockView,
    ReservationManagementDetailView,
    ReservationManagementCompleteView,
    ReservationManagementListView,
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
    path("reservations/<int:pk>/cancel/", ReservationClientCancelView.as_view(), name="reservation-cancel"),
    path("reservations/<int:pk>/unlock/", ReservationUnlockView.as_view(), name="reservation-unlock"),
    path("reservations/<int:pk>/lock/", ReservationLockView.as_view(), name="reservation-lock"),
    # Management endpoints (point 39F)
    path("management/reservations/", ReservationManagementListView.as_view(), name="management-reservation-list"),
    path("management/reservations/<int:pk>/", ReservationManagementDetailView.as_view(), name="management-reservation-detail"),
    path(
        "management/reservations/<int:pk>/complete/",
        ReservationManagementCompleteView.as_view(),
        name="management-reservation-complete",
    ),
]
