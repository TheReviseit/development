"""FFprobe wrapper and metadata normalization."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ...domain.errors import ConversionError, ValidationError


@dataclass(frozen=True)
class VideoProbeResult:
    container: str | None
    duration_seconds: float | None
    width: int | None
    height: int | None
    fps: float | None
    video_codec: str | None
    audio_codec: str | None
    audio_streams: int
    video_streams: int
    bit_rate: int | None
    raw: dict[str, Any]

    @property
    def duration_ms(self) -> int | None:
        return int(self.duration_seconds * 1000) if self.duration_seconds is not None else None

    def to_metadata(self) -> dict[str, Any]:
        return {
            "container": self.container,
            "durationSeconds": self.duration_seconds,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "videoCodec": self.video_codec,
            "audioCodec": self.audio_codec,
            "audioStreams": self.audio_streams,
            "videoStreams": self.video_streams,
            "bitRate": self.bit_rate,
        }


class FfprobeService:
    def __init__(self, binary: str | None = None):
        self.binary = binary or os.getenv("FFPROBE_BINARY") or shutil.which("ffprobe") or "ffprobe"

    def version(self) -> str | None:
        try:
            result = subprocess.run([self.binary, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
            if result.returncode != 0:
                return None
            return result.stdout.splitlines()[0] if result.stdout else None
        except Exception:
            return None

    def is_available(self) -> bool:
        return self.version() is not None

    def probe_or_raise(self, path: str | Path) -> VideoProbeResult:
        args = [
            self.binary,
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-print_format",
            "json",
            str(path),
        ]
        try:
            result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=45)
        except FileNotFoundError as exc:
            raise ConversionError("ffprobe is not installed or not configured.", "FFPROBE_UNAVAILABLE") from exc
        except subprocess.TimeoutExpired as exc:
            raise ValidationError("VIDEO_PROBE_TIMEOUT", "Video metadata probing timed out.") from exc
        if result.returncode != 0:
            raise ValidationError("INVALID_VIDEO_FILE", "The uploaded video could not be read.")
        try:
            data = json.loads(result.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise ValidationError("INVALID_VIDEO_METADATA", "Video metadata could not be parsed.") from exc
        return normalize_probe(data)


def normalize_probe(data: dict[str, Any]) -> VideoProbeResult:
    streams = data.get("streams") or []
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    video = video_streams[0] if video_streams else {}
    audio = audio_streams[0] if audio_streams else {}
    fmt = data.get("format") or {}
    duration = _float_or_none(video.get("duration")) or _float_or_none(fmt.get("duration"))
    return VideoProbeResult(
        container=fmt.get("format_name"),
        duration_seconds=duration,
        width=_int_or_none(video.get("width")),
        height=_int_or_none(video.get("height")),
        fps=_parse_fps(video.get("avg_frame_rate") or video.get("r_frame_rate")),
        video_codec=video.get("codec_name"),
        audio_codec=audio.get("codec_name"),
        audio_streams=len(audio_streams),
        video_streams=len(video_streams),
        bit_rate=_int_or_none(fmt.get("bit_rate")),
        raw=data,
    )


def output_is_faststart(path: str | Path) -> bool:
    sample = Path(path).read_bytes()[:1024 * 1024]
    moov = sample.find(b"moov")
    mdat = sample.find(b"mdat")
    return moov != -1 and (mdat == -1 or moov < mdat)


def _parse_fps(value: str | None) -> float | None:
    if not value or value == "0/0":
        return None
    if "/" in value:
        numerator, denominator = value.split("/", 1)
        try:
            denominator_float = float(denominator)
            return float(numerator) / denominator_float if denominator_float else None
        except ValueError:
            return None
    return _float_or_none(value)


def _float_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int_or_none(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None
