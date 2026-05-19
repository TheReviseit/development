"""Tesseract OCR wrapper."""

from __future__ import annotations

import os
import shutil
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ...domain.errors import ConversionError
from ...domain.policies import OCR_LIMITS


SCRIPT_LANGUAGE_MAP = {
    "Latin": ["eng"],
    "Devanagari": ["hin", "eng"],
    "Tamil": ["tam", "eng"],
    "Telugu": ["tel", "eng"],
    "Kannada": ["kan", "eng"],
    "Malayalam": ["mal", "eng"],
    "Arabic": ["ara", "eng"],
    "Bengali": ["ben", "eng"],
    "Gujarati": ["guj", "eng"],
    "Gurmukhi": ["pan", "eng"],
}

APP_LOCALE_LANGUAGES = ["eng", "hin", "tam", "tel", "kan", "mal"]


@dataclass(frozen=True)
class OcrBlock:
    id: str
    pageIndex: int
    type: str
    text: str
    bbox: dict[str, int]
    confidence: float
    readingOrder: int


@dataclass(frozen=True)
class OcrEngineResult:
    text: str
    blocks: list[dict[str, Any]]
    confidence: dict[str, float | int]
    language: dict[str, Any]
    engine_version: str | None


class TesseractService:
    def __init__(self, binary: str | None = None):
        self.binary = binary or _default_tesseract_binary()

    def is_available(self) -> bool:
        return self.version() is not None

    def version(self) -> str | None:
        try:
            pytesseract = _pytesseract()
            pytesseract.pytesseract.tesseract_cmd = self.binary
            return str(pytesseract.get_tesseract_version())
        except Exception:
            return None

    def languages(self) -> list[str]:
        try:
            pytesseract = _pytesseract()
            pytesseract.pytesseract.tesseract_cmd = self.binary
            return sorted(lang for lang in pytesseract.get_languages(config="") if lang and lang != "osd")
        except Exception:
            return []

    def health(self) -> dict[str, Any]:
        languages = self.languages()
        return {
            "available": self.is_available(),
            "binary": self.binary,
            "version": self.version(),
            "languageCount": len(languages),
            "languages": languages[:80],
        }

    def extract(self, image_path: str | Path) -> OcrEngineResult:
        pytesseract = _pytesseract()
        pytesseract.pytesseract.tesseract_cmd = self.binary
        installed = self.languages()
        if not installed:
            raise ConversionError("Tesseract language data is not installed.", "OCR_LANGUAGE_DATA_MISSING")

        detected_script = self._detect_script(image_path)
        language = self._language_for_script(detected_script, installed)
        config = os.getenv("OCR_TESSERACT_CONFIG", "--oem 1 --psm 6")
        timeout = _env_int("OCR_TESSERACT_TIMEOUT_SECONDS", OCR_LIMITS.timeout_seconds)
        try:
            data = pytesseract.image_to_data(
                str(image_path),
                lang=language,
                config=config,
                output_type=pytesseract.Output.DICT,
                timeout=timeout,
            )
        except RuntimeError as exc:
            raise ConversionError("Tesseract OCR timed out or failed.", "OCR_ENGINE_FAILED") from exc
        except FileNotFoundError as exc:
            raise ConversionError("Tesseract is not installed or not configured.", "OCR_ENGINE_UNAVAILABLE") from exc

        blocks = _blocks_from_data(data)
        text = "\n".join(block["text"] for block in blocks).strip()
        if not text:
            text = self._fallback_text(pytesseract, image_path, language, timeout)
            if text:
                blocks = [_fallback_block(text)]
        if not text:
            raise ConversionError("No readable text was detected in this image.", "OCR_NO_TEXT_DETECTED")

        confidences = [
            _normalize_confidence(float(block["confidence"]))
            for block in blocks
            if isinstance(block.get("confidence"), (float, int))
        ]
        mean_conf = statistics.fmean(confidences) if confidences else 0.0
        min_conf = min(confidences) if confidences else 0.0
        return OcrEngineResult(
            text=text,
            blocks=blocks,
            confidence={
                "mean": round(max(0.0, min(1.0, mean_conf)), 4),
                "min": round(max(0.0, min(1.0, min_conf)), 4),
                "lowConfidenceTokenCount": sum(1 for value in confidences if value < 0.55),
                "providerAgreement": 1.0,
            },
            language={
                "mode": os.getenv("OCR_DEFAULT_LANGUAGE_MODE", "auto"),
                "requested": language,
                "detectedScript": detected_script,
                "installedCount": len(installed),
            },
            engine_version=self.version(),
        )

    def _detect_script(self, image_path: str | Path) -> str | None:
        try:
            pytesseract = _pytesseract()
            osd = pytesseract.image_to_osd(str(image_path), timeout=10)
        except Exception:
            return None
        for line in osd.splitlines():
            key, _, value = line.partition(":")
            if key.strip().lower() == "script":
                return value.strip() or None
        return None

    def _language_for_script(self, script: str | None, installed: list[str]) -> str:
        configured = _configured_languages(installed)
        if configured:
            return "+".join(configured)

        candidates = SCRIPT_LANGUAGE_MAP.get(script or "", []) or APP_LOCALE_LANGUAGES
        selected = _dedupe([lang for lang in candidates if lang in installed])
        if "eng" in installed and "eng" not in selected:
            selected.insert(0, "eng")
        if not selected:
            selected = [installed[0]]
        return "+".join(selected[: _env_int("OCR_MAX_RUNTIME_LANGUAGES", OCR_LIMITS.max_runtime_languages)])

    def _fallback_text(self, pytesseract, image_path: str | Path, language: str, timeout: int) -> str:
        try:
            return pytesseract.image_to_string(
                str(image_path),
                lang=language,
                config=os.getenv("OCR_TESSERACT_FALLBACK_CONFIG", "--oem 1 --psm 11"),
                timeout=timeout,
            ).strip()
        except Exception:
            return ""


def _blocks_from_data(data: dict[str, list[Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[int, int, int, int], list[dict[str, Any]]] = {}
    count = len(data.get("text", []))
    for index in range(count):
        text = str(data.get("text", [""])[index] or "").strip()
        if not text:
            continue
        confidence = _float(data.get("conf", ["-1"])[index])
        if confidence < 0:
            continue
        key = (
            int(_float(data.get("page_num", [1])[index])),
            int(_float(data.get("block_num", [0])[index])),
            int(_float(data.get("par_num", [0])[index])),
            int(_float(data.get("line_num", [0])[index])),
        )
        grouped.setdefault(key, []).append(
            {
                "text": text,
                "left": int(_float(data.get("left", [0])[index])),
                "top": int(_float(data.get("top", [0])[index])),
                "width": int(_float(data.get("width", [0])[index])),
                "height": int(_float(data.get("height", [0])[index])),
                "confidence": confidence,
            }
        )

    blocks = []
    for order, key in enumerate(sorted(grouped), start=1):
        words = grouped[key]
        left = min(word["left"] for word in words)
        top = min(word["top"] for word in words)
        right = max(word["left"] + word["width"] for word in words)
        bottom = max(word["top"] + word["height"] for word in words)
        blocks.append(
            {
                "id": f"line-{order}",
                "pageIndex": max(0, key[0] - 1),
                "type": "line",
                "text": " ".join(word["text"] for word in words),
                "bbox": {"x": left, "y": top, "width": right - left, "height": bottom - top},
                "confidence": round(max(0.0, min(100.0, statistics.fmean(word["confidence"] for word in words))) / 100, 4),
                "readingOrder": order,
            }
        )
    return blocks


def _fallback_block(text: str) -> dict[str, Any]:
    return {
        "id": "text-1",
        "pageIndex": 0,
        "type": "text",
        "text": text,
        "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
        "confidence": 0.5,
        "readingOrder": 1,
    }


def _configured_languages(installed: list[str]) -> list[str]:
    raw = os.getenv("OCR_TESSERACT_LANGS", "").replace("+", ",")
    if not raw:
        return []
    requested = _dedupe(part.strip() for part in raw.split(",") if part.strip())
    return [lang for lang in requested if lang in installed]


def _dedupe(values) -> list[str]:
    seen = set()
    result = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_confidence(value: float) -> float:
    normalized = value / 100 if value > 1 else value
    return max(0.0, min(1.0, normalized))


def _env_int(key: str, fallback: int) -> int:
    try:
        value = int(os.getenv(key, ""))
    except ValueError:
        return fallback
    return value if value > 0 else fallback


def _default_tesseract_binary() -> str:
    configured = os.getenv("TESSERACT_CMD")
    if configured:
        return configured
    local_binaries = [
        Path(__file__).resolve().parents[4] / ".bin" / "win32" / "tesseract" / "tesseract.exe",
        Path("C:/Program Files/Tesseract-OCR/tesseract.exe"),
        Path("C:/Program Files (x86)/Tesseract-OCR/tesseract.exe"),
    ]
    for local_binary in local_binaries:
        if local_binary.exists():
            return str(local_binary)
    return shutil.which("tesseract") or "tesseract"


def _pytesseract():
    try:
        import pytesseract

        return pytesseract
    except Exception as exc:
        raise ConversionError("pytesseract is not installed.", "OCR_ENGINE_UNAVAILABLE") from exc
