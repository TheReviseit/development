"""Domain entities for file tools."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from .enums import ExecutionMode, FileToolStatus, OwnerType


@dataclass(frozen=True)
class FileToolOwner:
    owner_type: OwnerType
    owner_id: str
    tenant_id: Optional[str] = None

    @property
    def is_authenticated(self) -> bool:
        return self.owner_type == OwnerType.USER

    @property
    def storage_partition(self) -> str:
        prefix = "users" if self.is_authenticated else "guests"
        safe_owner = self.owner_id.replace("/", "_")
        return f"{prefix}/{safe_owner}"

    @property
    def token_subject(self) -> str:
        prefix = "user" if self.is_authenticated else "guest"
        return f"{prefix}:{self.owner_id}"


@dataclass
class FileToolJob:
    id: str
    tool_key: str
    status: FileToolStatus
    execution_mode: ExecutionMode
    owner: FileToolOwner
    request_payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    idempotency_key: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class FileToolArtifact:
    id: str
    job_id: str
    tool_key: str
    owner: FileToolOwner
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    storage_provider: str
    storage_key: str
    expires_at: datetime
    created_at: datetime
    download_count: int = 0
