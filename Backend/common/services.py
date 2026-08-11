from __future__ import annotations

from typing import Any

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
