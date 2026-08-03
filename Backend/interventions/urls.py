from django.urls import path

from interventions.views import InterventionManagementAssignView, InterventionManagementCreateListView

app_name = "interventions"

urlpatterns = [
    path(
        "management/interventions/",
        InterventionManagementCreateListView.as_view(),
        name="management-interventions-list-create",
    ),
    path(
        "management/interventions/<int:id>/assign/",
        InterventionManagementAssignView.as_view(),
        name="management-interventions-assign",
    ),
]
