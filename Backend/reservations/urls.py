from django.urls import path

from reservations.views import (
    PriceSimulationView,
    ReservationClientCancelView,
    ReservationClientDetailView,
    ReservationClientListCreateView,
    ReservationManagementDetailView,
    ReservationManagementListView,
)

app_name = "reservations"

urlpatterns = [
    path("simulations/", PriceSimulationView.as_view(), name="price-simulation"),
    path("reservations/", ReservationClientListCreateView.as_view(), name="reservation-list-create"),
    path("reservations/<int:pk>/", ReservationClientDetailView.as_view(), name="reservation-detail"),
    path("reservations/<int:pk>/cancel/", ReservationClientCancelView.as_view(), name="reservation-cancel"),
    # Management endpoints (point 39F)
    path("management/reservations/", ReservationManagementListView.as_view(), name="management-reservation-list"),
    path("management/reservations/<int:pk>/", ReservationManagementDetailView.as_view(), name="management-reservation-detail"),
]
