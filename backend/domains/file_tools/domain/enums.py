"""File tools domain enumerations."""

from enum import Enum


class FileToolStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ExecutionMode(str, Enum):
    SYNC = "sync"
    ASYNC = "async"


class OwnerType(str, Enum):
    USER = "user"
    GUEST = "guest"
