"""Noto font registration, glyph preflight, and ReportLab shaping guards."""

from __future__ import annotations

import html
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from .indic_scripts import (
    INDIC_COMPLEX_SCRIPTS,
    SCRIPT_FONT_FAMILY,
    Script,
    dominant_script,
    requires_complex_shaping,
    script_for_char,
    segment_script_runs,
)


CORE_FONT_FAMILIES: dict[str, dict[str, str]] = {
    "Helvetica": {
        "regular": "Helvetica",
        "bold": "Helvetica-Bold",
        "italic": "Helvetica-Oblique",
        "bold_italic": "Helvetica-BoldOblique",
    },
    "Times-Roman": {
        "regular": "Times-Roman",
        "bold": "Times-Bold",
        "italic": "Times-Italic",
        "bold_italic": "Times-BoldItalic",
    },
    "Courier": {
        "regular": "Courier",
        "bold": "Courier-Bold",
        "italic": "Courier-Oblique",
        "bold_italic": "Courier-BoldOblique",
    },
}


@dataclass(frozen=True)
class FontSpec:
    family: str
    script: Script
    regular_env: str
    bold_env: str
    regular_names: tuple[str, ...]
    bold_names: tuple[str, ...]


class PdfFontEngineError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


FONT_SPECS: dict[str, FontSpec] = {
    "NotoSans": FontSpec(
        "NotoSans",
        Script.LATIN,
        "FLOWAUXI_FONT_NOTO_SANS",
        "FLOWAUXI_FONT_NOTO_SANS_BOLD",
        ("NotoSans-Regular.ttf", "NotoSans.ttf"),
        ("NotoSans-Bold.ttf", "NotoSans-Regular.ttf", "NotoSans.ttf"),
    ),
    "NotoSansTamil": FontSpec(
        "NotoSansTamil",
        Script.TAMIL,
        "FLOWAUXI_FONT_NOTO_SANS_TAMIL",
        "FLOWAUXI_FONT_NOTO_SANS_TAMIL_BOLD",
        ("NotoSansTamil-Regular.ttf", "NotoSansTamil.ttf"),
        ("NotoSansTamil-Bold.ttf", "NotoSansTamil-Regular.ttf", "NotoSansTamil.ttf"),
    ),
    "NotoSansDevanagari": FontSpec(
        "NotoSansDevanagari",
        Script.DEVANAGARI,
        "FLOWAUXI_FONT_NOTO_SANS_DEVANAGARI",
        "FLOWAUXI_FONT_NOTO_SANS_DEVANAGARI_BOLD",
        ("NotoSansDevanagari-Regular.ttf", "NotoSansDevanagari.ttf"),
        ("NotoSansDevanagari-Bold.ttf", "NotoSansDevanagari-Regular.ttf", "NotoSansDevanagari.ttf"),
    ),
    "NotoSansMalayalam": FontSpec(
        "NotoSansMalayalam",
        Script.MALAYALAM,
        "FLOWAUXI_FONT_NOTO_SANS_MALAYALAM",
        "FLOWAUXI_FONT_NOTO_SANS_MALAYALAM_BOLD",
        ("NotoSansMalayalam-Regular.ttf", "NotoSansMalayalam.ttf"),
        ("NotoSansMalayalam-Bold.ttf", "NotoSansMalayalam-Regular.ttf", "NotoSansMalayalam.ttf"),
    ),
    "NotoSansKannada": FontSpec(
        "NotoSansKannada",
        Script.KANNADA,
        "FLOWAUXI_FONT_NOTO_SANS_KANNADA",
        "FLOWAUXI_FONT_NOTO_SANS_KANNADA_BOLD",
        ("NotoSansKannada-Regular.ttf", "NotoSansKannada.ttf"),
        ("NotoSansKannada-Bold.ttf", "NotoSansKannada-Regular.ttf", "NotoSansKannada.ttf"),
    ),
    "NotoSansTelugu": FontSpec(
        "NotoSansTelugu",
        Script.TELUGU,
        "FLOWAUXI_FONT_NOTO_SANS_TELUGU",
        "FLOWAUXI_FONT_NOTO_SANS_TELUGU_BOLD",
        ("NotoSansTelugu-Regular.ttf", "NotoSansTelugu.ttf"),
        ("NotoSansTelugu-Bold.ttf", "NotoSansTelugu-Regular.ttf", "NotoSansTelugu.ttf"),
    ),
}

LEGACY_UNICODE_FAMILIES = {"Nirmala UI", "Arial Unicode MS"}
AUTO_FONT_FAMILY = "Auto"

_REGISTERED_FONTS: dict[tuple[str, str, str], str] = {}
_REGISTERED_FONT_PATHS: dict[str, Path] = {}
_CMAP_CACHE: dict[Path, set[int]] = {}


def assert_shaping_stack_available() -> None:
    if _version_tuple(reportlab.Version) < (4, 4, 4):
        raise PdfFontEngineError(
            "PDF_SHAPING_UNAVAILABLE",
            (
                "ReportLab 4.4.4 or newer is required for HarfBuzz-backed complex-script "
                f"shaping. Found ReportLab {reportlab.Version} in {sys.executable}."
            ),
        )

    try:
        import uharfbuzz  # noqa: F401
    except Exception as exc:
        raise PdfFontEngineError(
            "PDF_SHAPING_UNAVAILABLE",
            (
                "uharfbuzz is required for Indian-script PDF shaping but is not installed "
                f"in the active backend Python: {sys.executable}."
            ),
        ) from exc


def assert_fonttools_available() -> None:
    try:
        import fontTools.ttLib  # noqa: F401
    except Exception as exc:
        raise PdfFontEngineError(
            "PDF_GLYPH_PREFLIGHT_UNAVAILABLE",
            "fonttools is required for glyph preflight before PDF generation.",
        ) from exc


def resolve_pdf_font_name(
    requested_family: str,
    marks: list[str] | None = None,
    text: str = "",
    require_shaping: bool | None = None,
) -> str:
    weight = "bold" if marks and "bold" in marks else "regular"
    needs_shaping = requires_complex_shaping(text) if require_shaping is None else require_shaping

    if requested_family == AUTO_FONT_FAMILY and _core_font_safe(text):
        return _core_font_name("Helvetica", marks)

    if requested_family in LEGACY_UNICODE_FAMILIES and _core_font_safe(text):
        return _core_font_name("Helvetica", marks)

    if requested_family in CORE_FONT_FAMILIES and _core_font_safe(text):
        return _core_font_name(requested_family, marks)

    family = _effective_noto_family(requested_family, text)
    return _register_noto_font(family, weight, shapable=needs_shaping)


def build_reportlab_markup(
    text: str,
    requested_family: str,
    marks: list[str] | None = None,
) -> str:
    fragments: list[str] = []
    paragraph_requires_shaping = requires_complex_shaping(text)
    force_noto_for_latin = paragraph_requires_shaping
    for run in segment_script_runs(text):
        family = _font_family_for_script(run.script, requested_family) if force_noto_for_latin else requested_family
        font_name = resolve_pdf_font_name(family, marks, run.text, require_shaping=paragraph_requires_shaping)
        escaped = html.escape(run.text or "", quote=False).replace("\n", "<br/>")
        fragments.append(f'<font name="{font_name}">{escaped}</font>')
    return "".join(fragments)


def preflight_texts(requested_family: str, texts: Iterable[str]) -> None:
    values = [value for value in texts if value]
    if any(requires_complex_shaping(value) for value in values):
        assert_shaping_stack_available()

    needs_glyph_preflight = any(
        requested_family in FONT_SPECS or not _core_font_safe(value)
        for value in values
    )
    if needs_glyph_preflight:
        assert_fonttools_available()

    for value in values:
        value_requires_shaping = requires_complex_shaping(value)
        for run in segment_script_runs(value):
            if not run.text.strip():
                continue
            font_name = resolve_pdf_font_name(
                requested_family,
                text=run.text,
                require_shaping=value_requires_shaping,
            )
            font_path = _REGISTERED_FONT_PATHS.get(font_name)
            if font_path:
                _assert_glyph_coverage(font_name, font_path, run.text)


def is_complex_text(text: str) -> bool:
    return requires_complex_shaping(text)


def _effective_noto_family(requested_family: str, text: str) -> str:
    if requested_family in LEGACY_UNICODE_FAMILIES or requested_family == AUTO_FONT_FAMILY:
        return _font_family_for_script(dominant_script(text), requested_family)
    if requested_family in FONT_SPECS:
        return requested_family
    if requested_family in CORE_FONT_FAMILIES:
        return _font_family_for_script(dominant_script(text), requested_family)
    return "NotoSans"


def _font_family_for_script(script: Script, requested_family: str) -> str:
    if requested_family in FONT_SPECS and requested_family != "NotoSans":
        return requested_family
    return SCRIPT_FONT_FAMILY.get(script, "NotoSans")


def _register_noto_font(family: str, weight: str, shapable: bool) -> str:
    spec = FONT_SPECS.get(family)
    if not spec:
        raise PdfFontEngineError("FONT_NOT_REGISTERED", f"Unknown PDF font family: {family}.")

    if shapable:
        assert_shaping_stack_available()

    cache_key = (family, weight, "shaped" if shapable else "plain")
    if cache_key in _REGISTERED_FONTS:
        return _REGISTERED_FONTS[cache_key]

    font_path = _resolve_font_path(spec, weight)
    alias = f"Flowauxi{family}{weight.title()}{'Shaped' if shapable else ''}"

    if alias not in pdfmetrics.getRegisteredFontNames():
        try:
            pdfmetrics.registerFont(TTFont(alias, str(font_path), shapable=shapable))
        except TypeError as exc:
            if not shapable:
                pdfmetrics.registerFont(TTFont(alias, str(font_path)))
            else:
                raise PdfFontEngineError(
                    "PDF_SHAPING_UNAVAILABLE",
                    "The installed ReportLab build does not support shapable=True font registration.",
                ) from exc

    font = pdfmetrics.getFont(alias)
    if shapable and not getattr(font, "shapable", False):
        raise PdfFontEngineError(
            "PDF_SHAPING_UNAVAILABLE",
            f"Font {family} registered without shaping support.",
        )
    if not shapable and getattr(font, "shapable", False):
        font.shapable = False

    _REGISTERED_FONTS[cache_key] = alias
    _REGISTERED_FONT_PATHS[alias] = font_path
    return alias


def _resolve_font_path(spec: FontSpec, weight: str) -> Path:
    env_var = spec.bold_env if weight == "bold" else spec.regular_env
    names = spec.bold_names if weight == "bold" else spec.regular_names

    candidates: list[Path] = []
    if os.getenv(env_var):
        candidates.append(Path(os.environ[env_var]))

    for directory in _font_directories():
        candidates.extend(directory / name for name in names)

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate

    raise PdfFontEngineError(
        "FONT_NOT_REGISTERED",
        f"{spec.family} is required for {spec.script.value} PDF rendering but no TTF file was found.",
    )


def _font_directories() -> list[Path]:
    dirs: list[Path] = []
    configured = os.getenv("FLOWAUXI_PDF_FONT_DIR")
    if configured:
        dirs.append(Path(configured))

    backend_root = Path(__file__).resolve().parents[2]
    dirs.extend(
        [
            backend_root / "assets" / "fonts",
            backend_root / "fonts",
            Path("/usr/share/fonts/truetype/noto"),
            Path("/usr/local/share/fonts"),
            Path("C:/Windows/Fonts"),
        ]
    )
    return dirs


def _assert_glyph_coverage(font_name: str, font_path: Path, text: str) -> None:
    cmap = _font_cmap(font_path)
    for char in text:
        if char.isspace():
            continue
        script = script_for_char(char)
        if script == Script.UNKNOWN:
            raise PdfFontEngineError(
                "UNSUPPORTED_GLYPH",
                f"Unsupported Unicode code point U+{ord(char):04X} for PDF rendering.",
            )
        if ord(char) not in cmap:
            raise PdfFontEngineError(
                "UNSUPPORTED_GLYPH",
                f"Font {font_name} does not contain glyph U+{ord(char):04X}.",
            )


def _font_cmap(font_path: Path) -> set[int]:
    if font_path in _CMAP_CACHE:
        return _CMAP_CACHE[font_path]

    from fontTools.ttLib import TTFont as FontToolsTTFont

    font = FontToolsTTFont(str(font_path), lazy=True)
    cmap: set[int] = set()
    for table in font["cmap"].tables:
        cmap.update(table.cmap.keys())
    _CMAP_CACHE[font_path] = cmap
    return cmap


def _core_font_safe(text: str) -> bool:
    for char in text:
        if char in {"\n", "\r", "\t"}:
            continue
        try:
            char.encode("cp1252")
        except UnicodeEncodeError:
            return False
    return True


def _core_font_name(font_family: str, marks: list[str] | None = None) -> str:
    marks = marks or []
    family = CORE_FONT_FAMILIES.get(font_family, CORE_FONT_FAMILIES["Helvetica"])
    if "bold" in marks and "italic" in marks:
        return family["bold_italic"]
    if "bold" in marks:
        return family["bold"]
    if "italic" in marks:
        return family["italic"]
    return family["regular"]


def _version_tuple(value: str) -> tuple[int, int, int]:
    parts: list[int] = []
    for token in value.split("."):
        digits = "".join(ch for ch in token if ch.isdigit())
        parts.append(int(digits or 0))
    return tuple((parts + [0, 0, 0])[:3])
