"""Translation service request and response models."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class TranslationProviderName(str, Enum):
    LIBRETRANSLATE = "libretranslate"
    INDICTRANS2 = "indictrans2"


@dataclass(frozen=True)
class TranslationRequest:
    text: str
    source_locale: str
    target_locale: str
    tenant_scope: str = "public"
    glossary_version: str = "none"


@dataclass(frozen=True)
class TranslationResult:
    text: str
    provider: TranslationProviderName
    source_locale: str
    target_locale: str
    model_version: str
    cache_hit: bool = False
