"""Storage abstraction for document artifacts."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class StoredObject:
    provider: str
    key: str
    size_bytes: int
    mime_type: str


class ArtifactStorage(ABC):
    provider: str

    @abstractmethod
    def put_bytes(self, key: str, content: bytes, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        """Persist bytes and return normalized storage metadata."""

    @abstractmethod
    def get_bytes(self, key: str) -> bytes:
        """Read artifact bytes."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete an artifact if it exists."""
