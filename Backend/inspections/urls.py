from django.urls import path

from inspections.views import InspectionDamageCreateView, InspectionPhotoCreateView

app_name = "inspections"

urlpatterns = [
	path("inspections/<int:pk>/photos/", InspectionPhotoCreateView.as_view(), name="inspection-photos-create"),
	path("inspections/<int:pk>/damages/", InspectionDamageCreateView.as_view(), name="inspection-damages-create"),
]