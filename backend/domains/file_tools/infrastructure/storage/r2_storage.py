"""Cloudflare R2 artifact storage adapter using the S3-compatible API."""

from __future__ import annotations

import os
from typing import Optional

from ...domain.errors import StorageError
from .base import ArtifactStorage, StoredObject


class R2Storage(ArtifactStorage):
    provider = "cloudflare_r2"

    def __init__(self):
        try:
            import boto3
        except ImportError as exc:
            raise StorageError("boto3 is required for Cloudflare R2 storage.") from exc

        account_id = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID")
        access_key = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID")
        secret_key = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
        bucket = os.getenv("CLOUDFLARE_R2_BUCKET_NAME") or os.getenv("R2_BUCKET_NAME")
        if not all([account_id, access_key, secret_key, bucket]):
            raise StorageError("Cloudflare R2 environment variables are incomplete.")

        self.bucket = bucket
        client_options = {
            "endpoint_url": f"https://{account_id}.r2.cloudflarestorage.com",
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
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
        return all(
            [
                os.getenv("CLOUDFLARE_R2_ACCOUNT_ID"),
                os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
                os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
                os.getenv("CLOUDFLARE_R2_BUCKET_NAME") or os.getenv("R2_BUCKET_NAME"),
            ]
        )

    def put_bytes(self, key: str, content: bytes, mime_type: str, metadata: Optional[dict[str, str]] = None) -> StoredObject:
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content,
                ContentType=mime_type,
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
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception as exc:
            raise StorageError("Cloudflare R2 storage is not reachable.") from exc


def create_artifact_storage() -> ArtifactStorage:
    if R2Storage.is_configured():
        try:
            return R2Storage()
        except StorageError:
            if os.getenv("FLASK_ENV", "development") == "production":
                raise
    if _production_requires_remote_storage():
        raise StorageError("Cloudflare R2 storage is not configured for file tools.")
    from .local_dev_storage import LocalDevStorage

    return LocalDevStorage()


def _production_requires_remote_storage() -> bool:
    if os.getenv("FLASK_ENV", "development").lower() != "production":
        return False
    return os.getenv("FILE_TOOLS_ALLOW_LOCAL_STORAGE", "false").lower() not in {"1", "true", "yes"}
