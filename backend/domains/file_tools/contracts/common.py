"""Shared contracts and request context for file tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pydantic import BaseModel

from ..domain.entities import FileToolOwner


class ApiError(BaseModel):
    code: str
    message: str
    request_id: str


class ApiErrorResponse(BaseModel):
    success: bool = False
    error: ApiError


class JobResponse(BaseModel):
    id: str
    status: str
    toolKey: str


class ArtifactResponse(BaseModel):
    id: str
    filename: str
    sizeBytes: int
    expiresAt: str


class GenerateResponse(BaseModel):
    success: bool = True
    job: JobResponse
    artifact: ArtifactResponse
    downloadUrl: str


@dataclass(frozen=True)
class RequestContext:
    owner: FileToolOwner
    request_id: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
