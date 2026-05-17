"""Provider routing and cache-aware translation service."""

from __future__ import annotations

from collections.abc import MutableMapping

from .cache_key import translation_cache_key
from .models import TranslationProviderName, TranslationRequest, TranslationResult
from .providers import IndicTransProvider, LibreTranslateProvider, TranslationProvider


INDIC_LOCALES = {"ta", "hi", "ml", "kn", "te"}


class TranslationService:
    def __init__(
        self,
        providers: dict[TranslationProviderName, TranslationProvider] | None = None,
        cache: MutableMapping[str, str] | None = None,
    ):
        self.providers = providers or {
            TranslationProviderName.LIBRETRANSLATE: LibreTranslateProvider(),
            TranslationProviderName.INDICTRANS2: IndicTransProvider(),
        }
        self.cache = cache

    def translate(self, request: TranslationRequest) -> TranslationResult:
        provider = self._select_provider(request)
        cache_key = translation_cache_key(
            text=request.text,
            source_locale=request.source_locale,
            target_locale=request.target_locale,
            provider=provider.name.value,
            model_version=provider.model_version,
            glossary_version=request.glossary_version,
            tenant_scope=request.tenant_scope,
        )

        if self.cache is not None and cache_key in self.cache:
            return TranslationResult(
                text=self.cache[cache_key],
                provider=provider.name,
                source_locale=request.source_locale,
                target_locale=request.target_locale,
                model_version=provider.model_version,
                cache_hit=True,
            )

        result = provider.translate(request)
        if self.cache is not None:
            self.cache[cache_key] = result.text
        return result

    def _select_provider(self, request: TranslationRequest) -> TranslationProvider:
        if request.source_locale in INDIC_LOCALES or request.target_locale in INDIC_LOCALES:
            return self.providers[TranslationProviderName.INDICTRANS2]
        return self.providers[TranslationProviderName.LIBRETRANSLATE]
