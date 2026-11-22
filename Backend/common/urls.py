from django.urls import path

from common.manager_dashboard import ManagerDashboardView
from common.views import BackupRecordCreateView, BackupRecordDownloadView, BackupRecordListView, SystemLogListView

app_name = "common"

urlpatterns = [
    path("management/dashboard/", ManagerDashboardView.as_view(), name="management-dashboard"),
    path("admin/system-logs/", SystemLogListView.as_view(), name="admin-system-logs"),
    path("admin/backups/", BackupRecordListView.as_view(), name="admin-backups-list"),
    path("admin/backups/create/", BackupRecordCreateView.as_view(), name="admin-backups-create"),
    path("admin/backups/<int:pk>/download/", BackupRecordDownloadView.as_view(), name="admin-backups-download"),
]
