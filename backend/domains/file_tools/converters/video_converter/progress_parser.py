"""Parser for FFmpeg -progress output."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class FfmpegProgress:
    processed_ms: int | None
    percent: float | None
    speed: float | None
    eta_seconds: int | None
    raw: dict[str, str]


def parse_progress_block(lines: list[str], duration_ms: int | None) -> FfmpegProgress:
    raw: dict[str, str] = {}
    for line in lines:
        if "=" not in line:
            continue
        key, value = line.strip().split("=", 1)
        raw[key] = value

    processed_ms = _parse_out_time_ms(raw)
    percent = None
    eta = None
    if duration_ms and processed_ms is not None and duration_ms > 0:
        percent = max(0.0, min(99.0, (processed_ms / duration_ms) * 100))
        speed = _parse_speed(raw.get("speed")) or 1.0
        remaining_ms = max(0, duration_ms - processed_ms)
        eta = int((remaining_ms / 1000) / max(speed, 0.01))
    else:
        speed = _parse_speed(raw.get("speed"))

    return FfmpegProgress(
        processed_ms=processed_ms,
        percent=percent,
        speed=speed,
        eta_seconds=eta,
        raw=raw,
    )


def _parse_out_time_ms(raw: dict[str, str]) -> int | None:
    if raw.get("out_time_ms"):
        try:
            return int(int(raw["out_time_ms"]) / 1000)
        except ValueError:
            return None
    if raw.get("out_time"):
        match = re.match(r"(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)", raw["out_time"])
        if not match:
            return None
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2))
        seconds = float(match.group(3))
        return int(((hours * 3600) + (minutes * 60) + seconds) * 1000)
    return None


def _parse_speed(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value.rstrip("x"))
    except ValueError:
        return None
