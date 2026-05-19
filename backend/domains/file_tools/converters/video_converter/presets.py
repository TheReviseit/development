"""Preset parameters for WhatsApp-friendly video conversion."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VideoPreset:
    key: str
    label: str
    crf: int
    audio_bitrate: str
    max_height: int | None
    fps_cap: int | None
    x264_preset: str
    profile: str
    maxrate: str | None = None
    bufsize: str | None = None
    bframes: int | None = None


PRESETS: dict[str, VideoPreset] = {
    "best_quality": VideoPreset(
        key="best_quality",
        label="Best quality",
        crf=18,
        audio_bitrate="160k",
        max_height=1080,
        fps_cap=60,
        x264_preset="slow",
        profile="main",
    ),
    "balanced": VideoPreset(
        key="balanced",
        label="Balanced",
        crf=23,
        audio_bitrate="128k",
        max_height=1080,
        fps_cap=30,
        x264_preset="medium",
        profile="main",
    ),
    "small_size": VideoPreset(
        key="small_size",
        label="Small size",
        crf=28,
        audio_bitrate="96k",
        max_height=720,
        fps_cap=30,
        x264_preset="medium",
        profile="baseline",
        maxrate="1400k",
        bufsize="2800k",
        bframes=0,
    ),
    "whatsapp_optimized": VideoPreset(
        key="whatsapp_optimized",
        label="WhatsApp optimized",
        crf=26,
        audio_bitrate="96k",
        max_height=720,
        fps_cap=30,
        x264_preset="medium",
        profile="baseline",
        maxrate="1800k",
        bufsize="3600k",
        bframes=0,
    ),
}

RESOLUTION_HEIGHTS = {
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
}
