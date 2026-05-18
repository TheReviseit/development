import base64
import importlib
import re
import sys
import types
import zlib
from pathlib import Path

import pytest
from reportlab.platypus import ListFlowable

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from domains.file_tools.application.conversion_orchestrator import ConversionOrchestrator
from domains.file_tools.application.rate_limit_service import InMemoryRateLimitService
from domains.file_tools.application.tool_registry import ToolRegistry
from domains.file_tools.contracts.common import RequestContext
from domains.file_tools.contracts.text_to_pdf import ListBlock, TextPdfGenerateRequest
from domains.file_tools.converters.text_to_pdf.reportlab_converter import ReportLabTextToPdfConverter
from domains.file_tools.converters.text_to_pdf.layout_mapper import paragraph_style
from domains.file_tools.domain.entities import FileToolOwner
from domains.file_tools.domain.enums import OwnerType
from domains.file_tools.domain.errors import ConversionError, PermissionDeniedError, StorageError, ValidationError
from domains.file_tools.infrastructure.repositories import FileToolsRepository
from domains.file_tools.infrastructure.security.signed_downloads import create_download_token, verify_download_token
from domains.file_tools.infrastructure.storage.local_dev_storage import LocalDevStorage


@pytest.fixture(autouse=True)
def reset_pdf_font_engine_caches():
    import lib.fonts.pdf_font_engine as pdf_font_engine

    pdf_font_engine._REGISTERED_FONTS.clear()
    pdf_font_engine._REGISTERED_FONT_PATHS.clear()
    pdf_font_engine._CMAP_CACHE.clear()
    yield
    pdf_font_engine._REGISTERED_FONTS.clear()
    pdf_font_engine._REGISTERED_FONT_PATHS.clear()
    pdf_font_engine._CMAP_CACHE.clear()


def decoded_pdf_streams(pdf_bytes: bytes) -> bytes:
    streams: list[bytes] = []
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\n?endstream", pdf_bytes, re.S):
        data = match.group(1).strip()
        try:
            if data.endswith(b"~>"):
                data = base64.a85decode(b"<~" + data, adobe=True)
            streams.append(zlib.decompress(data))
        except Exception:
            continue
    return b"\n".join(streams)


def count_pdf_pages(pdf_bytes: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page\b", pdf_bytes))


def sample_payload(text: str = "Hello Flowauxi") -> dict:
    return {
        "document": {
            "version": "1",
            "title": "Sample Document",
            "blocks": [
                {"type": "heading", "level": 1, "text": "Sample Document"},
                {"type": "paragraph", "text": text, "marks": ["bold"], "align": "left"},
                {"type": "list", "ordered": False, "items": ["One", "Two"]},
            ],
        },
        "options": {
            "pageSize": "A4",
            "orientation": "portrait",
            "margins": {"top": 54, "right": 54, "bottom": 54, "left": 54},
            "fontFamily": "Nirmala UI",
            "fontSize": 12,
            "lineHeight": 1.4,
            "footer": {"enabled": True, "text": "Flowauxi", "pageNumbers": True},
        },
    }


def test_text_to_pdf_contract_rejects_raw_html():
    payload = sample_payload("<script>alert(1)</script>")

    with pytest.raises(ValidationError) as exc:
        TextPdfGenerateRequest.parse_or_raise(payload)

    assert exc.value.code == "INVALID_TEXT_PDF_REQUEST"


@pytest.mark.parametrize(
    "blocks",
    [
        [{"type": "paragraph", "text": "   \n\t  ", "align": "left"}],
        [{"type": "heading", "level": 1, "text": "   "}],
        [{"type": "list", "ordered": False, "items": ["   ", "\t"]}],
        [{"type": "pageBreak"}],
    ],
)
def test_text_to_pdf_contract_rejects_title_only_empty_documents(blocks):
    payload = sample_payload("Ignored")
    payload["document"]["title"] = "Untitled document"
    payload["document"]["blocks"] = blocks

    request = TextPdfGenerateRequest.parse_or_raise(payload)

    with pytest.raises(ValidationError) as exc:
        request.assert_has_renderable_content()

    assert exc.value.code == "EMPTY_TEXT_PDF_DOCUMENT"
    assert "Add text" in exc.value.message


def test_reportlab_converter_generates_pdf_bytes():
    request = TextPdfGenerateRequest.parse_or_raise(sample_payload("A clean PDF body."))

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.bytes.startswith(b"%PDF")
    assert result.mime_type == "application/pdf"
    assert result.page_count >= 1


def test_reportlab_converter_generates_english_pdf_without_shaping_stack(monkeypatch):
    import lib.fonts.pdf_font_engine as pdf_font_engine

    def fail_if_shaping_is_requested():
        raise AssertionError("English-only PDF generation must not require HarfBuzz shaping.")

    monkeypatch.setattr(pdf_font_engine, "assert_shaping_stack_available", fail_if_shaping_is_requested)
    payload = sample_payload("Plain English PDF text.")
    payload["options"]["fontFamily"] = "Auto"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.bytes.startswith(b"%PDF")


def test_reportlab_converter_hides_internal_shaping_dependency_from_public_error(monkeypatch):
    import lib.fonts.pdf_font_engine as pdf_font_engine

    def fail_shaping_check():
        raise pdf_font_engine.PdfFontEngineError(
            "PDF_SHAPING_UNAVAILABLE",
            "uharfbuzz is required for Indian-script PDF shaping.",
        )

    monkeypatch.setattr(pdf_font_engine, "assert_shaping_stack_available", fail_shaping_check)
    request = TextPdfGenerateRequest.parse_or_raise(sample_payload("\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"))

    with pytest.raises(ConversionError) as exc:
        ReportLabTextToPdfConverter().convert(request)

    assert exc.value.code == "PDF_SHAPING_UNAVAILABLE"
    assert "uharfbuzz" not in exc.value.message.lower()


@pytest.mark.parametrize(
    "text",
    [
        "\u0939\u093f\u0928\u094d\u0926\u0940 \u092a\u093e\u0920 \u0915\u0940 \u091c\u093e\u0901\u091a",
        "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u0b89\u0bb0\u0bc8 \u0b9a\u0bcb\u0ba4\u0ba9\u0bc8",
        "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02 \u0d35\u0d3e\u0d1a\u0d15 \u0d2a\u0d30\u0d3f\u0d36\u0d4b\u0d27\u0d28",
        "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1 \u0caa\u0ca0\u0ccd\u0caf \u0caa\u0cb0\u0cc0\u0c95\u0ccd\u0cb7\u0cc6",
        "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41 \u0c2a\u0c3e\u0c20\u0c4d\u0c2f\u0c02 \u0c2a\u0c30\u0c40\u0c15\u0c4d\u0c37",
        (
            "English "
            "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd "
            "\u0939\u093f\u0928\u094d\u0926\u0940 "
            "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02 "
            "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1 "
            "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41"
        ),
    ],
)
def test_reportlab_converter_generates_primary_indian_scripts(text):
    payload = sample_payload(text)
    payload["options"]["fontFamily"] = "Auto"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.bytes.startswith(b"%PDF")
    assert result.page_count >= 1


def test_reportlab_converter_generates_large_mixed_script_document():
    text = (
        ("Every tool you need to use PDFs. " * 120)
        + ("\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02 \u0d35\u0d3e\u0d1a\u0d15\u0d02 " * 80)
        + ("\u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u0b89\u0bb0\u0bc8 " * 80)
        + ("\u0939\u093f\u0928\u094d\u0926\u0940 \u092a\u093e\u0920 " * 80)
    )
    payload = sample_payload(text)
    payload["document"]["title"] = "Project Notes"
    payload["document"]["blocks"] = [{"type": "paragraph", "text": text, "align": "left"}]
    payload["options"]["fontFamily"] = "Auto"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.bytes.startswith(b"%PDF")
    assert result.page_count >= 1


def test_latin_noto_font_registration_does_not_enable_shaping(monkeypatch, tmp_path):
    import lib.fonts.pdf_font_engine as pdf_font_engine

    pdf_font_engine._REGISTERED_FONTS.clear()
    pdf_font_engine._REGISTERED_FONT_PATHS.clear()
    font_path = tmp_path / "NotoSans-Regular.ttf"
    font_path.write_bytes(b"fake font placeholder")
    calls: list[dict] = []
    registered = {}

    class FakeFont:
        def __init__(self, alias, path, **kwargs):
            self.fontName = alias
            self.shapable = kwargs.get("shapable", False)
            calls.append({"alias": alias, "path": path, **kwargs})

    def fail_if_harfbuzz_is_requested():
        raise pdf_font_engine.PdfFontEngineError(
            "PDF_SHAPING_UNAVAILABLE",
            "HarfBuzz must not be required for Latin-only PDF rendering.",
        )

    monkeypatch.setattr(pdf_font_engine, "_font_directories", lambda: [tmp_path])
    monkeypatch.setattr(pdf_font_engine, "assert_shaping_stack_available", fail_if_harfbuzz_is_requested)
    monkeypatch.setattr(pdf_font_engine, "TTFont", FakeFont)
    monkeypatch.setattr(pdf_font_engine.pdfmetrics, "getRegisteredFontNames", lambda: [])
    monkeypatch.setattr(pdf_font_engine.pdfmetrics, "registerFont", lambda font: registered.setdefault(font.fontName, font))
    monkeypatch.setattr(pdf_font_engine.pdfmetrics, "getFont", lambda alias: registered[alias])

    alias = pdf_font_engine.resolve_pdf_font_name("NotoSans", text="Plain English PDF text.")

    assert alias == "FlowauxiNotoSansRegular"
    assert calls[-1]["shapable"] is False


def test_indic_noto_font_registration_requires_shaping(monkeypatch, tmp_path):
    import lib.fonts.pdf_font_engine as pdf_font_engine

    pdf_font_engine._REGISTERED_FONTS.clear()
    pdf_font_engine._REGISTERED_FONT_PATHS.clear()
    font_path = tmp_path / "NotoSansTamil-Regular.ttf"
    font_path.write_bytes(b"fake font placeholder")
    calls: list[dict] = []
    registered = {}
    shaping_checked = {"value": False}

    class FakeFont:
        def __init__(self, alias, path, **kwargs):
            self.fontName = alias
            self.shapable = kwargs.get("shapable", False)
            calls.append({"alias": alias, "path": path, **kwargs})

    monkeypatch.setattr(pdf_font_engine, "_font_directories", lambda: [tmp_path])
    monkeypatch.setattr(pdf_font_engine, "assert_shaping_stack_available", lambda: shaping_checked.update(value=True))
    monkeypatch.setattr(pdf_font_engine, "TTFont", FakeFont)
    monkeypatch.setattr(pdf_font_engine.pdfmetrics, "getRegisteredFontNames", lambda: [])
    monkeypatch.setattr(pdf_font_engine.pdfmetrics, "registerFont", lambda font: registered.setdefault(font.fontName, font))
    monkeypatch.setattr(pdf_font_engine.pdfmetrics, "getFont", lambda alias: registered[alias])

    alias = pdf_font_engine.resolve_pdf_font_name("Auto", text="\u0ba4\u0bae\u0bbf\u0bb4\u0bcd")

    assert alias == "FlowauxiNotoSansTamilRegularShaped"
    assert shaping_checked["value"] is True
    assert calls[-1]["shapable"] is True


def test_paragraph_style_only_enables_shaping_for_complex_scripts():
    english_request = TextPdfGenerateRequest.parse_or_raise(sample_payload("Plain English PDF text."))
    tamil_request = TextPdfGenerateRequest.parse_or_raise(sample_payload("\u0ba4\u0bae\u0bbf\u0bb4\u0bcd"))

    assert paragraph_style(english_request.options, text="Plain English PDF text.").shaping == 0
    assert paragraph_style(tamil_request.options, text="\u0ba4\u0bae\u0bbf\u0bb4\u0bcd").shaping == 1


def test_reportlab_converter_does_not_emit_trailing_blank_page():
    payload = sample_payload("Only one real page.")
    payload["document"]["blocks"] = [{"type": "paragraph", "text": "Only one real page.", "align": "left"}]
    payload["options"]["fontFamily"] = "Helvetica"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.page_count == 1
    assert count_pdf_pages(result.bytes) == 1


def test_reportlab_converter_keeps_explicit_page_break_count_exact():
    payload = sample_payload("Ignored")
    payload["document"]["blocks"] = [
        {"type": "paragraph", "text": "Page one.", "align": "left"},
        {"type": "pageBreak"},
        {"type": "paragraph", "text": "Page two.", "align": "left"},
    ]
    payload["options"]["fontFamily"] = "Helvetica"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.page_count == 2
    assert count_pdf_pages(result.bytes) == 2


def test_reportlab_converter_ignores_trailing_page_break():
    payload = sample_payload("Ignored")
    payload["document"]["blocks"] = [
        {"type": "paragraph", "text": "Only one real page.", "align": "left"},
        {"type": "pageBreak"},
    ]
    payload["options"]["fontFamily"] = "Helvetica"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.page_count == 1
    assert count_pdf_pages(result.bytes) == 1


def test_reportlab_converter_preserves_double_digit_ordered_list_numbers():
    payload = sample_payload()
    payload["document"]["blocks"] = [
        {"type": "list", "ordered": True, "start": 8, "items": ["Eight", "Nine", "Ten", "Eleven", "Twelve"]},
    ]
    payload["options"]["fontFamily"] = "Helvetica"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)
    content = decoded_pdf_streams(result.bytes)

    assert b"(8.) Tj" in content
    assert b"(9.) Tj" in content
    assert b"(10.) Tj" in content
    assert b"(11.) Tj" in content
    assert b"(12.) Tj" in content


def test_reportlab_converter_generates_multilingual_pdf_bytes():
    request = TextPdfGenerateRequest.parse_or_raise(
        sample_payload("English text. தமிழ் உரை. हिंदी पाठ.")
    )

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.bytes.startswith(b"%PDF")
    assert len(result.bytes) > 1500


def test_reportlab_converter_auto_uses_unicode_font_for_indic_text():
    payload = sample_payload("English text. தமிழ் உரை. हिंदी पाठ.")
    payload["options"]["fontFamily"] = "Helvetica"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    result = ReportLabTextToPdfConverter().convert(request)

    assert result.bytes.startswith(b"%PDF")
    assert b"FontFile2" in result.bytes
    assert b"ToUnicode" in result.bytes


def test_reportlab_converter_fails_closed_for_unsupported_special_symbols():
    payload = sample_payload("Invoice total: \u20b91,234 <= 9 and \u2211 values.")
    payload["options"]["fontFamily"] = "Helvetica"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    with pytest.raises(ConversionError) as exc:
        ReportLabTextToPdfConverter().convert(request)

    assert exc.value.code == "UNSUPPORTED_GLYPH"


def test_reportlab_converter_fails_closed_for_indic_without_verified_fonts(monkeypatch):
    import lib.fonts.pdf_font_engine as pdf_font_engine

    pdf_font_engine._REGISTERED_FONTS.clear()
    pdf_font_engine._REGISTERED_FONT_PATHS.clear()
    pdf_font_engine._CMAP_CACHE.clear()
    monkeypatch.setattr("lib.fonts.pdf_font_engine._font_directories", lambda: [])
    request = TextPdfGenerateRequest.parse_or_raise(
        sample_payload(
            "English text. \u0ba4\u0bae\u0bbf\u0bb4\u0bcd \u0b89\u0bb0\u0bc8. "
            "\u0939\u093f\u0928\u094d\u0926\u0940 \u092a\u093e\u0920."
        )
    )

    with pytest.raises(ConversionError) as exc:
        ReportLabTextToPdfConverter().convert(request)

    assert exc.value.code in {
        "FONT_NOT_REGISTERED",
        "PDF_GLYPH_PREFLIGHT_UNAVAILABLE",
        "PDF_SHAPING_UNAVAILABLE",
        "UNSUPPORTED_GLYPH",
    }


def test_reportlab_converter_fails_closed_for_symbols_without_unicode_font(monkeypatch):
    import lib.fonts.pdf_font_engine as pdf_font_engine

    pdf_font_engine._REGISTERED_FONTS.clear()
    pdf_font_engine._REGISTERED_FONT_PATHS.clear()
    pdf_font_engine._CMAP_CACHE.clear()
    monkeypatch.setattr("lib.fonts.pdf_font_engine._font_directories", lambda: [])
    payload = sample_payload("Invoice total: \u20b91,234 <= 9 and \u2211 values.")
    payload["options"]["fontFamily"] = "Helvetica"
    request = TextPdfGenerateRequest.parse_or_raise(payload)

    with pytest.raises(ConversionError) as exc:
        ReportLabTextToPdfConverter().convert(request)

    assert exc.value.code in {
        "FONT_NOT_REGISTERED",
        "PDF_GLYPH_PREFLIGHT_UNAVAILABLE",
        "UNSUPPORTED_GLYPH",
    }


def test_reportlab_converter_merges_split_ordered_lists_before_rendering():
    payload = sample_payload()
    payload["document"]["blocks"] = [
        {"type": "paragraph", "text": "Intro", "align": "left"},
        {"type": "list", "ordered": True, "items": ["One"]},
        {"type": "list", "ordered": True, "items": ["Two"]},
        {"type": "list", "ordered": True, "items": ["Three"]},
    ]
    request = TextPdfGenerateRequest.parse_or_raise(payload)
    converter = ReportLabTextToPdfConverter()

    merged = converter._merge_adjacent_list_blocks(request.document.blocks)
    story = converter._build_story(request)

    merged_lists = [block for block in merged if isinstance(block, ListBlock)]
    assert len(merged_lists) == 1
    assert merged_lists[0].items == ["One", "Two", "Three"]
    assert sum(isinstance(item, ListFlowable) for item in story) == 1


def test_orchestrator_generates_artifact_with_signed_download(tmp_path):
    repository = FileToolsRepository(supabase_client=None)
    storage = LocalDevStorage(str(tmp_path))
    orchestrator = ConversionOrchestrator(
        ToolRegistry(),
        repository,
        storage,
        InMemoryRateLimitService(),
    )
    owner = FileToolOwner(OwnerType.GUEST, "guest-hash")
    context = RequestContext(owner=owner, request_id="req-test", ip_address="127.0.0.1")

    response = orchestrator.generate_text_to_pdf(sample_payload(), context)

    assert response.success is True
    assert response.artifact.filename == "sample-document.pdf"
    assert response.downloadUrl.startswith("/api/file-tools/artifacts/")
    artifact = repository.get_artifact(response.artifact.id)
    assert artifact is not None
    assert storage.get_bytes(artifact.storage_key).startswith(b"%PDF")


def test_orchestrator_rejects_empty_text_to_pdf_generation(tmp_path):
    repository = FileToolsRepository(supabase_client=None)
    storage = LocalDevStorage(str(tmp_path))
    orchestrator = ConversionOrchestrator(
        ToolRegistry(),
        repository,
        storage,
        InMemoryRateLimitService(),
    )
    owner = FileToolOwner(OwnerType.GUEST, "guest-hash")
    context = RequestContext(owner=owner, request_id="req-empty", ip_address="127.0.0.1")
    payload = sample_payload("Ignored")
    payload["document"]["title"] = "Untitled document"
    payload["document"]["blocks"] = [{"type": "paragraph", "text": "   ", "align": "left"}]

    with pytest.raises(ValidationError) as exc:
        orchestrator.generate_text_to_pdf(payload, context)

    assert exc.value.code == "EMPTY_TEXT_PDF_DOCUMENT"
    assert "Add text" in exc.value.message


def test_orchestrator_logs_stage_for_unexpected_storage_failures(monkeypatch):
    class BrokenStorage:
        provider = "broken_storage"

        def put_bytes(self, key, content, mime_type, metadata=None):
            raise RuntimeError("simulated storage outage")

        def get_bytes(self, key):
            return b""

        def delete(self, key):
            return None

    captured: dict[str, object] = {}

    def capture_failure(_event: str, **fields):
        captured.update(fields)

    monkeypatch.setattr(
        "domains.file_tools.application.conversion_orchestrator.log_failure",
        capture_failure,
    )
    repository = FileToolsRepository(supabase_client=None)
    orchestrator = ConversionOrchestrator(
        ToolRegistry(),
        repository,
        BrokenStorage(),
        InMemoryRateLimitService(),
    )
    owner = FileToolOwner(OwnerType.GUEST, "guest-storage-failure")
    context = RequestContext(owner=owner, request_id="req-storage-failure", ip_address="127.0.0.1")

    with pytest.raises(ConversionError) as exc:
        orchestrator.generate_text_to_pdf(sample_payload(), context)

    assert exc.value.code == "CONVERSION_FAILED"
    assert captured["stage"] == "storage_put"
    assert captured["internal_error_type"] == "RuntimeError"
    assert captured["internal_message"] == "simulated storage outage"


def test_r2_storage_wraps_upload_failures(monkeypatch):
    from domains.file_tools.infrastructure.storage.r2_storage import R2Storage

    class FakeR2Client:
        def put_object(self, **_kwargs):
            raise RuntimeError("raw provider failure with internal details")

    monkeypatch.setenv("CLOUDFLARE_R2_ACCOUNT_ID", "account")
    monkeypatch.setenv("CLOUDFLARE_R2_ACCESS_KEY_ID", "access")
    monkeypatch.setenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("CLOUDFLARE_R2_BUCKET_NAME", "bucket")
    monkeypatch.setitem(sys.modules, "boto3", types.SimpleNamespace(client=lambda *_args, **_kwargs: FakeR2Client()))

    storage = R2Storage()

    with pytest.raises(StorageError) as exc:
        storage.put_bytes("artifact.pdf", b"%PDF", "application/pdf")

    assert exc.value.code == "STORAGE_ERROR"
    assert "internal details" not in exc.value.message


def test_r2_storage_accepts_existing_cloudflare_env_aliases(monkeypatch):
    from domains.file_tools.infrastructure.storage.r2_storage import ENV_GROUPS, R2Storage

    captured: dict[str, object] = {}

    class FakeR2Client:
        pass

    def fake_client(_service, **kwargs):
        captured.update(kwargs)
        return FakeR2Client()

    for keys in ENV_GROUPS.values():
        for key in keys:
            monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "existing-account")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "existing-access")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "existing-secret")
    monkeypatch.setenv("R2_BUCKET", "existing-bucket")
    monkeypatch.setitem(sys.modules, "boto3", types.SimpleNamespace(client=fake_client))

    storage = R2Storage()

    assert storage.bucket == "existing-bucket"
    assert captured["endpoint_url"] == "https://existing-account.r2.cloudflarestorage.com"
    assert captured["aws_access_key_id"] == "existing-access"
    assert captured["aws_secret_access_key"] == "existing-secret"


def test_r2_storage_health_uses_write_probe(monkeypatch):
    from domains.file_tools.infrastructure.storage.r2_storage import R2Storage

    calls: list[tuple[str, str]] = []

    class FakeR2Client:
        def put_object(self, **kwargs):
            calls.append(("put", kwargs["Key"]))

        def head_object(self, **kwargs):
            calls.append(("head", kwargs["Key"]))

        def delete_object(self, **kwargs):
            calls.append(("delete", kwargs["Key"]))

    monkeypatch.setenv("CLOUDFLARE_R2_ACCOUNT_ID", "account")
    monkeypatch.setenv("CLOUDFLARE_R2_ACCESS_KEY_ID", "access")
    monkeypatch.setenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("CLOUDFLARE_R2_BUCKET_NAME", "bucket")
    monkeypatch.setitem(sys.modules, "boto3", types.SimpleNamespace(client=lambda *_args, **_kwargs: FakeR2Client()))

    assert R2Storage().health_check() is True

    assert [call[0] for call in calls] == ["put", "head", "delete"]
    assert all(key.startswith("file-tools/_health/") for _, key in calls)


def test_r2_config_status_reports_missing_backend_env(monkeypatch):
    from domains.file_tools.infrastructure.storage.r2_storage import ENV_GROUPS, cloudflare_r2_config_status

    for keys in ENV_GROUPS.values():
        for key in keys:
            monkeypatch.delenv(key, raising=False)

    status = cloudflare_r2_config_status()

    assert status["is_configured"] is False
    assert status["missing"] == ["account_id", "access_key_id", "secret_access_key", "bucket_name"]


def test_cloudinary_storage_accepts_existing_frontend_env_aliases(monkeypatch):
    from domains.file_tools.infrastructure.storage.cloudinary_storage import CloudinaryStorage

    captured_config: dict[str, object] = {}
    captured_upload: dict[str, object] = {}

    fake_cloudinary = types.ModuleType("cloudinary")
    fake_cloudinary.config = lambda **kwargs: captured_config.update(kwargs)
    fake_cloudinary.uploader = types.SimpleNamespace(
        upload=lambda file_obj, **kwargs: captured_upload.update({"file_name": file_obj.name, **kwargs}) or {"public_id": kwargs["public_id"]},
        destroy=lambda *_args, **_kwargs: {"result": "ok"},
    )
    fake_cloudinary.utils = types.SimpleNamespace(
        cloudinary_url=lambda public_id, **_kwargs: (f"https://res.cloudinary.test/{public_id}", {}),
    )

    monkeypatch.setitem(sys.modules, "cloudinary", fake_cloudinary)
    monkeypatch.delenv("CLOUDINARY_URL", raising=False)
    monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
    monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)
    monkeypatch.setenv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "existing-cloud")
    monkeypatch.setenv("NEXT_PUBLIC_CLOUDINARY_API_KEY", "existing-key")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "existing-secret")

    storage = CloudinaryStorage()
    stored = storage.put_bytes("file-tools/guest/text_to_pdf/job/artifact.pdf", b"%PDF", "application/pdf")

    assert stored.provider == "cloudinary"
    assert captured_config == {
        "cloud_name": "existing-cloud",
        "api_key": "existing-key",
        "api_secret": "existing-secret",
        "secure": True,
    }
    assert captured_upload["resource_type"] == "raw"
    assert captured_upload["type"] == "authenticated"
    assert captured_upload["public_id"] == "file-tools/guest/text_to_pdf/job/artifact.pdf"


def test_cloudinary_storage_health_uploads_downloads_and_deletes(monkeypatch):
    from domains.file_tools.infrastructure.storage.cloudinary_storage import CloudinaryStorage, HEALTH_PROBE_BODY

    calls: list[str] = []
    fake_cloudinary = types.ModuleType("cloudinary")
    fake_cloudinary.config = lambda **_kwargs: None
    fake_cloudinary.uploader = types.SimpleNamespace(
        upload=lambda *_args, **_kwargs: calls.append("upload") or {"public_id": _kwargs["public_id"]},
        destroy=lambda *_args, **_kwargs: calls.append("delete") or {"result": "ok"},
    )
    fake_cloudinary.utils = types.SimpleNamespace(
        cloudinary_url=lambda public_id, **_kwargs: (f"https://res.cloudinary.test/{public_id}", {}),
    )

    class FakeResponse:
        content = HEALTH_PROBE_BODY

        def raise_for_status(self):
            return None

    monkeypatch.setitem(sys.modules, "cloudinary", fake_cloudinary)
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "cloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
    monkeypatch.setattr(
        "domains.file_tools.infrastructure.storage.cloudinary_storage.requests.get",
        lambda *_args, **_kwargs: calls.append("download") or FakeResponse(),
    )

    assert CloudinaryStorage().health_check() is True

    assert calls[:3] == ["upload", "download", "delete"]


def test_storage_factory_prefers_cloudinary_when_configured(monkeypatch):
    from domains.file_tools.infrastructure.storage import factory

    class FakeCloudinaryStorage:
        provider = "cloudinary"

        @classmethod
        def is_configured(cls):
            return True

    class FakeR2Storage:
        provider = "cloudflare_r2"

        @classmethod
        def is_configured(cls):
            return True

    monkeypatch.delenv("FILE_TOOLS_STORAGE_PROVIDER", raising=False)
    monkeypatch.delenv("FLASK_ENV", raising=False)
    monkeypatch.setattr(factory, "CloudinaryStorage", FakeCloudinaryStorage)
    monkeypatch.setattr(factory, "R2Storage", FakeR2Storage)

    storage = factory.create_artifact_storage()

    assert storage.provider == "cloudinary"


def test_file_tools_health_reports_safe_artifact_storage_detail(monkeypatch):
    class FakeBlueprint:
        def __init__(self, *_args, **_kwargs):
            pass

        def route(self, *_args, **_kwargs):
            def decorator(handler):
                return handler

            return decorator

    fake_flask = types.SimpleNamespace(
        Blueprint=FakeBlueprint,
        jsonify=lambda payload: payload,
        request=types.SimpleNamespace(args={}),
        send_file=lambda *_args, **_kwargs: None,
    )
    monkeypatch.setitem(sys.modules, "flask", fake_flask)
    routes = importlib.import_module("domains.file_tools.api.routes")

    def broken_storage():
        raise StorageError("Cloudflare R2 storage is not configured for file tools.")

    monkeypatch.setattr(routes, "create_artifact_storage", broken_storage)

    ready, detail = routes._artifact_storage_status()

    assert ready is False
    assert detail == {
        "status": "not_ready",
        "code": "STORAGE_ERROR",
        "message": "Cloudflare R2 storage is not configured for file tools.",
    }


def test_signed_download_token_expiry_is_enforced():
    token = create_download_token("artifact-1", "guest:abc", ttl_seconds=-1)

    with pytest.raises(PermissionDeniedError):
        verify_download_token(token, "artifact-1", "guest:abc")
