"""Pillow-backed image conversion with safe defaults."""

from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps

from ...contracts.image_converter import ImageConvertRequest, default_quality_for
from ...domain.errors import ConversionError, ValidationError
from ...domain.policies import IMAGE_CONVERSION_LIMITS, IMAGE_MIME_TYPES
from ..base import ConversionResult


OUTPUT_EXTENSIONS = {
    "jpeg": "jpg",
    "png": "png",
    "webp": "webp",
    "avif": "avif",
}

PIL_OUTPUT_FORMATS = {
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "avif": "AVIF",
}


class PillowImageConverter:
    tool_key = "image_converter"

    def convert(self, request: ImageConvertRequest) -> ConversionResult:
        try:
            with Image.open(BytesIO(request.file_bytes)) as opened:
                try:
                    opened.seek(0)
                except EOFError:
                    pass
                image = ImageOps.exif_transpose(opened)
                converted = _prepare_for_output(image, request.output_format, request.background)
                output = BytesIO()
                save_kwargs = _save_kwargs(request.output_format, request.quality)
                converted.save(output, format=PIL_OUTPUT_FORMATS[request.output_format], **save_kwargs)
        except ValidationError:
            raise
        except Exception as exc:
            raise ConversionError("Image conversion failed.", "IMAGE_CONVERSION_FAILED") from exc

        content = output.getvalue()
        if len(content) > IMAGE_CONVERSION_LIMITS.max_output_bytes:
            raise ValidationError("IMAGE_OUTPUT_TOO_LARGE", "Converted image is too large.")

        return ConversionResult(
            bytes=content,
            mime_type=IMAGE_MIME_TYPES[request.output_format],
            extension=OUTPUT_EXTENSIONS[request.output_format],
            page_count=1,
        )


def _prepare_for_output(image: Image.Image, output_format: str, background: str) -> Image.Image:
    if output_format == "jpeg":
        return _flatten_to_rgb(image, background)
    if output_format == "png":
        return _copy_for_png(image)
    if image.mode not in {"RGB", "RGBA"}:
        return image.convert("RGBA" if _has_alpha(image) else "RGB")
    return image.copy()


def _flatten_to_rgb(image: Image.Image, background: str) -> Image.Image:
    rgb = _hex_to_rgb(background)
    if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
        rgba = image.convert("RGBA")
        canvas = Image.new("RGBA", rgba.size, (*rgb, 255))
        canvas.alpha_composite(rgba)
        return canvas.convert("RGB")
    if image.mode != "RGB":
        return image.convert("RGB")
    return image.copy()


def _copy_for_png(image: Image.Image) -> Image.Image:
    if image.mode in {"1", "P"} and "transparency" not in image.info:
        return image.copy()
    if _has_alpha(image):
        return image.convert("RGBA")
    if image.mode not in {"RGB", "RGBA", "L", "LA"}:
        return image.convert("RGB")
    return image.copy()


def _save_kwargs(output_format: str, quality: int | None) -> dict[str, object]:
    if output_format == "png":
        return {"optimize": True}
    resolved_quality = quality or default_quality_for(output_format)
    kwargs: dict[str, object] = {"quality": resolved_quality, "optimize": True}
    if output_format == "jpeg":
        kwargs["progressive"] = True
    if output_format == "webp":
        kwargs["method"] = 6
    return kwargs


def _has_alpha(image: Image.Image) -> bool:
    return image.mode in {"RGBA", "LA"} or "transparency" in image.info


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    normalized = value.lstrip("#")
    return (
        int(normalized[0:2], 16),
        int(normalized[2:4], 16),
        int(normalized[4:6], 16),
    )
