"""Script-first language detection for PDF and translation routing."""

from __future__ import annotations

from dataclasses import dataclass

from lib.fonts.indic_scripts import Script, ScriptRun, scripts_in_text, segment_script_runs


SCRIPT_LOCALE_HINTS: dict[Script, str] = {
    Script.DEVANAGARI: "hi",
    Script.TAMIL: "ta",
    Script.MALAYALAM: "ml",
    Script.KANNADA: "kn",
    Script.TELUGU: "te",
    Script.LATIN: "en",
}


@dataclass(frozen=True)
class LanguageDetectionResult:
    locale: str
    confidence: float
    scripts: list[str]
    runs: list[ScriptRun]
    mixed: bool


class LanguageDetectionService:
    def detect(self, text: str) -> LanguageDetectionResult:
        runs = segment_script_runs(text)
        scripts = sorted(script.value for script in scripts_in_text(text))
        locale = self._locale_for_runs(runs)
        mixed = len({run.script for run in runs if run.text.strip()}) > 1
        confidence = 0.95 if scripts else 0.6

        return LanguageDetectionResult(
            locale=locale,
            confidence=confidence,
            scripts=scripts or [Script.LATIN.value],
            runs=runs,
            mixed=mixed,
        )

    def _locale_for_runs(self, runs: list[ScriptRun]) -> str:
        counts: dict[Script, int] = {}
        for run in runs:
            if not run.text.strip():
                continue
            counts[run.script] = counts.get(run.script, 0) + len(run.text)
        if not counts:
            return "en"
        non_latin_counts = {
            script: count
            for script, count in counts.items()
            if script not in {Script.LATIN, Script.COMMON}
        }
        script = max((non_latin_counts or counts).items(), key=lambda item: item[1])[0]
        return SCRIPT_LOCALE_HINTS.get(script, "en")
