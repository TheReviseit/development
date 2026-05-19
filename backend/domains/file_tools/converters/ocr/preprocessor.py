"""OCR image preprocessing."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError

from ...domain.errors import ValidationError


@dataclass(frozen=True)
class PreprocessedImage:
    path: Path
    metadata: dict[str, object]


class OcrPreprocessor:
    def preprocess(self, content: bytes, temp_dir: Path) -> PreprocessedImage:
        try:
            with Image.open(BytesIO(content)) as image:
                original_format = image.format or "unknown"
                image = ImageOps.exif_transpose(image)
                original_size = image.size
                image = image.convert("RGB")
                image = _resize_for_ocr(image)
                processed = _enhance_for_ocr(image)
                output = temp_dir / "ocr-input.png"
                processed.save(output, format="PNG", optimize=True)
                return PreprocessedImage(
                    path=output,
                    metadata={
                        "originalFormat": original_format,
                        "originalWidth": original_size[0],
                        "originalHeight": original_size[1],
                        "processedWidth": processed.size[0],
                        "processedHeight": processed.size[1],
                        "mode": processed.mode,
                    },
                )
        except Image.DecompressionBombError as exc:
            raise ValidationError("OCR_IMAGE_TOO_LARGE", "Image dimensions are too large for OCR.") from exc
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise ValidationError("OCR_INVALID_IMAGE", "The uploaded file is not a readable image.") from exc


def _resize_for_ocr(image: Image.Image) -> Image.Image:
    width, height = image.size
    longest = max(width, height)
    if longest < 1200:
        scale = min(2.0, 1200 / max(1, longest))
        return image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)
    if longest > 4200:
        scale = 4200 / longest
        return image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)
    return image


def _enhance_for_ocr(image: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.MedianFilter(size=3))
    gray = ImageEnhance.Sharpness(gray).enhance(1.4)
    threshold = _otsu_threshold(gray)
    return gray.point(lambda pixel: 255 if pixel > threshold else 0, mode="1").convert("L")


def _otsu_threshold(image: Image.Image) -> int:
    histogram = image.histogram()
    total = sum(histogram)
    if total <= 0:
        return 160
    sum_total = sum(index * count for index, count in enumerate(histogram))
    sum_background = 0.0
    weight_background = 0
    best_threshold = 160
    best_variance = 0.0
    for threshold, count in enumerate(histogram):
        weight_background += count
        if weight_background == 0:
            continue
        weight_foreground = total - weight_background
        if weight_foreground == 0:
            break
        sum_background += threshold * count
        mean_background = sum_background / weight_background
        mean_foreground = (sum_total - sum_background) / weight_foreground
        variance = weight_background * weight_foreground * ((mean_background - mean_foreground) ** 2)
        if variance > best_variance:
            best_variance = variance
            best_threshold = threshold
    return best_threshold

