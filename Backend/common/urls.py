from django.urls import path

from common.views import BackupRecordCreateView, BackupRecordDownloadView, BackupRecordListView, SystemLogListView

app_name = "common"

urlpatterns = [
    path("admin/system-logs/", SystemLogListView.as_view(), name="admin-system-logs"),
    path("admin/backups/", BackupRecordListView.as_view(), name="admin-backups-list"),
    path("admin/backups/create/", BackupRecordCreateView.as_view(), name="admin-backups-create"),
    path("admin/backups/<int:pk>/download/", BackupRecordDownloadView.as_view(), name="admin-backups-download"),
]
