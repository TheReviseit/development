"""
Form Builder Domain Entities — Core Business Objects

Rich domain models for forms, fields, responses, and values.
Follows the same dataclass + factory method pattern as domain/entities.py (Order).
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
import uuid
import re
import random
import string


# =============================================================================
# ENUMS
# =============================================================================

class FormStatus(Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class FieldType(Enum):
    # ── Basic Inputs ──────────────────────────────────────────────────────
    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    PHONE_INTERNATIONAL = "phone_international"
    NUMBER = "number"
    URL = "url"
    PASSWORD = "password"
    TEXTAREA = "textarea"

    # ── Choice Fields ─────────────────────────────────────────────────────
    DROPDOWN = "dropdown"
    RADIO = "radio"
    CHECKBOX = "checkbox"
    MULTI_SELECT = "multi_select"
    YES_NO = "yes_no"
    CONSENT_CHECKBOX = "consent_checkbox"

    # ── Date & Time ───────────────────────────────────────────────────────
    DATE = "date"
    TIME = "time"
    DATE_RANGE = "date_range"

    # ── Survey ────────────────────────────────────────────────────────────
    RATING = "rating"
    SCALE = "scale"
    SLIDER = "slider"

    # ── Advanced ──────────────────────────────────────────────────────────
    FILE_UPLOAD = "file_upload"
    SIGNATURE = "signature"
    ADDRESS = "address"
    HIDDEN = "hidden"
    UTM = "utm"

    # ── Layout (non-input) ────────────────────────────────────────────────
    HEADING = "heading"
    PARAGRAPH_BLOCK = "paragraph_block"
    DESCRIPTION = "description"
    DIVIDER = "divider"
    SPACER = "spacer"


class ResponseStatus(Enum):
    COMPLETED = "completed"
    PARTIAL = "partial"
    SPAM = "spam"


# =============================================================================
# HELPER
# =============================================================================

def generate_slug(title: str) -> str:
    """
    Generate a clean, deterministic URL-safe slug from a title.

    Examples:
        "Customer Feedback" → "customer-feedback"
        "My   Form!!!"     → "my-form"

    The slug is stable: the same title always produces the same slug.
    Uniqueness is handled at the service layer via numeric suffixes.
    """
    slug = title.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    if not slug:
        # Fallback for titles with no alphanumeric chars
        slug = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return slug


def generate_unique_slug_candidate(base_slug: str, attempt: int) -> str:
    """
    Generate a slug candidate with a numeric suffix for collision resolution.

    Examples:
        ("customer-feedback", 0) → "customer-feedback"
        ("customer-feedback", 1) → "customer-feedback-1"
        ("customer-feedback", 2) → "customer-feedback-2"
    """
    if attempt == 0:
        return base_slug
    return f"{base_slug}-{attempt}"


def generate_short_id() -> str:
    """Generate a 6-digit numeric short ID."""
    return str(random.randint(100000, 999999))


# =============================================================================
# FORM ENTITY
# =============================================================================

@dataclass
class Form:
    """
    Form domain entity.

    Manages form lifecycle (draft → published → archived),
    settings, theme, and field management.
    """
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    slug: Optional[str] = None
    short_id: Optional[str] = None
    status: FormStatus = FormStatus.DRAFT
    version: int = 1

    # Appearance
    theme: Dict[str, Any] = field(default_factory=lambda: {
        "primaryColor": "#4f46e5",
        "backgroundColor": "#ffffff",
        "fontFamily": "Inter",
        "borderRadius": "8px",
        "logoUrl": None,
    })
    cover_image_url: Optional[str] = None

    # Settings
    settings: Dict[str, Any] = field(default_factory=lambda: {
        "submitButtonText": "Submit",
        "successMessage": "Thank you! Your response has been recorded.",
        "successRedirectUrl": None,
        "notifyOnSubmission": True,
        "notifyEmails": [],
        "captchaEnabled": False,
        "captchaProvider": None,
        "rateLimitPerIp": 10,
        "rateLimitWindowMinutes": 60,
        "closedMessage": "This form is no longer accepting responses.",
        "isOpen": True,
        "maxResponses": None,
        "expiresAt": None,
    })

    # UTM tracking
    utm_tracking: Dict[str, Any] = field(default_factory=lambda: {
        "captureUtm": True,
        "captureReferrer": True,
        "captureIp": True,
        "captureUserAgent": True,
    })

    # Webhooks
    webhooks: List[Dict[str, Any]] = field(default_factory=list)

    # Stats
    response_count: int = 0

    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    published_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    # ── Factory ────────────────────────────────────────────────────────────
    @classmethod
    def create(
        cls,
        user_id: str,
        title: str = "Untitled Form",
        description: Optional[str] = None,
    ) -> "Form":
        """Create a new form with auto-generated slug and short ID."""
        now = datetime.utcnow()
        return cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=title,
            description=description,
            slug=generate_slug(title),
            short_id=generate_short_id(),
            created_at=now,
            updated_at=now,
        )

    # ── State Transitions ──────────────────────────────────────────────────
    def publish(self) -> None:
        """Publish the form, making it publicly accessible."""
        if self.status == FormStatus.ARCHIVED:
            raise ValueError("Cannot publish an archived form. Restore it first.")
        self.status = FormStatus.PUBLISHED
        self.published_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.version += 1

    def unpublish(self) -> None:
        """Return to draft state."""
        self.status = FormStatus.DRAFT
        self.updated_at = datetime.utcnow()
        self.version += 1

    def archive(self) -> None:
        """Soft-archive the form."""
        self.status = FormStatus.ARCHIVED
        self.deleted_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def is_accepting_responses(self) -> bool:
        """Check if the form can accept new submissions."""
        if self.status != FormStatus.PUBLISHED:
            return False
        if self.deleted_at is not None:
            return False
        if not self.settings.get("isOpen", True):
            return False
        max_resp = self.settings.get("maxResponses")
        if max_resp and self.response_count >= max_resp:
            return False
        expires = self.settings.get("expiresAt")
        if expires:
            exp_dt = datetime.fromisoformat(expires) if isinstance(expires, str) else expires
            if datetime.utcnow() > exp_dt:
                return False
        return True

    # ── Serialization ──────────────────────────────────────────────────────
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "description": self.description,
            "slug": self.slug,
            "short_id": self.short_id,
            "status": self.status.value,
            "version": self.version,
            "theme": self.theme,
            "cover_image_url": self.cover_image_url,
            "settings": self.settings,
            "utm_tracking": self.utm_tracking,
            "webhooks": self.webhooks,
            "response_count": self.response_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Form":
        return cls(
            id=data["id"],
            user_id=data["user_id"],
            title=data.get("title", "Untitled Form"),
            description=data.get("description"),
            slug=data.get("slug"),
            short_id=data.get("short_id"),
            status=FormStatus(data.get("status", "draft")),
            version=data.get("version", 1),
            theme=data.get("theme") or {},
            cover_image_url=data.get("cover_image_url"),
            settings=data.get("settings") or {},
            utm_tracking=data.get("utm_tracking") or {},
            webhooks=data.get("webhooks") or [],
            response_count=data.get("response_count", 0),
            created_at=cls._parse_dt(data.get("created_at")),
            updated_at=cls._parse_dt(data.get("updated_at")),
            published_at=cls._parse_dt(data.get("published_at")),
            deleted_at=cls._parse_dt(data.get("deleted_at")),
        )

    @staticmethod
    def _parse_dt(value) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
        return None


# =============================================================================
# FORM FIELD ENTITY
# =============================================================================

@dataclass
class FormField:
    """Individual field within a form."""
    id: str
    form_id: str
    field_type: FieldType
    label: str = "Untitled Field"
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    default_value: Optional[str] = None
    position: int = 0
    section: Optional[str] = None
    required: bool = False
    validation: Dict[str, Any] = field(default_factory=dict)
    options: List[Dict[str, str]] = field(default_factory=list)
    conditional: Optional[Dict[str, Any]] = None
    settings: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    @classmethod
    def create(
        cls,
        form_id: str,
        field_type: str,
        label: str = "Untitled Field",
        position: int = 0,
        **kwargs,
    ) -> "FormField":
        return cls(
            id=str(uuid.uuid4()),
            form_id=form_id,
            field_type=FieldType(field_type),
            label=label,
            position=position,
            placeholder=kwargs.get("placeholder"),
            help_text=kwargs.get("help_text"),
            default_value=kwargs.get("default_value"),
            required=kwargs.get("required", False),
            validation=kwargs.get("validation", {}),
            options=kwargs.get("options", []),
            conditional=kwargs.get("conditional"),
            settings=kwargs.get("settings", {}),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "form_id": self.form_id,
            "field_type": self.field_type.value,
            "label": self.label,
            "placeholder": self.placeholder,
            "help_text": self.help_text,
            "default_value": self.default_value,
            "position": self.position,
            "section": self.section,
            "required": self.required,
            "validation": self.validation,
            "options": self.options,
            "conditional": self.conditional,
            "settings": self.settings,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FormField":
        return cls(
            id=data["id"],
            form_id=data["form_id"],
            field_type=FieldType(data["field_type"]),
            label=data.get("label", "Untitled Field"),
            placeholder=data.get("placeholder"),
            help_text=data.get("help_text"),
            default_value=data.get("default_value"),
            position=data.get("position", 0),
            section=data.get("section"),
            required=data.get("required", False),
            validation=data.get("validation", {}),
            options=data.get("options", []),
            conditional=data.get("conditional"),
            settings=data.get("settings", {}),
            created_at=Form._parse_dt(data.get("created_at")) or datetime.utcnow(),
            updated_at=Form._parse_dt(data.get("updated_at")) or datetime.utcnow(),
        )


# =============================================================================
# FORM RESPONSE ENTITY
# =============================================================================

@dataclass
class FormResponse:
    """A single form submission."""
    id: str
    form_id: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    referrer: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_term: Optional[str] = None
    utm_content: Optional[str] = None
    status: ResponseStatus = ResponseStatus.COMPLETED
    submitted_at: datetime = field(default_factory=datetime.utcnow)
    created_at: datetime = field(default_factory=datetime.utcnow)

    @classmethod
    def create(cls, form_id: str, **kwargs) -> "FormResponse":
        now = datetime.utcnow()
        return cls(
            id=str(uuid.uuid4()),
            form_id=form_id,
            ip_address=kwargs.get("ip_address"),
            user_agent=kwargs.get("user_agent"),
            referrer=kwargs.get("referrer"),
            utm_source=kwargs.get("utm_source"),
            utm_medium=kwargs.get("utm_medium"),
            utm_campaign=kwargs.get("utm_campaign"),
            utm_term=kwargs.get("utm_term"),
            utm_content=kwargs.get("utm_content"),
            submitted_at=now,
            created_at=now,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "form_id": self.form_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "referrer": self.referrer,
            "utm_source": self.utm_source,
            "utm_medium": self.utm_medium,
            "utm_campaign": self.utm_campaign,
            "utm_term": self.utm_term,
            "utm_content": self.utm_content,
            "status": self.status.value,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# =============================================================================
# RESPONSE VALUE ENTITY
# =============================================================================

@dataclass
class ResponseValue:
    """Individual field value within a response."""
    id: str
    response_id: str
    field_id: str
    value: Optional[str] = None
    file_url: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)

    @classmethod
    def create(cls, response_id: str, field_id: str, value: str = None, file_url: str = None) -> "ResponseValue":
        return cls(
            id=str(uuid.uuid4()),
            response_id=response_id,
            field_id=field_id,
            value=value,
            file_url=file_url,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "response_id": self.response_id,
            "field_id": self.field_id,
            "value": self.value,
            "file_url": self.file_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
