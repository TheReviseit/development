import sys
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image, ImageDraw
from werkzeug.datastructures import FileStorage, MultiDict

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domains.file_tools.application.ocr_service import OcrService
from domains.file_tools.contracts.common import RequestContext
from domains.file_tools.contracts.ocr import OcrUploadRequest
from domains.file_tools.converters.ocr.preprocessor import OcrPreprocessor
from domains.file_tools.converters.ocr.tesseract_service import (
    OcrEngineResult,
    TesseractService,
    _blocks_from_data,
    _normalize_confidence,
)
from domains.file_tools.domain.entities import FileToolOwner
from domains.file_tools.domain.enums import OwnerType
from domains.file_tools.domain.errors import ConflictError, PermissionDeniedError, ValidationError
from domains.file_tools.infrastructure.repositories import FileToolsRepository
from domains.file_tools.infrastructure.storage.local_dev_storage import LocalDevStorage
from domains.file_tools.validators.ocr_validator import OcrValidator


@pytest.fixture(autouse=True)
def reset_file_tool_memory():
    FileToolsRepository._memory_jobs.clear()
    FileToolsRepository._memory_artifacts.clear()
    FileToolsRepository._memory_drafts.clear()
    FileToolsRepository._memory_events.clear()
    FileToolsRepository._memory_upload_sessions.clear()
    FileToolsRepository._memory_upload_chunks.clear()
    FileToolsRepository._memory_progress_events.clear()
    FileToolsRepository._memory_video_metadata.clear()
    FileToolsRepository._memory_video_outputs.clear()
    FileToolsRepository._memory_ocr_results.clear()
    yield
    FileToolsRepository._memory_jobs.clear()
    FileToolsRepository._memory_artifacts.clear()
    FileToolsRepository._memory_drafts.clear()
    FileToolsRepository._memory_events.clear()
    FileToolsRepository._memory_upload_sessions.clear()
    FileToolsRepository._memory_upload_chunks.clear()
    FileToolsRepository._memory_progress_events.clear()
    FileToolsRepository._memory_video_metadata.clear()
    FileToolsRepository._memory_video_outputs.clear()
    FileToolsRepository._memory_ocr_results.clear()


def context(owner_id: str = "ocr-test-guest") -> RequestContext:
    return RequestContext(
        owner=FileToolOwner(OwnerType.GUEST, owner_id),
        request_id="req-ocr-test",
        ip_address="127.0.0.1",
    )


def image_bytes(text: str | None = None, fmt: str = "PNG", size=(640, 220)) -> bytes:
    image = Image.new("RGB", size, "white")
    if text:
        draw = ImageDraw.Draw(image)
        draw.text((32, 72), text, fill="black")
    output = BytesIO()
    image.save(output, format=fmt)
    return output.getvalue()


def upload_files(content: bytes, filename: str = "sample.png", mime_type: str = "image/png") -> MultiDict:
    return MultiDict(
        [
            (
                "file",
                FileStorage(
                    stream=BytesIO(content),
                    filename=filename,
                    content_type=mime_type,
                ),
            )
        ]
    )


def upload_form(idempotency_key: str = "ocr-idempotency-key") -> MultiDict:
    return MultiDict([("idempotencyKey", idempotency_key)])


class FakeQueue:
    def __init__(self):
        self.enqueued: list[str] = []

    def enqueue_extraction(self, job_id: str):
        self.enqueued.append(job_id)
        return type("Task", (), {"task_id": f"fake-task-{job_id}", "queue": "ocr"})()


class FakeEngine:
    def __init__(self, text: str = "FLOWAUXI OCR 123"):
        self.text = text
        self.extracted_paths: list[Path] = []

    def is_available(self) -> bool:
        return True

    def health(self) -> dict[str, object]:
        return {
            "available": True,
            "binary": "/fake/tesseract",
            "version": "fake-5.3.0",
            "languageCount": 2,
            "languages": ["eng", "tam"],
        }

    def extract(self, image_path: str | Path) -> OcrEngineResult:
        path = Path(image_path)
        assert path.exists()
        self.extracted_paths.append(path)
        return OcrEngineResult(
            text=self.text,
            blocks=[
                {
                    "id": "line-1",
                    "pageIndex": 0,
                    "type": "line",
                    "text": self.text,
                    "bbox": {"x": 10, "y": 12, "width": 180, "height": 32},
                    "confidence": 0.93,
                    "readingOrder": 1,
                }
            ],
            confidence={"mean": 0.93, "min": 0.9, "lowConfidenceTokenCount": 0, "providerAgreement": 1.0},
            language={"mode": "auto", "requested": "eng", "detectedScript": "Latin", "installedCount": 2},
            engine_version="fake-5.3.0",
        )


def make_service(tmp_path: Path, queue: FakeQueue | None = None, engine: FakeEngine | None = None) -> OcrService:
    return OcrService(
        FileToolsRepository(supabase_client=None),
        LocalDevStorage(str(tmp_path)),
        OcrValidator(),
        queue or FakeQueue(),
        OcrPreprocessor(),
        engine or FakeEngine(),
    )


def test_ocr_validator_accepts_image_and_rejects_pdf():
    owner = context().owner
    request = OcrUploadRequest(
        file_bytes=image_bytes("FLOWAUXI OCR 123"),
        filename="receipt.png",
        declared_mime_type="image/png",
    )

    inspection = OcrValidator().validate_upload(request, owner)

    assert inspection["format"] == "png"

    with pytest.raises(ValidationError) as exc:
        OcrValidator().validate_upload(
            OcrUploadRequest(
                file_bytes=b"%PDF-1.7 fake pdf",
                filename="scan.pdf",
                declared_mime_type="application/pdf",
            ),
            owner,
        )

    assert exc.value.code == "OCR_UNSUPPORTED_INPUT"


def test_ocr_upload_stores_source_and_enqueues_async_job(tmp_path):
    queue = FakeQueue()
    service = make_service(tmp_path, queue=queue)

    response = service.upload(
        upload_files(image_bytes("FLOWAUXI OCR 123")),
        upload_form("same-upload"),
        context(),
    )

    job = response["job"]
    assert job["status"] == "queued"
    assert queue.enqueued == [job["id"]]
    assert len(FileToolsRepository._memory_artifacts) == 1

    replay = service.upload(
        upload_files(image_bytes("FLOWAUXI OCR 123")),
        upload_form("same-upload"),
        context(),
    )
    assert replay["idempotentReplay"] is True
    assert replay["job"]["id"] == job["id"]


def test_ocr_extract_completes_job_and_serializes_text_and_json(tmp_path):
    engine = FakeEngine("FLOWAUXI OCR 123")
    service = make_service(tmp_path, engine=engine)
    ctx = context()
    uploaded = service.upload(upload_files(image_bytes("FLOWAUXI OCR 123")), upload_form("extract"), ctx)
    job_id = uploaded["job"]["id"]

    result = service.extract(job_id)
    job = service.get_job(job_id, ctx)
    text = service.get_text(job_id, ctx)
    json_result = service.get_json(job_id, ctx)

    assert result["status"] == "completed"
    assert job["status"] == "completed"
    assert "FLOWAUXI OCR 123" in text["text"]
    assert json_result["blocks"][0]["bbox"]["width"] == 180
    assert json_result["confidence"]["mean"] == 0.93


def test_ocr_retry_requires_failed_or_cancelled_job(tmp_path):
    service = make_service(tmp_path)
    ctx = context()
    uploaded = service.upload(upload_files(image_bytes("FLOWAUXI OCR 123")), upload_form("retry"), ctx)
    job_id = uploaded["job"]["id"]

    with pytest.raises(ConflictError):
        service.retry(job_id, ctx)

    service.repository.mark_job_failed(job_id, "OCR_ENGINE_FAILED", "failed", 10)
    retried = service.retry(job_id, ctx)

    assert retried["job"]["status"] == "queued"


def test_ocr_delete_removes_source_and_result_for_owner(tmp_path):
    service = make_service(tmp_path)
    ctx = context()
    uploaded = service.upload(upload_files(image_bytes("FLOWAUXI OCR 123")), upload_form("delete"), ctx)
    job_id = uploaded["job"]["id"]
    service.extract(job_id)

    deleted = service.delete(job_id, ctx)

    assert deleted["status"] == "deleted"
    assert service.repository.get_ocr_result(job_id) is None
    assert service.get_job(job_id, ctx)["status"] == "expired"


def test_ocr_job_access_is_owner_scoped(tmp_path):
    service = make_service(tmp_path)
    uploaded = service.upload(upload_files(image_bytes("FLOWAUXI OCR 123")), upload_form("owner"), context("owner-a"))

    with pytest.raises(PermissionDeniedError):
        service.get_job(uploaded["job"]["id"], context("owner-b"))


def test_tesseract_blocks_group_words_by_line():
    blocks = _blocks_from_data(
        {
            "text": ["FLOWAUXI", "OCR", "123"],
            "conf": ["91", "89", "95"],
            "page_num": [1, 1, 1],
            "block_num": [1, 1, 1],
            "par_num": [1, 1, 1],
            "line_num": [1, 1, 1],
            "left": [10, 94, 142],
            "top": [20, 20, 20],
            "width": [80, 42, 36],
            "height": [18, 18, 18],
        }
    )

    assert len(blocks) == 1
    assert blocks[0]["text"] == "FLOWAUXI OCR 123"
    assert blocks[0]["confidence"] == pytest.approx(0.9167, rel=1e-3)


def test_tesseract_confidence_normalization_handles_raw_and_normalized_values():
    assert _normalize_confidence(91.2) == pytest.approx(0.912)
    assert _normalize_confidence(0.91) == pytest.approx(0.91)
    assert _normalize_confidence(-2) == 0.0
    assert _normalize_confidence(140) == 1.0


def test_real_tesseract_extracts_generated_image_text_when_available(tmp_path):
    engine = TesseractService()
    if not engine.is_available():
        pytest.skip("Tesseract binary is not available in this environment.")

    prepared = OcrPreprocessor().preprocess(image_bytes("FLOWAUXI OCR 123", size=(900, 260)), tmp_path)
    result = engine.extract(prepared.path)

    assert "FLOWAUXI" in result.text.upper()
    assert result.blocks
