"""Language detection facade for voice turns."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VoiceLanguage:
    code: str
    script: str = "latin"
    confidence: float = 0.0
    is_mixed: bool = False

    @property
    def is_tanglish(self) -> bool:
        return self.code == "ta" and self.script == "latin"


class LanguageService:
    def detect(self, text: str) -> VoiceLanguage:
        try:
            from ai_brain.language_detector import detect_language

            result = detect_language(text)
            code = getattr(result.language, "value", str(result.language))
            return VoiceLanguage(
                code=code,
                script=getattr(result, "script", "latin"),
                confidence=float(getattr(result, "confidence", 0.0) or 0.0),
                is_mixed=bool(getattr(result, "is_mixed", False)),
            )
        except Exception:
            lowered = (text or "").lower()
            if any(word in lowered for word in ("vanakkam", "enna", "epdi", "irukku", "eppo")):
                return VoiceLanguage(code="ta", script="latin", confidence=0.45, is_mixed=True)
            return VoiceLanguage(code="en", confidence=0.5)

