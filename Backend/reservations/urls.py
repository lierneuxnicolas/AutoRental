from django.urls import path

from reservations.views import PriceSimulationView

app_name = "reservations"

urlpatterns = [
    path("simulations/", PriceSimulationView.as_view(), name="price-simulation"),
]
