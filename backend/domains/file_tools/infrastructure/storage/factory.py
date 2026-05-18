"""Artifact storage factory for file tools."""

from __future__ import annotations

import os

from ...domain.errors import StorageError
from .base import ArtifactStorage
from .cloudinary_storage import CloudinaryStorage, cloudinary_config_status
from .r2_storage import R2Storage, cloudflare_r2_config_status


def create_artifact_storage() -> ArtifactStorage:
    provider = os.getenv("FILE_TOOLS_STORAGE_PROVIDER", "auto").strip().lower()

    if provider in {"cloudinary", "cloudinary_raw"}:
        return CloudinaryStorage()

    if provider in {"r2", "cloudflare", "cloudflare_r2"}:
        return R2Storage()

    if provider in {"local", "local_dev"}:
        return _local_storage_or_raise()

    if provider and provider != "auto":
        raise StorageError(f"Unsupported file-tools storage provider: {provider}.")

    if CloudinaryStorage.is_configured():
        return CloudinaryStorage()

    if R2Storage.is_configured():
        return R2Storage()

    if _production_requires_remote_storage():
        raise StorageError(_missing_remote_storage_message())

    return _local_storage_or_raise()


def _local_storage_or_raise() -> ArtifactStorage:
    if _production_requires_remote_storage():
        raise StorageError("Local file-tools storage is disabled in production.")
    from .local_dev_storage import LocalDevStorage

    return LocalDevStorage()


def _production_requires_remote_storage() -> bool:
    if os.getenv("FLASK_ENV", "development").lower() != "production":
        return False
    return os.getenv("FILE_TOOLS_ALLOW_LOCAL_STORAGE", "false").lower() not in {"1", "true", "yes"}


def _missing_remote_storage_message() -> str:
    cloudinary_missing = cloudinary_config_status().get("missing") or []
    r2_missing = cloudflare_r2_config_status().get("missing") or []
    return (
        "No production file-tools storage provider is configured on the backend. "
        f"Cloudinary missing: {', '.join(cloudinary_missing) or 'none'}. "
        f"Cloudflare R2 missing: {', '.join(r2_missing) or 'none'}."
    )
