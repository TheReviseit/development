"""Translation provider adapters."""

from __future__ import annotations

import os
from abc import ABC, abstractmethod

import requests

from .models import TranslationProviderName, TranslationRequest, TranslationResult


class TranslationProvider(ABC):
    name: TranslationProviderName
    model_version: str

    @abstractmethod
    def translate(self, request: TranslationRequest) -> TranslationResult:
        raise NotImplementedError


class LibreTranslateProvider(TranslationProvider):
    name = TranslationProviderName.LIBRETRANSLATE
    model_version = "libretranslate-api-v1"

    def __init__(self, base_url: str | None = None, timeout_seconds: float = 10.0):
        self.base_url = (base_url or os.getenv("LIBRETRANSLATE_URL") or "http://localhost:5001").rstrip("/")
        self.timeout_seconds = timeout_seconds

    def translate(self, request: TranslationRequest) -> TranslationResult:
        response = requests.post(
            f"{self.base_url}/translate",
            json={
                "q": request.text,
                "source": request.source_locale,
                "target": request.target_locale,
                "format": "text",
            },
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        return TranslationResult(
            text=payload["translatedText"],
            provider=self.name,
            source_locale=request.source_locale,
            target_locale=request.target_locale,
            model_version=self.model_version,
        )


class IndicTransProvider(TranslationProvider):
    name = TranslationProviderName.INDICTRANS2
    model_version = os.getenv("INDICTRANS2_MODEL_VERSION", "indictrans2")

    def translate(self, request: TranslationRequest) -> TranslationResult:
        raise RuntimeError(
            "IndicTrans2 provider is configured as the production Indic fallback contract; "
            "deploy the model service and wire INDICTRANS2_URL before enabling it."
        )
