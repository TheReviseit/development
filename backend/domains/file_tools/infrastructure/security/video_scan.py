"""Virus-scan integration point for uploaded video sources."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from ...domain.errors import ValidationError


class VideoScanService:
    """Pluggable scanner.

    Production can set FILE_TOOLS_VIDEO_SCAN_COMMAND to a scanner command that
    accepts the file path as the final argument and exits non-zero on malware.
    """

    def scan_or_raise(self, path: str | Path) -> None:
        if os.getenv("FILE_TOOLS_VIDEO_VIRUS_SCAN_ENABLED", "false").lower() not in {"1", "true", "yes"}:
            return
        command = os.getenv("FILE_TOOLS_VIDEO_SCAN_COMMAND")
        if not command:
            raise ValidationError("VIDEO_SCAN_UNAVAILABLE", "Video scanning is enabled but no scanner is configured.")
        args = [*command.split(), str(Path(path))]
        try:
            result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120, check=False)
        except Exception as exc:
            raise ValidationError("VIDEO_SCAN_FAILED", "Video scan failed.") from exc
        if result.returncode != 0:
            raise ValidationError("VIDEO_REJECTED_BY_SCAN", "The uploaded video did not pass security scanning.")
