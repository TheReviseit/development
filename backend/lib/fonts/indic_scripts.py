"""Unicode script detection for PDF font selection and shaping gates."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Script(str, Enum):
    LATIN = "Latin"
    DEVANAGARI = "Devanagari"
    TAMIL = "Tamil"
    MALAYALAM = "Malayalam"
    KANNADA = "Kannada"
    TELUGU = "Telugu"
    COMMON = "Common"
    UNKNOWN = "Unknown"


INDIC_COMPLEX_SCRIPTS = {
    Script.DEVANAGARI,
    Script.TAMIL,
    Script.MALAYALAM,
    Script.KANNADA,
    Script.TELUGU,
}


SCRIPT_FONT_FAMILY: dict[Script, str] = {
    Script.LATIN: "NotoSans",
    Script.DEVANAGARI: "NotoSansDevanagari",
    Script.TAMIL: "NotoSansTamil",
    Script.MALAYALAM: "NotoSansMalayalam",
    Script.KANNADA: "NotoSansKannada",
    Script.TELUGU: "NotoSansTelugu",
}


@dataclass(frozen=True)
class ScriptRun:
    script: Script
    text: str


def script_for_char(char: str) -> Script:
    codepoint = ord(char)
    if char.isspace():
        return Script.COMMON
    if 0x0000 <= codepoint <= 0x024F:
        return Script.LATIN
    if 0x0900 <= codepoint <= 0x097F:
        return Script.DEVANAGARI
    if 0x0B80 <= codepoint <= 0x0BFF:
        return Script.TAMIL
    if 0x0D00 <= codepoint <= 0x0D7F:
        return Script.MALAYALAM
    if 0x0C80 <= codepoint <= 0x0CFF:
        return Script.KANNADA
    if 0x0C00 <= codepoint <= 0x0C7F:
        return Script.TELUGU
    if _is_common_punctuation_or_symbol(codepoint):
        return Script.COMMON
    return Script.UNKNOWN


def segment_script_runs(text: str) -> list[ScriptRun]:
    runs: list[ScriptRun] = []
    current_script: Script | None = None
    current_text: list[str] = []

    for char in text:
        script = script_for_char(char)
        if script == Script.COMMON:
            script = current_script or Script.LATIN

        if current_script is None:
            current_script = script
        elif script != current_script:
            runs.append(ScriptRun(current_script, "".join(current_text)))
            current_text = []
            current_script = script

        current_text.append(char)

    if current_text and current_script is not None:
        runs.append(ScriptRun(current_script, "".join(current_text)))

    return runs


def scripts_in_text(text: str) -> set[Script]:
    scripts: set[Script] = set()
    for char in text:
        script = script_for_char(char)
        if script not in {Script.COMMON, Script.LATIN}:
            scripts.add(script)
    return scripts


def requires_complex_shaping(text: str) -> bool:
    return any(script in INDIC_COMPLEX_SCRIPTS for script in scripts_in_text(text))


def dominant_script(text: str) -> Script:
    counts: dict[Script, int] = {}
    for char in text:
        script = script_for_char(char)
        if script == Script.COMMON:
            continue
        counts[script] = counts.get(script, 0) + 1

    if not counts:
        return Script.LATIN
    return max(counts.items(), key=lambda item: item[1])[0]


def _is_common_punctuation_or_symbol(codepoint: int) -> bool:
    return (
        0x2000 <= codepoint <= 0x206F
        or 0x20A0 <= codepoint <= 0x20CF
        or 0x2100 <= codepoint <= 0x214F
        or 0x2190 <= codepoint <= 0x21FF
        or 0x2200 <= codepoint <= 0x22FF
        or 0x25A0 <= codepoint <= 0x25FF
    )
