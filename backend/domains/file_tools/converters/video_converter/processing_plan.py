"""FFmpeg command planning for WhatsApp-friendly video output."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ...contracts.video_converter import VideoConversionOptions
from .presets import PRESETS, RESOLUTION_HEIGHTS


@dataclass(frozen=True)
class VideoProcessingPlan:
    options: VideoConversionOptions
    input_path: Path
    output_path: Path

    def ffmpeg_args(self, ffmpeg_binary: str) -> list[str]:
        preset = PRESETS[self.options.quality_preset]
        args = [ffmpeg_binary, "-hide_banner", "-y"]
        if self.options.trim_start_seconds is not None:
            args.extend(["-ss", _seconds(self.options.trim_start_seconds)])
        args.extend(["-i", str(self.input_path)])
        if self.options.trim_end_seconds is not None:
            args.extend(["-to", _seconds(self.options.trim_end_seconds)])

        video_filters = self._video_filters()
        if video_filters:
            args.extend(["-vf", ",".join(video_filters)])

        args.extend([
            "-map",
            "0:v:0",
            "-c:v",
            "libx264",
            "-preset",
            preset.x264_preset,
            "-crf",
            str(preset.crf),
            "-profile:v",
            preset.profile,
            "-pix_fmt",
            "yuv420p",
        ])

        if preset.bframes is not None:
            args.extend(["-bf", str(preset.bframes)])
        if preset.maxrate:
            args.extend(["-maxrate", preset.maxrate])
        if preset.bufsize:
            args.extend(["-bufsize", preset.bufsize])
        if self.options.bitrate_kbps:
            args.extend(["-b:v", f"{self.options.bitrate_kbps}k"])

        if self.options.remove_audio:
            args.append("-an")
        else:
            args.extend(["-map", "0:a:0?", "-c:a", "aac", "-b:a", preset.audio_bitrate, "-ac", "2"])
            if self.options.normalize_audio:
                args.extend(["-af", "loudnorm=I=-16:TP=-1.5:LRA=11"])

        args.extend([
            "-movflags",
            "+faststart",
            "-max_muxing_queue_size",
            "1024",
            "-progress",
            "pipe:1",
            "-nostats",
            str(self.output_path),
        ])
        return args

    def thumbnail_args(self, ffmpeg_binary: str, output_path: Path, at_seconds: float) -> list[str]:
        return [
            ffmpeg_binary,
            "-hide_banner",
            "-y",
            "-ss",
            _seconds(max(0.0, at_seconds)),
            "-i",
            str(self.output_path),
            "-frames:v",
            "1",
            "-vf",
            "scale='min(720,iw)':-2",
            str(output_path),
        ]

    def _video_filters(self) -> list[str]:
        filters: list[str] = []
        height = self._target_height()
        if height:
            filters.append(f"scale='min(iw,{height}*dar)':min({height}\\,ih):force_original_aspect_ratio=decrease")
        filters.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")
        if self.options.normalize_fps:
            fps = PRESETS[self.options.quality_preset].fps_cap
            if fps:
                filters.append(f"fps=fps={fps}")
        return filters

    def _target_height(self) -> int | None:
        if self.options.resolution_preset == "original":
            return PRESETS[self.options.quality_preset].max_height
        requested = RESOLUTION_HEIGHTS.get(self.options.resolution_preset)
        preset_height = PRESETS[self.options.quality_preset].max_height
        if requested and preset_height:
            return min(requested, preset_height)
        return requested or preset_height


def build_processing_plan(options: VideoConversionOptions, input_path: Path, output_path: Path) -> VideoProcessingPlan:
    return VideoProcessingPlan(options=options, input_path=input_path, output_path=output_path)


def preset_payload() -> dict[str, object]:
    return {
        "qualityPresets": [
            {
                "key": preset.key,
                "label": preset.label,
                "crf": preset.crf,
                "audioBitrate": preset.audio_bitrate,
                "maxHeight": preset.max_height,
                "fpsCap": preset.fps_cap,
                "profile": preset.profile,
            }
            for preset in PRESETS.values()
        ],
        "resolutionPresets": ["original", "1080p", "720p", "480p"],
    }


def _seconds(value: float) -> str:
    return f"{value:.3f}".rstrip("0").rstrip(".")
