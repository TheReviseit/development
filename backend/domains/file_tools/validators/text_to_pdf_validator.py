"""Text to PDF domain validation."""

from __future__ import annotations

from ..contracts.text_to_pdf import TextPdfGenerateRequest
from ..domain.errors import ValidationError
from ..domain.policies import TEXT_TO_PDF_LIMITS


class TextToPdfValidator:
    def validate(self, request: TextPdfGenerateRequest, authenticated: bool) -> None:
        text_limit = (
            TEXT_TO_PDF_LIMITS.authenticated_character_limit
            if authenticated
            else TEXT_TO_PDF_LIMITS.guest_character_limit
        )
        if request.character_count() > text_limit:
            raise ValidationError(
                "TEXT_LIMIT_EXCEEDED",
                f"Text is too large. Limit is {text_limit:,} characters.",
            )
