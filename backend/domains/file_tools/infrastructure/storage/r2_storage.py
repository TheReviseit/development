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
        self.client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )

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
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=content,
            ContentType=mime_type,
            Metadata=metadata or {},
        )
        return StoredObject(provider=self.provider, key=key, size_bytes=len(content), mime_type=mime_type)

    def get_bytes(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


def create_artifact_storage() -> ArtifactStorage:
    if R2Storage.is_configured():
        try:
            return R2Storage()
        except StorageError:
            if os.getenv("FLASK_ENV", "development") == "production":
                raise
    from .local_dev_storage import LocalDevStorage

    return LocalDevStorage()
