"""Image converter validation and runtime format detection."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import PurePath

from PIL import Image, UnidentifiedImageError

from ..contracts.image_converter import ImageConvertRequest
from ..domain.errors import ValidationError
from ..domain.policies import (
    ALLOWED_IMAGE_INPUT_FORMATS,
    ALLOWED_IMAGE_OUTPUT_FORMATS,
    IMAGE_CONVERSION_LIMITS,
    IMAGE_MIME_TYPES,
)


FORMAT_EXTENSIONS = {
    "jpeg": {"jpg", "jpeg", "jfif", "pjpeg", "pjp"},
    "png": {"png"},
    "webp": {"webp"},
    "bmp": {"bmp", "dib"},
    "gif": {"gif"},
    "tiff": {"tif", "tiff"},
    "heic": {"heic", "heif"},
    "avif": {"avif"},
}

PIL_INPUT_FORMATS = {
    "JPEG": "jpeg",
    "PNG": "png",
    "WEBP": "webp",
    "BMP": "bmp",
    "GIF": "gif",
    "TIFF": "tiff",
    "HEIF": "heic",
    "HEIC": "heic",
    "AVIF": "avif",
}

PIL_SAVE_FORMATS = {
    "jpeg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "avif": "AVIF",
}


@dataclass(frozen=True)
class ImageInspection:
    format: str
    width: int
    height: int
    megapixels: float
    has_alpha: bool


class ImageConverterValidator:
    def validate(self, request: ImageConvertRequest, authenticated: bool) -> ImageInspection:
        max_input = (
            IMAGE_CONVERSION_LIMITS.authenticated_max_input_bytes
            if authenticated
            else IMAGE_CONVERSION_LIMITS.guest_max_input_bytes
        )
        if len(request.file_bytes) > max_input:
            raise ValidationError("IMAGE_TOO_LARGE", "Image file is too large.")

        sniffed = sniff_image_format(request.file_bytes)
        if sniffed not in ALLOWED_IMAGE_INPUT_FORMATS:
            raise ValidationError("UNSUPPORTED_IMAGE_FORMAT", "This image format is not supported.")
        if sniffed not in supported_input_formats():
            raise ValidationError("UNSUPPORTED_IMAGE_FORMAT", "This image format is not available on this server.")

        extension = PurePath(request.filename).suffix.lower().lstrip(".")
        if extension and extension not in FORMAT_EXTENSIONS.get(sniffed, set()):
            raise ValidationError("UNSUPPORTED_IMAGE_FORMAT", "The image extension does not match its content.")

        if request.declared_mime_type:
            allowed_mimes = {IMAGE_MIME_TYPES.get(sniffed)}
            if sniffed == "jpeg":
                allowed_mimes.add("image/jpg")
            if sniffed == "tiff":
                allowed_mimes.add("image/x-tiff")
            if sniffed == "heic":
                allowed_mimes.add("image/heif")
            if request.declared_mime_type not in allowed_mimes:
                raise ValidationError("UNSUPPORTED_IMAGE_FORMAT", "The uploaded image MIME type is not supported.")

        if request.output_format not in supported_output_formats():
            raise ValidationError("UNSUPPORTED_OUTPUT_FORMAT", "This output format is not available on this server.")

        inspection = inspect_image(request.file_bytes, expected_format=sniffed)
        max_megapixels = (
            IMAGE_CONVERSION_LIMITS.authenticated_max_megapixels
            if authenticated
            else IMAGE_CONVERSION_LIMITS.guest_max_megapixels
        )
        if inspection.megapixels > max_megapixels:
            raise ValidationError("IMAGE_DIMENSIONS_TOO_LARGE", "Image dimensions are too large.")

        return inspection


def inspect_image(content: bytes, expected_format: str | None = None) -> ImageInspection:
    try:
        with Image.open(_bytes_view(content)) as image:
            detected = PIL_INPUT_FORMATS.get((image.format or "").upper())
            if expected_format and detected and detected != expected_format:
                raise ValidationError("UNSUPPORTED_IMAGE_FORMAT", "The image signature and decoder format do not match.")
            if detected not in ALLOWED_IMAGE_INPUT_FORMATS:
                raise ValidationError("UNSUPPORTED_IMAGE_FORMAT", "This image format is not supported.")
            width, height = image.size
            if width <= 0 or height <= 0:
                raise ValidationError("INVALID_IMAGE_FILE", "Image dimensions are invalid.")
            megapixels = (width * height) / 1_000_000
            has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
            return ImageInspection(
                format=detected,
                width=width,
                height=height,
                megapixels=megapixels,
                has_alpha=has_alpha,
            )
    except Image.DecompressionBombError as exc:
        raise ValidationError("IMAGE_DIMENSIONS_TOO_LARGE", "Image dimensions are too large.") from exc
    except ValidationError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValidationError("INVALID_IMAGE_FILE", "The uploaded file is not a valid image.") from exc


def sniff_image_format(content: bytes) -> str | None:
    header = content[:32]
    if header.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
        return "gif"
    if header.startswith(b"BM"):
        return "bmp"
    if header.startswith(b"II*\x00") or header.startswith(b"MM\x00*"):
        return "tiff"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp"
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12]
        if brand in {b"avif", b"avis"}:
            return "avif"
        if brand in {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"}:
            return "heic"
    return None


def supported_input_formats() -> list[str]:
    available = []
    for fmt in sorted(ALLOWED_IMAGE_INPUT_FORMATS):
        if fmt in {"heic", "avif"} and fmt not in _runtime_decode_formats():
            continue
        available.append(fmt)
    return available


def supported_output_formats() -> list[str]:
    runtime = _runtime_encode_formats()
    return [fmt for fmt in sorted(ALLOWED_IMAGE_OUTPUT_FORMATS) if fmt in runtime]


def image_runtime_status() -> dict[str, object]:
    return {
        "pillow": Image.__version__,
        "inputs": supported_input_formats(),
        "outputs": supported_output_formats(),
        "heic": "heic" in _runtime_decode_formats(),
        "avifDecode": "avif" in _runtime_decode_formats(),
        "avifEncode": "avif" in _runtime_encode_formats(),
    }


def configure_image_safety_limits() -> None:
    Image.MAX_IMAGE_PIXELS = IMAGE_CONVERSION_LIMITS.authenticated_max_megapixels * 1_000_000


def _runtime_decode_formats() -> set[str]:
    Image.init()
    formats = {PIL_INPUT_FORMATS.get(fmt.upper()) for fmt in Image.registered_extensions().values()}
    formats.discard(None)
    if _try_register_heif():
        formats.add("heic")
    return set(formats)


def _runtime_encode_formats() -> set[str]:
    Image.init()
    formats = set()
    for output_format, pil_format in PIL_SAVE_FORMATS.items():
        if pil_format in Image.SAVE:
            formats.add(output_format)
    return formats


def _try_register_heif() -> bool:
    if os.getenv("FILE_TOOLS_ENABLE_HEIF", "true").lower() in {"0", "false", "off"}:
        return False
    try:
        from pillow_heif import register_heif_opener

        register_heif_opener()
        return True
    except Exception:
        return False


def _bytes_view(content: bytes):
    from io import BytesIO

    return BytesIO(content)


configure_image_safety_limits()
