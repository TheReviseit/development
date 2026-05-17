"""History service for file tools."""

from __future__ import annotations

from ..contracts.common import RequestContext
from ..domain.errors import PermissionDeniedError
from ..infrastructure.security.signed_downloads import create_download_token
from ..infrastructure.repositories import FileToolsRepository


class HistoryService:
    def __init__(self, repository: FileToolsRepository):
        self.repository = repository

    def list_history(self, context: RequestContext) -> dict:
        if not context.owner.is_authenticated:
            raise PermissionDeniedError("History is available for authenticated users.")
        items = self.repository.list_history(context.owner)
        for item in items:
            token = create_download_token(item["id"], context.owner.token_subject)
            item["downloadUrl"] = f"/api/file-tools/artifacts/{item['id']}/download?token={token}"
        return {"success": True, "items": items}
