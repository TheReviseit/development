"""FFmpeg execution service with progress and cancellation support."""

from __future__ import annotations

import os
import queue
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Callable

from ...domain.errors import ConversionError
from ...domain.policies import VIDEO_CONVERSION_LIMITS
from .processing_plan import VideoProcessingPlan
from .progress_parser import parse_progress_block


ProgressCallback = Callable[[dict[str, object]], None]
CancelCallback = Callable[[], bool]


class FfmpegService:
    def __init__(self, binary: str | None = None):
        self.binary = binary or os.getenv("FFMPEG_BINARY") or shutil.which("ffmpeg") or "ffmpeg"

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

    def convert(
        self,
        plan: VideoProcessingPlan,
        *,
        duration_ms: int | None,
        on_progress: ProgressCallback,
        should_cancel: CancelCallback,
    ) -> None:
        args = plan.ffmpeg_args(self.binary)
        self._run_ffmpeg_progress(args, duration_ms=duration_ms, on_progress=on_progress, should_cancel=should_cancel)

    def generate_still(self, args: list[str], should_cancel: CancelCallback) -> None:
        self._run_simple(args, should_cancel=should_cancel)

    def _run_ffmpeg_progress(
        self,
        args: list[str],
        *,
        duration_ms: int | None,
        on_progress: ProgressCallback,
        should_cancel: CancelCallback,
    ) -> None:
        started = time.monotonic()
        with tempfile.TemporaryFile(mode="w+t", encoding="utf-8", errors="replace") as stderr_file:
            try:
                process = subprocess.Popen(
                    args,
                    stdout=subprocess.PIPE,
                    stderr=stderr_file,
                    text=True,
                    bufsize=1,
                )
            except FileNotFoundError as exc:
                raise ConversionError("ffmpeg is not installed or not configured.", "FFMPEG_UNAVAILABLE") from exc

            block: list[str] = []
            last_emit = 0.0
            stdout_done = False
            lines: queue.Queue[str | None] = queue.Queue()
            reader = threading.Thread(target=_read_stdout_lines, args=(process.stdout, lines), daemon=True)
            reader.start()
            try:
                assert process.stdout is not None
                while True:
                    if should_cancel():
                        self._terminate(process)
                        raise ConversionError("Video conversion was cancelled.", "VIDEO_CONVERSION_CANCELLED")

                    try:
                        line = lines.get(timeout=0.1)
                    except queue.Empty:
                        line = None

                    if line is None:
                        stdout_done = stdout_done or process.poll() is not None
                    else:
                        stripped = line.strip()
                        block.append(stripped)
                        if stripped.startswith("progress="):
                            progress = parse_progress_block(block, duration_ms)
                            block = []
                            now = time.monotonic()
                            if now - last_emit >= VIDEO_CONVERSION_LIMITS.progress_emit_interval_seconds:
                                on_progress({
                                    "processedMs": progress.processed_ms,
                                    "percent": progress.percent,
                                    "speed": progress.speed,
                                    "etaSeconds": progress.eta_seconds,
                                })
                                last_emit = now
                        continue

                    if process.poll() is not None and stdout_done:
                        break

                    if time.monotonic() - started > VIDEO_CONVERSION_LIMITS.conversion_timeout_seconds:
                        self._terminate(process)
                        raise ConversionError("Video conversion timed out.", "VIDEO_CONVERSION_TIMEOUT")

                reader.join(timeout=1)
                if process.returncode != 0:
                    raise ConversionError("Video conversion failed.", "VIDEO_CONVERSION_FAILED") from RuntimeError(_stderr_tail(stderr_file))
            finally:
                if process.stdout:
                    process.stdout.close()

    def _run_simple(self, args: list[str], *, should_cancel: CancelCallback) -> None:
        with tempfile.TemporaryFile(mode="w+t", encoding="utf-8", errors="replace") as stderr_file:
            try:
                process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=stderr_file, text=True)
            except FileNotFoundError as exc:
                raise ConversionError("ffmpeg is not installed or not configured.", "FFMPEG_UNAVAILABLE") from exc
            while True:
                if should_cancel():
                    self._terminate(process)
                    raise ConversionError("Video conversion was cancelled.", "VIDEO_CONVERSION_CANCELLED")
                if process.poll() is not None:
                    break
                time.sleep(0.05)
            if process.returncode != 0:
                raise ConversionError("Video thumbnail generation failed.", "VIDEO_THUMBNAIL_FAILED") from RuntimeError(_stderr_tail(stderr_file))

    def _terminate(self, process: subprocess.Popen) -> None:
        if process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=VIDEO_CONVERSION_LIMITS.cancel_grace_seconds)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def _read_stdout_lines(stream, lines: queue.Queue[str | None]) -> None:
    try:
        if stream is None:
            return
        for line in stream:
            lines.put(line)
    finally:
        lines.put(None)


def _stderr_tail(stderr_file, limit: int = 4000) -> str:
    try:
        stderr_file.flush()
        stderr_file.seek(0)
        return stderr_file.read()[-limit:]
    except Exception:
        return ""
