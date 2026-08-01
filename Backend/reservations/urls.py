from django.urls import path

from reservations.views import (
    PriceSimulationView,
    ReservationClientCancelView,
    ReservationClientDetailView,
    ReservationClientListCreateView,
)

app_name = "reservations"

urlpatterns = [
    path("simulations/", PriceSimulationView.as_view(), name="price-simulation"),
    path("reservations/", ReservationClientListCreateView.as_view(), name="reservation-list-create"),
    path("reservations/<int:pk>/", ReservationClientDetailView.as_view(), name="reservation-detail"),
    path("reservations/<int:pk>/cancel/", ReservationClientCancelView.as_view(), name="reservation-cancel"),
]
