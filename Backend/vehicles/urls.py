from django.urls import path

from vehicles.views import (
	ParkingPublicListView,
	VehicleCategoryPublicListView,
	VehiclePublicDetailView,
	VehiclePublicListView,
)

app_name = "vehicles"

urlpatterns = [
	path("vehicles/", VehiclePublicListView.as_view(), name="public-vehicles-list"),
	path("vehicles/<int:id>/", VehiclePublicDetailView.as_view(), name="public-vehicles-detail"),
	path(
		"vehicle-categories/",
		VehicleCategoryPublicListView.as_view(),
		name="public-vehicle-categories-list",
	),
	path("parkings/", ParkingPublicListView.as_view(), name="public-parkings-list"),
]
