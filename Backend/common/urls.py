from django.urls import path

from common.views import SystemLogListView

app_name = "common"

urlpatterns = [
    path("admin/system-logs/", SystemLogListView.as_view(), name="admin-system-logs"),
]
