from django.urls import path

from vehicles.views import (
	ParkingPublicListView,
	VehicleManagementCreateView,
	VehicleManagementStatusUpdateView,
	VehicleManagementUpdateView,
	VehicleCategoryPublicListView,
	VehiclePublicDetailView,
	VehiclePublicListView,
)

app_name = "vehicles"

urlpatterns = [
	path("vehicles/", VehiclePublicListView.as_view(), name="public-vehicles-list"),
	path("vehicles/<int:id>/", VehiclePublicDetailView.as_view(), name="public-vehicles-detail"),
	path("management/vehicles/", VehicleManagementCreateView.as_view(), name="management-vehicles-create"),
	path("management/vehicles/<int:id>/", VehicleManagementUpdateView.as_view(), name="management-vehicles-update"),
	path(
		"management/vehicles/<int:id>/status/",
		VehicleManagementStatusUpdateView.as_view(),
		name="management-vehicles-status-update",
	),
	path(
		"vehicle-categories/",
		VehicleCategoryPublicListView.as_view(),
		name="public-vehicle-categories-list",
	),
	path("parkings/", ParkingPublicListView.as_view(), name="public-parkings-list"),
]
