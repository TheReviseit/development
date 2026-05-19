"""Typed domain errors for file tools."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class FileToolError(Exception):
    code: str
    message: str
    status_code: int = 400

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"


class ValidationError(FileToolError):
    def __init__(self, code: str, message: str):
        super().__init__(code=code, message=message, status_code=400)


class PermissionDeniedError(FileToolError):
    def __init__(self, message: str = "You do not have access to this file."):
        super().__init__(
            code="PERMISSION_DENIED",
            message=message,
            status_code=403,
        )


class NotFoundError(FileToolError):
    def __init__(self, message: str = "Resource not found."):
        super().__init__(code="NOT_FOUND", message=message, status_code=404)


class ConflictError(FileToolError):
    def __init__(self, code: str = "CONFLICT", message: str = "Resource conflict."):
        super().__init__(code=code, message=message, status_code=409)


class GoneError(FileToolError):
    def __init__(self, code: str = "GONE", message: str = "Resource is no longer available."):
        super().__init__(code=code, message=message, status_code=410)


class RateLimitError(FileToolError):
    def __init__(self, message: str = "Too many file generations. Try again shortly."):
        super().__init__(code="RATE_LIMITED", message=message, status_code=429)


class FeatureDisabledError(FileToolError):
    def __init__(self, message: str = "This file tool is currently unavailable."):
        super().__init__(code="FEATURE_DISABLED", message=message, status_code=403)


class StorageError(FileToolError):
    def __init__(self, message: str = "File storage failed."):
        super().__init__(code="STORAGE_ERROR", message=message, status_code=500)


class ConversionError(FileToolError):
    def __init__(self, message: str = "PDF generation failed.", code: str = "CONVERSION_FAILED"):
        super().__init__(code=code, message=message, status_code=500)
