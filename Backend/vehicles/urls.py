from django.urls import path

from vehicles.views import (
	ParkingPublicListView,
	VehicleManagementCreateView,
	VehicleManagementStatusUpdateView,
	VehicleManagementUpdateView,
	VehiclePhotoCreateView,
	VehiclePhotoDeleteView,
	VehicleAvailablePublicListView,
	VehicleCategoryPublicListView,
	VehiclePublicDetailView,
	VehiclePublicListView,
)

app_name = "vehicles"

urlpatterns = [
	path("vehicles/", VehiclePublicListView.as_view(), name="public-vehicles-list"),
	path("vehicles/available/", VehicleAvailablePublicListView.as_view(), name="public-vehicles-available"),
	path("vehicles/<int:pk>/", VehiclePublicDetailView.as_view(), name="public-vehicles-detail"),
	path("management/vehicles/", VehicleManagementCreateView.as_view(), name="management-vehicles-create"),
	path("management/vehicles/<int:pk>/", VehicleManagementUpdateView.as_view(), name="management-vehicles-update"),
	path(
		"management/vehicles/<int:pk>/status/",
		VehicleManagementStatusUpdateView.as_view(),
		name="management-vehicles-status-update",
	),
	path(
		"management/vehicles/<int:pk>/photos/",
		VehiclePhotoCreateView.as_view(),
		name="management-vehicles-photos-create",
	),
	path(
		"management/vehicles/<int:pk>/photos/<int:photo_id>/",
		VehiclePhotoDeleteView.as_view(),
		name="management-vehicles-photos-delete",
	),
	path(
		"vehicle-categories/",
		VehicleCategoryPublicListView.as_view(),
		name="public-vehicle-categories-list",
	),
	path("parkings/", ParkingPublicListView.as_view(), name="public-parkings-list"),
]
