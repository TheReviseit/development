import sys
import time
import types
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domains.file_tools.application.conversion_orchestrator import ConversionOrchestrator
from domains.file_tools.application.rate_limit_service import InMemoryRateLimitService
from domains.file_tools.application.tool_registry import ToolRegistry
from domains.file_tools.contracts.image_converter import ImageConvertRequest
from domains.file_tools.contracts.common import RequestContext
from domains.file_tools.converters.base import ConversionResult
from domains.file_tools.converters.image_converter.pillow_converter import PillowImageConverter
from domains.file_tools.domain.entities import FileToolOwner
from domains.file_tools.domain.enums import OwnerType
from domains.file_tools.domain.errors import ConversionError, StorageError, ValidationError
from domains.file_tools.infrastructure.repositories import FileToolsRepository
from domains.file_tools.infrastructure.storage.local_dev_storage import LocalDevStorage
from domains.file_tools.validators.image_converter_validator import ImageConverterValidator, supported_output_formats


@pytest.fixture(autouse=True)
def reset_file_tool_memory():
    FileToolsRepository._memory_jobs.clear()
    FileToolsRepository._memory_artifacts.clear()
    FileToolsRepository._memory_drafts.clear()
    FileToolsRepository._memory_events.clear()
    yield
    FileToolsRepository._memory_jobs.clear()
    FileToolsRepository._memory_artifacts.clear()
    FileToolsRepository._memory_drafts.clear()
    FileToolsRepository._memory_events.clear()


def image_bytes(fmt: str = "PNG", mode: str = "RGB", color=None, size=(12, 10)) -> bytes:
    if color is None:
        color = (255, 0, 0, 255) if mode == "RGBA" else (255, 0, 0)
    image = Image.new(mode, size, color)
    output = BytesIO()
    image.save(output, format=fmt)
    return output.getvalue()


def request_for(
    content: bytes,
    filename: str = "sample.png",
    mime_type: str = "image/png",
    output_format: str = "jpeg",
    quality: int | None = None,
    idempotency_key: str | None = None,
) -> ImageConvertRequest:
    return ImageConvertRequest(
        file_bytes=content,
        filename=filename,
        declared_mime_type=mime_type,
        output_format=output_format,
        quality=quality,
        background="#ffffff",
        idempotencyKey=idempotency_key,
    )


def owner_context() -> RequestContext:
    return RequestContext(
        owner=FileToolOwner(OwnerType.GUEST, "image-test-guest"),
        request_id="req-image-test",
        ip_address="127.0.0.1",
    )


def test_pillow_converter_converts_png_to_jpeg_and_flattens_alpha():
    request = request_for(
        image_bytes("PNG", mode="RGBA", color=(0, 128, 255, 90)),
        filename="transparent.png",
        mime_type="image/png",
        output_format="jpeg",
        quality=92,
    )
    ImageConverterValidator().validate(request, authenticated=False)

    result = PillowImageConverter().convert(request)

    assert result.bytes.startswith(b"\xff\xd8\xff")
    assert result.mime_type == "image/jpeg"
    assert result.extension == "jpg"
    with Image.open(BytesIO(result.bytes)) as converted:
        assert converted.mode == "RGB"
        assert converted.size == (12, 10)


def test_pillow_converter_preserves_png_alpha():
    request = request_for(
        image_bytes("PNG", mode="RGBA", color=(0, 128, 255, 90)),
        filename="transparent.png",
        mime_type="image/png",
        output_format="png",
    )

    result = PillowImageConverter().convert(request)

    assert result.bytes.startswith(b"\x89PNG")
    with Image.open(BytesIO(result.bytes)) as converted:
        assert converted.mode == "RGBA"


def test_pillow_converter_converts_png_to_webp_when_supported():
    if "webp" not in supported_output_formats():
        pytest.skip("Pillow WebP encoder is not available.")
    request = request_for(
        image_bytes("PNG"),
        filename="sample.png",
        mime_type="image/png",
        output_format="webp",
        quality=82,
    )

    result = PillowImageConverter().convert(request)

    assert result.bytes.startswith(b"RIFF")
    assert result.mime_type == "image/webp"


def test_image_validator_rejects_spoofed_extension():
    request = request_for(
        image_bytes("JPEG"),
        filename="not-really.png",
        mime_type="image/jpeg",
        output_format="png",
    )

    with pytest.raises(ValidationError) as exc:
        ImageConverterValidator().validate(request, authenticated=False)

    assert exc.value.code == "UNSUPPORTED_IMAGE_FORMAT"


def test_image_orchestrator_idempotency_reuses_succeeded_artifact(tmp_path):
    repository = FileToolsRepository(supabase_client=None)
    storage = LocalDevStorage(root=str(tmp_path))
    orchestrator = ConversionOrchestrator(ToolRegistry(), repository, storage, InMemoryRateLimitService())
    request = request_for(
        image_bytes("PNG"),
        output_format="jpeg",
        idempotency_key="same-image-request",
    )
    context = owner_context()

    first = orchestrator.generate_image_conversion(request, context)
    second = orchestrator.generate_image_conversion(request, context)

    assert second.artifact.id == first.artifact.id
    assert second.downloadUrl != ""
    assert len(FileToolsRepository._memory_artifacts) == 1


def test_image_orchestrator_timeout_returns_structured_error(monkeypatch):
    orchestrator = ConversionOrchestrator(
        ToolRegistry(),
        FileToolsRepository(supabase_client=None),
        LocalDevStorage(),
        InMemoryRateLimitService(),
    )
    monkeypatch.setattr(
        "domains.file_tools.application.conversion_orchestrator.IMAGE_CONVERSION_LIMITS",
        types.SimpleNamespace(conversion_timeout_seconds=0.01),
    )

    class SlowConverter:
        def convert(self, _request):
            time.sleep(0.05)
            return ConversionResult(b"ok", "image/png", "png", 1)

    with pytest.raises(ConversionError) as exc:
        orchestrator._convert_with_timeout(SlowConverter(), request_for(image_bytes("PNG")))

    assert exc.value.code == "IMAGE_CONVERSION_TIMEOUT"


def test_image_orchestrator_surfaces_storage_error():
    class FailingStorage(LocalDevStorage):
        def put_bytes(self, *_args, **_kwargs):
            raise StorageError("storage down")

    orchestrator = ConversionOrchestrator(
        ToolRegistry(),
        FileToolsRepository(supabase_client=None),
        FailingStorage(),
        InMemoryRateLimitService(),
    )

    with pytest.raises(StorageError) as exc:
        orchestrator.generate_image_conversion(request_for(image_bytes("PNG"), output_format="jpeg"), owner_context())

    assert exc.value.code == "STORAGE_ERROR"
