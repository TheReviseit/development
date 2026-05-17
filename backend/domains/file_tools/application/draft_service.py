"""Draft persistence service for file tools."""

from __future__ import annotations

from ..contracts.common import RequestContext
from ..contracts.text_to_pdf import TextPdfGenerateRequest
from ..domain.events import DRAFT_SAVED
from ..domain.policies import TEXT_TO_PDF_LIMITS
from ..infrastructure.repositories import FileToolsRepository, utc_now


class DraftService:
    def __init__(self, repository: FileToolsRepository):
        self.repository = repository

    def get_text_to_pdf_draft(self, context: RequestContext) -> dict | None:
        return self.repository.get_draft(context.owner, "text_to_pdf")

    def save_text_to_pdf_draft(self, payload: dict, context: RequestContext) -> dict:
        request = TextPdfGenerateRequest.parse_or_raise(payload)
        expires_at = utc_now() + TEXT_TO_PDF_LIMITS.draft_retention
        draft = request.model_dump(mode="json")
        self.repository.upsert_draft(context.owner, "text_to_pdf", draft, expires_at)
        self.repository.record_event(context.owner, DRAFT_SAVED, "text_to_pdf", {"expires_at": expires_at.isoformat()})
        return {"success": True, "expiresAt": expires_at.isoformat()}

    def delete_text_to_pdf_draft(self, context: RequestContext) -> dict:
        self.repository.delete_draft(context.owner, "text_to_pdf")
        return {"success": True}
