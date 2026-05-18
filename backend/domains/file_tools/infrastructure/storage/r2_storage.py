"""Cloudflare R2 artifact storage adapter using the S3-compatible API."""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Optional

from ...domain.errors import StorageError
from .base import ArtifactStorage, StoredObject


@dataclass(frozen=True)
class CloudflareR2Config:
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket_name: str
    endpoint_url: str


ENV_GROUPS = {
    "account_id": ("CLOUDFLARE_R2_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID", "R2_ACCOUNT_ID"),
    "access_key_id": ("CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"),
    "secret_access_key": (
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "R2_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
    ),
    "bucket_name": ("CLOUDFLARE_R2_BUCKET_NAME", "CLOUDFLARE_R2_BUCKET", "R2_BUCKET_NAME", "R2_BUCKET"),
}

ENDPOINT_ENV_KEYS = ("CLOUDFLARE_R2_ENDPOINT_URL", "R2_ENDPOINT_URL", "AWS_S3_ENDPOINT_URL")
HEALTH_PROBE_BODY = b"flowauxi-file-tools-storage-health"


class R2Storage(ArtifactStorage):
    provider = "cloudflare_r2"

    def __init__(self):
        try:
            import boto3
        except ImportError as exc:
            raise StorageError("boto3 is required for Cloudflare R2 storage.") from exc

        config = load_cloudflare_r2_config()

        self.bucket = config.bucket_name
        client_options = {
            "endpoint_url": config.endpoint_url,
            "aws_access_key_id": config.access_key_id,
            "aws_secret_access_key": config.secret_access_key,
            "region_name": "auto",
        }
        try:
            from botocore.config import Config

            client_options["config"] = Config(
                connect_timeout=3,
                read_timeout=10,
                retries={"max_attempts": 2, "mode": "standard"},
            )
        except Exception:
            pass

        self.client = boto3.client("s3", **client_options)

    @classmethod
    def is_configured(cls) -> bool:
        return cloudflare_r2_config_status()["is_configured"]

    def put_bytes(self, key: str, content: bytes, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content,
                ContentType=mime_type,
                CacheControl="private, max-age=0, no-store",
                Metadata=metadata or {},
            )
        except Exception as exc:
            raise StorageError("Generated PDF storage is unavailable. Please try again shortly.") from exc
        return StoredObject(provider=self.provider, key=key, size_bytes=len(content), mime_type=mime_type)

    def get_bytes(self, key: str) -> bytes:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].read()
        except Exception as exc:
            raise StorageError("Generated PDF storage is unavailable. Please try again shortly.") from exc

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            raise StorageError("Generated PDF storage cleanup failed.") from exc

    def health_check(self) -> bool:
        if os.getenv("FILE_TOOLS_STORAGE_HEALTH_PROBE", "write").lower() in {"1", "true", "write", "deep"}:
            return self._write_probe()
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception as exc:
            raise StorageError("Cloudflare R2 storage is not reachable.") from exc

    def _write_probe(self) -> bool:
        key = f"file-tools/_health/{uuid.uuid4().hex}.txt"
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=HEALTH_PROBE_BODY,
                ContentType="text/plain; charset=utf-8",
                CacheControl="private, max-age=0, no-store",
                Metadata={"purpose": "file-tools-health"},
            )
            self.client.head_object(Bucket=self.bucket, Key=key)
            self.client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as exc:
            try:
                self.client.delete_object(Bucket=self.bucket, Key=key)
            except Exception:
                pass
            raise StorageError("Cloudflare storage is not reachable or lacks object write/read/delete permission.") from exc


def create_artifact_storage() -> ArtifactStorage:
    if R2Storage.is_configured():
        try:
            return R2Storage()
        except StorageError:
            if os.getenv("FLASK_ENV", "development") == "production":
                raise
    if _production_requires_remote_storage():
        status = cloudflare_r2_config_status()
        missing = status.get("missing") or []
        missing_text = f" Missing: {', '.join(missing)}." if missing else ""
        raise StorageError(f"Cloudflare storage is not configured on the backend.{missing_text}")
    from .local_dev_storage import LocalDevStorage

    return LocalDevStorage()


def _production_requires_remote_storage() -> bool:
    if os.getenv("FLASK_ENV", "development").lower() != "production":
        return False
    return os.getenv("FILE_TOOLS_ALLOW_LOCAL_STORAGE", "false").lower() not in {"1", "true", "yes"}


def load_cloudflare_r2_config() -> CloudflareR2Config:
    values = {field: _first_env_value(keys) for field, keys in ENV_GROUPS.items()}
    missing = [field for field, value in values.items() if not value]
    if missing:
        raise StorageError(
            "Cloudflare storage is not configured on the backend. "
            f"Missing: {', '.join(missing)}."
        )

    endpoint_url = _first_env_value(ENDPOINT_ENV_KEYS) or (
        f"https://{values['account_id']}.r2.cloudflarestorage.com"
    )

    return CloudflareR2Config(
        account_id=values["account_id"] or "",
        access_key_id=values["access_key_id"] or "",
        secret_access_key=values["secret_access_key"] or "",
        bucket_name=values["bucket_name"] or "",
        endpoint_url=endpoint_url.rstrip("/"),
    )


def cloudflare_r2_config_status() -> dict[str, object]:
    fields = {field: bool(_first_env_value(keys)) for field, keys in ENV_GROUPS.items()}
    missing = [field for field, present in fields.items() if not present]
    return {
        **fields,
        "endpoint_url": bool(_first_env_value(ENDPOINT_ENV_KEYS)) or fields["account_id"],
        "missing": missing,
        "is_configured": not missing,
    }


def _first_env_value(keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None
