from django.urls import path

from inspections.views import (
	DepartureInspectionCompleteView,
	DepartureVehicleStateUpsertView,
	DemoReturnKeyCheckView,
	InspectionDamageCreateView,
	InspectionPhotoCreateView,
)

app_name = "inspections"

urlpatterns = [
	path("inspections/<int:pk>/photos/", InspectionPhotoCreateView.as_view(), name="inspection-photos-create"),
	path("inspections/<int:pk>/damages/", InspectionDamageCreateView.as_view(), name="inspection-damages-create"),
	path("inspections/<int:pk>/vehicle-state/", DepartureVehicleStateUpsertView.as_view(), name="inspection-vehicle-state-upsert"),
	path("inspections/<int:pk>/complete/", DepartureInspectionCompleteView.as_view(), name="inspection-complete"),
	path("inspections/<int:pk>/demo-return-key-check/", DemoReturnKeyCheckView.as_view(), name="inspection-demo-return-key-check"),
]