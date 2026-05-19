"""Local ephemeral storage for development and tests."""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Optional

from .base import ArtifactStorage, StoredObject


class LocalDevStorage(ArtifactStorage):
    provider = "local_dev"

    def __init__(self, root: str | None = None):
        default_root = Path(__file__).resolve().parents[4] / ".tmp" / "file-tools"
        self.root = Path(root or os.getenv("FILE_TOOLS_LOCAL_STORAGE_DIR") or default_root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def health_check(self) -> bool:
        self.root.mkdir(parents=True, exist_ok=True)
        return self.root.is_dir() and os.access(self.root, os.W_OK)

    def _path(self, key: str) -> Path:
        safe_parts = [part for part in key.split("/") if part and part not in {".", ".."}]
        path = (self.root / Path(*safe_parts)).resolve()
        if not str(path).startswith(str(self.root)):
            raise ValueError("Invalid storage key.")
        return path

    def put_bytes(self, key: str, content: bytes, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return StoredObject(provider=self.provider, key=key, size_bytes=len(content), mime_type=mime_type)

    def put_file(self, key: str, path: str | Path, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        source = Path(path)
        shutil.copyfile(source, target)
        return StoredObject(provider=self.provider, key=key, size_bytes=target.stat().st_size, mime_type=mime_type)

    def get_bytes(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def download_to_path(self, key: str, path: str | Path) -> int:
        source = self._path(key)
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        return target.stat().st_size

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()
