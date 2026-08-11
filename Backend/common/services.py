from __future__ import annotations

import os
from pathlib import Path
import subprocess
from typing import Any

from django.conf import settings
from django.utils import timezone

from common.models import BackupRecord
from common.models import SystemLog


def create_system_log(
    *,
    action: str,
    message: str,
    level: str | SystemLog.Level = SystemLog.Level.INFO,
    user: Any = None,
    ip_address: str | None = None,
) -> SystemLog:
    return SystemLog.objects.create(
        user=user,
        action=action,
        message=message,
        level=level,
        ip_address=ip_address,
    )


def _mark_backup_failed(record: BackupRecord, message: str) -> BackupRecord:
    record.status = BackupRecord.Status.ECHEC
    record.completed_at = timezone.now()
    record.error_message = message[:2000]
    record.save(update_fields=["status", "completed_at", "error_message"])
    return record


def create_database_backup(*, backup_root: Path | None = None) -> BackupRecord:
    timestamp = timezone.now()
    filename = f"autorental_{timestamp:%Y%m%d_%H%M%S}.sql"
    backup_dir = Path(backup_root) if backup_root else Path(settings.BASE_DIR) / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    dump_file_path = backup_dir / filename

    record = BackupRecord.objects.create(
        filename=filename,
        status=BackupRecord.Status.EN_COURS,
        backup_type=BackupRecord.BackupType.DATABASE,
        file_path=str(dump_file_path),
    )

    db_config = settings.DATABASES.get("default", {})
    engine = db_config.get("ENGINE")
    if engine != "django.db.backends.mysql":
        return _mark_backup_failed(record, f"Unsupported database engine for dump: {engine}")

    db_name = db_config.get("NAME")
    db_user = db_config.get("USER")
    db_password = db_config.get("PASSWORD")
    db_host = db_config.get("HOST") or "127.0.0.1"
    db_port = str(db_config.get("PORT") or "3306")

    if not db_name or not db_user:
        return _mark_backup_failed(record, "Database configuration is incomplete for mysqldump.")

    command = [
        "mysqldump",
        f"--host={db_host}",
        f"--port={db_port}",
        f"--user={db_user}",
        "--single-transaction",
        "--skip-lock-tables",
        f"--result-file={dump_file_path}",
        str(db_name),
    ]

    env = os.environ.copy()
    if db_password is not None:
        env["MYSQL_PWD"] = str(db_password)

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            env=env,
        )
    except FileNotFoundError:
        return _mark_backup_failed(record, "mysqldump executable not found.")
    except Exception as exc:
        return _mark_backup_failed(record, f"Unexpected backup error: {exc}")

    if result.returncode != 0:
        error_detail = (result.stderr or result.stdout or "").strip()
        message = f"mysqldump failed with exit code {result.returncode}."
        if error_detail:
            message = f"{message} {error_detail}"
        return _mark_backup_failed(record, message)

    if not dump_file_path.exists():
        return _mark_backup_failed(record, "mysqldump reported success but no dump file was produced.")

    record.status = BackupRecord.Status.REUSSIE
    record.file_size = dump_file_path.stat().st_size
    record.completed_at = timezone.now()
    record.error_message = ""
    record.save(update_fields=["status", "file_size", "completed_at", "error_message"])
    return record
