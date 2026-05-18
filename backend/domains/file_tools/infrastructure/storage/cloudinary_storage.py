"""Cloudinary artifact storage adapter for generated file-tool outputs."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePosixPath
from typing import Optional

import requests

from ...domain.errors import StorageError
from .base import ArtifactStorage, StoredObject


@dataclass(frozen=True)
class CloudinaryConfig:
    cloud_name: str | None
    api_key: str | None
    api_secret: str | None
    cloudinary_url: str | None


CLOUDINARY_ENV_GROUPS = {
    "cloud_name": ("CLOUDINARY_CLOUD_NAME", "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"),
    "api_key": ("CLOUDINARY_API_KEY", "NEXT_PUBLIC_CLOUDINARY_API_KEY"),
    "api_secret": ("CLOUDINARY_API_SECRET",),
}

HEALTH_PROBE_BODY = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF\n"
)


class CloudinaryStorage(ArtifactStorage):
    provider = "cloudinary"

    def __init__(self):
        try:
            import cloudinary
            from cloudinary import uploader, utils
        except ImportError as exc:
            raise StorageError("cloudinary is required for Cloudinary file storage.") from exc

        config = load_cloudinary_config()
        if config.cloudinary_url:
            cloudinary.config(secure=True)
        else:
            cloudinary.config(
                cloud_name=config.cloud_name,
                api_key=config.api_key,
                api_secret=config.api_secret,
                secure=True,
            )

        self.uploader = uploader
        self.utils = utils
        self.delivery_type = os.getenv("FILE_TOOLS_CLOUDINARY_DELIVERY_TYPE", "authenticated")
        self.public_id_prefix = os.getenv("FILE_TOOLS_CLOUDINARY_PREFIX", "").strip("/")

    @classmethod
    def is_configured(cls) -> bool:
        return cloudinary_config_status()["is_configured"]

    def put_bytes(self, key: str, content: bytes, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        public_id = self._public_id(key)
        file_obj = BytesIO(content)
        file_obj.name = PurePosixPath(public_id).name or "artifact.pdf"
        try:
            upload_options = {
                "resource_type": "raw",
                "type": self.delivery_type,
                "public_id": public_id,
                "overwrite": True,
                "unique_filename": False,
                "use_filename": False,
                "invalidate": True,
            }
            context = _metadata_context(metadata)
            if context:
                upload_options["context"] = context
            self.uploader.upload(file_obj, **upload_options)
        except Exception as exc:
            raise StorageError("Generated PDF storage is unavailable. Please try again shortly.") from exc
        return StoredObject(provider=self.provider, key=key, size_bytes=len(content), mime_type=mime_type)

    def get_bytes(self, key: str) -> bytes:
        url = self._signed_download_url(key)
        try:
            response = requests.get(url, timeout=(3, 20))
            response.raise_for_status()
            return response.content
        except Exception as exc:
            raise StorageError("Generated PDF storage is unavailable. Please try again shortly.") from exc

    def delete(self, key: str) -> None:
        try:
            self.uploader.destroy(
                self._public_id(key),
                resource_type="raw",
                type=self.delivery_type,
                invalidate=True,
            )
        except Exception as exc:
            raise StorageError("Generated PDF storage cleanup failed.") from exc

    def health_check(self) -> bool:
        key = f"file-tools/_health/{uuid.uuid4().hex}.pdf"
        try:
            self.put_bytes(key, HEALTH_PROBE_BODY, "application/pdf", {"purpose": "file-tools-health"})
            if self.get_bytes(key) != HEALTH_PROBE_BODY:
                raise StorageError("Cloudinary storage health probe returned unexpected content.")
            self.delete(key)
            return True
        except StorageError:
            raise
        except Exception as exc:
            raise StorageError("Cloudinary storage is not reachable or lacks upload/download/delete permission.") from exc
        finally:
            try:
                self.delete(key)
            except Exception:
                pass

    def _signed_download_url(self, key: str) -> str:
        url, _options = self.utils.cloudinary_url(
            self._public_id(key),
            resource_type="raw",
            type=self.delivery_type,
            secure=True,
            sign_url=True,
        )
        return url

    def _public_id(self, key: str) -> str:
        safe_key = key.replace("\\", "/").strip("/")
        if not safe_key:
            raise StorageError("Invalid Cloudinary storage key.")
        safe_key = _cloudinary_blob_key(safe_key)
        if self.public_id_prefix and not safe_key.startswith(f"{self.public_id_prefix}/"):
            return f"{self.public_id_prefix}/{safe_key}"
        return safe_key


def load_cloudinary_config() -> CloudinaryConfig:
    cloudinary_url = os.getenv("CLOUDINARY_URL")
    values = {field: _first_env_value(keys) for field, keys in CLOUDINARY_ENV_GROUPS.items()}
    missing = [field for field, value in values.items() if not value]
    if not cloudinary_url and missing:
        raise StorageError(
            "Cloudinary storage is not configured on the backend. "
            f"Missing: {', '.join(missing)}."
        )
    return CloudinaryConfig(
        cloud_name=values["cloud_name"],
        api_key=values["api_key"],
        api_secret=values["api_secret"],
        cloudinary_url=cloudinary_url,
    )


def cloudinary_config_status() -> dict[str, object]:
    has_url = bool(os.getenv("CLOUDINARY_URL"))
    fields = {field: bool(_first_env_value(keys)) for field, keys in CLOUDINARY_ENV_GROUPS.items()}
    missing = [] if has_url else [field for field, present in fields.items() if not present]
    return {
        **fields,
        "cloudinary_url": has_url,
        "missing": missing,
        "is_configured": has_url or not missing,
    }


def _metadata_context(metadata: Optional[dict[str, str]]) -> str | None:
    if not metadata:
        return None
    safe_pairs = []
    for key, value in metadata.items():
        safe_key = str(key).replace("|", "_").replace("=", "_")[:64]
        safe_value = str(value).replace("|", "_")[:256]
        safe_pairs.append(f"{safe_key}={safe_value}")
    return "|".join(safe_pairs)


def _cloudinary_blob_key(key: str) -> str:
    if key.lower().endswith(".pdf"):
        return f"{key[:-4]}.bin"
    return key


def _first_env_value(keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None
