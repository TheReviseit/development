"""Storage abstraction for document artifacts."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class StoredObject:
    provider: str
    key: str
    size_bytes: int
    mime_type: str


class ArtifactStorage(ABC):
    provider: str

    def health_check(self) -> bool:
        """Return whether this storage backend is ready for artifact traffic."""
        return True

    @abstractmethod
    def put_bytes(self, key: str, content: bytes, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        """Persist bytes and return normalized storage metadata."""

    def put_file(self, key: str, path: str | Path, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        """Persist a local file.

        Storage backends that support streaming should override this method.
        The default keeps tests and existing small artifact flows simple.
        """
        source = Path(path)
        return self.put_bytes(key, source.read_bytes(), mime_type, metadata)

    @abstractmethod
    def get_bytes(self, key: str) -> bytes:
        """Read artifact bytes."""

    def download_to_path(self, key: str, path: str | Path) -> int:
        """Download an artifact to a local path and return written bytes."""
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        content = self.get_bytes(key)
        target.write_bytes(content)
        return len(content)

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete an artifact if it exists."""
