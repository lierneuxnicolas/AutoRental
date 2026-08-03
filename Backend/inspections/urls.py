from django.urls import path

from inspections.views import DepartureInspectionCompleteView, InspectionDamageCreateView, InspectionPhotoCreateView

app_name = "inspections"

urlpatterns = [
	path("inspections/<int:pk>/photos/", InspectionPhotoCreateView.as_view(), name="inspection-photos-create"),
	path("inspections/<int:pk>/damages/", InspectionDamageCreateView.as_view(), name="inspection-damages-create"),
	path("inspections/<int:pk>/complete/", DepartureInspectionCompleteView.as_view(), name="inspection-complete"),
]