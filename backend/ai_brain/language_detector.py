"""
Language detection and routing for AI Brain.
Supports multiple Indian languages and Hinglish.
"""

import re
from typing import Dict, Optional, Tuple
from enum import Enum
from dataclasses import dataclass


class Language(str, Enum):
    """Supported languages."""
    ENGLISH = "en"
    HINDI = "hi"
    HINGLISH = "hinglish"
    TAMIL = "ta"
    TELUGU = "te"
    KANNADA = "kn"
    MALAYALAM = "ml"
    MARATHI = "mr"
    BENGALI = "bn"
    GUJARATI = "gu"
    PUNJABI = "pa"
    ODIA = "or"
    UNKNOWN = "unknown"


@dataclass
class LanguageDetectionResult:
    """Result from language detection."""
    language: Language
    confidence: float
    script: str  # latin, devanagari, etc.
    is_mixed: bool  # Code-mixed language


# Unicode ranges for Indian scripts
SCRIPT_RANGES = {
    "devanagari": (0x0900, 0x097F),  # Hindi, Marathi, Sanskrit
    "tamil": (0x0B80, 0x0BFF),
    "telugu": (0x0C00, 0x0C7F),
    "kannada": (0x0C80, 0x0CFF),
    "malayalam": (0x0D00, 0x0D7F),
    "bengali": (0x0980, 0x09FF),
    "gujarati": (0x0A80, 0x0AFF),
    "gurmukhi": (0x0A00, 0x0A7F),  # Punjabi
    "odia": (0x0B00, 0x0B7F),
}


# Common Hindi/Hinglish words in Roman script
HINGLISH_INDICATORS = [
    # Greetings
    r'\b(namaste|namaskar|kaise|kya|aap|tum|main|hum)\b',
    # Common words
    r'\b(hai|hain|ho|tha|the|thi|kar|karo|karna|batao|bolo|dekho)\b',
    r'\b(accha|theek|bahut|bohot|kuch|koi|sabhi|dono)\b',
    # Question words
    r'\b(kab|kahan|kidhar|kyun|kaun|kaise|kitna|kitne|kitni)\b',
    # Expressions
    r'\b(arey|yaar|bhai|didi|ji|haan|nahi|achha)\b',
    # Business terms
    r'\b(paisa|rupiya|rate|kitne|batao|milega|chahiye|lena)\b',
]

# Common Tamil words in Roman script
TAMIL_INDICATORS = [
    r'\b(vanakkam|enna|epdi|enga|yaaruku|inge)\b',
    r'\b(nalla|romba|konjam|illai|irukku)\b',
]

# Common Telugu words in Roman script
TELUGU_INDICATORS = [
    r'\b(namaskaram|ela|enti|ekkada|evaru)\b',
    r'\b(baagundi|chala|koncham|ledu|undi)\b',
]


class LanguageDetector:
    """
    Detects language from text.
    
    Supports:
    - Script-based detection (Devanagari, Tamil, etc.)
    - Roman script Indian language detection
    - Code-mixed language (Hinglish) detection
    """
    
    def __init__(self):
        # Compile regex patterns
        self._hinglish_patterns = [
            re.compile(p, re.IGNORECASE) for p in HINGLISH_INDICATORS
        ]
        self._tamil_patterns = [
            re.compile(p, re.IGNORECASE) for p in TAMIL_INDICATORS
        ]
        self._telugu_patterns = [
            re.compile(p, re.IGNORECASE) for p in TELUGU_INDICATORS
        ]
    
    def detect(self, text: str) -> LanguageDetectionResult:
        """
        Detect language from text.
        
        Args:
            text: Input text
            
        Returns:
            LanguageDetectionResult with language and confidence
        """
        if not text or not text.strip():
            return LanguageDetectionResult(
                language=Language.ENGLISH,
                confidence=0.0,
                script="latin",
                is_mixed=False
            )
        
        text = text.strip()
        
        # Step 1: Check for non-Latin scripts
        script_result = self._detect_script(text)
        if script_result:
            return script_result
        
        # Step 2: Check for Roman-script Indian languages
        roman_result = self._detect_roman_indian(text)
        if roman_result and roman_result.confidence > 0.3:
            return roman_result
        
        # Default to English
        return LanguageDetectionResult(
            language=Language.ENGLISH,
            confidence=0.9,
            script="latin",
            is_mixed=False
        )
    
    def _detect_script(self, text: str) -> Optional[LanguageDetectionResult]:
        """Detect language from non-Latin scripts."""
        script_counts: Dict[str, int] = {}
        total_chars = 0
        
        for char in text:
            code = ord(char)
            for script_name, (start, end) in SCRIPT_RANGES.items():
                if start <= code <= end:
                    script_counts[script_name] = script_counts.get(script_name, 0) + 1
                    total_chars += 1
                    break
        
        if not script_counts:
            return None
        
        # Find dominant script
        dominant_script = max(script_counts, key=script_counts.get)
        script_ratio = script_counts[dominant_script] / len(text.replace(" ", ""))
        
        # Map script to language
        script_to_lang = {
            "devanagari": Language.HINDI,
            "tamil": Language.TAMIL,
            "telugu": Language.TELUGU,
            "kannada": Language.KANNADA,
            "malayalam": Language.MALAYALAM,
            "bengali": Language.BENGALI,
            "gujarati": Language.GUJARATI,
            "gurmukhi": Language.PUNJABI,
            "odia": Language.ODIA,
        }
        
        language = script_to_lang.get(dominant_script, Language.HINDI)
        
        # Check for code-mixing (some Latin chars mixed in)
        latin_chars = sum(1 for c in text if c.isascii() and c.isalpha())
        is_mixed = latin_chars > 0 and script_ratio < 0.9
        
        return LanguageDetectionResult(
            language=language,
            confidence=min(0.95, script_ratio + 0.2),
            script=dominant_script,
            is_mixed=is_mixed
        )
    
    def _detect_roman_indian(self, text: str) -> Optional[LanguageDetectionResult]:
        """Detect Indian languages written in Roman script."""
        text_lower = text.lower()
        words = text_lower.split()
        total_words = len(words)
        
        if total_words == 0:
            return None
        
        # Count Hinglish indicators
        hinglish_matches = sum(
            1 for pattern in self._hinglish_patterns
            if pattern.search(text_lower)
        )
        
        # Count Tamil indicators
        tamil_matches = sum(
            1 for pattern in self._tamil_patterns
            if pattern.search(text_lower)
        )
        
        # Count Telugu indicators
        telugu_matches = sum(
            1 for pattern in self._telugu_patterns
            if pattern.search(text_lower)
        )
        
        # Determine language
        max_matches = max(hinglish_matches, tamil_matches, telugu_matches)
        
        if max_matches == 0:
            return None
        
        if hinglish_matches == max_matches and hinglish_matches > 0:
            # Check if it's pure Hindi transliteration or mixed
            english_words = sum(1 for w in words if self._is_english_word(w))
            
            if english_words > total_words * 0.3:
                # Code-mixed Hinglish
                return LanguageDetectionResult(
                    language=Language.HINGLISH,
                    confidence=min(0.85, 0.4 + hinglish_matches * 0.1),
                    script="latin",
                    is_mixed=True
                )
            else:
                # Primarily Hindi in Roman
                return LanguageDetectionResult(
                    language=Language.HINDI,
                    confidence=min(0.75, 0.3 + hinglish_matches * 0.1),
                    script="latin",
                    is_mixed=False
                )
        
        if tamil_matches == max_matches:
            return LanguageDetectionResult(
                language=Language.TAMIL,
                confidence=min(0.75, 0.3 + tamil_matches * 0.15),
                script="latin",
                is_mixed=True
            )
        
        if telugu_matches == max_matches:
            return LanguageDetectionResult(
                language=Language.TELUGU,
                confidence=min(0.75, 0.3 + telugu_matches * 0.15),
                script="latin",
                is_mixed=True
            )
        
        return None
    
    def _is_english_word(self, word: str) -> bool:
        """Check if a word is likely English."""
        # Simple heuristic - common English words
        common_english = {
            'the', 'is', 'are', 'was', 'were', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'can', 'may', 'might', 'must', 'shall',
            'i', 'you', 'he', 'she', 'it', 'we', 'they',
            'my', 'your', 'his', 'her', 'its', 'our', 'their',
            'this', 'that', 'these', 'those',
            'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why', 'how',
            'a', 'an', 'the', 'and', 'but', 'or', 'not', 'no', 'yes',
            'for', 'to', 'from', 'with', 'about', 'of', 'in', 'on', 'at',
            'please', 'thanks', 'thank', 'hello', 'hi', 'bye', 'okay', 'ok',
            'price', 'cost', 'book', 'booking', 'time', 'date', 'day',
            'service', 'product', 'order', 'delivery', 'address', 'location'
        }
        return word.lower() in common_english


# =============================================================================
# LANGUAGE-AWARE PROMPTS
# =============================================================================

LANGUAGE_INSTRUCTIONS = {
    Language.ENGLISH: "Respond in clear, simple English suitable for Indian customers.",
    Language.HINDI: "Respond in Hindi using Devanagari script (हिंदी में जवाब दें).",
    Language.HINGLISH: "Respond in Hinglish - mix of Hindi and English in Roman script (like 'Aap ka order ready hai, delivery 30 mins mein').",
    Language.TAMIL: "Respond in Tamil script or Roman Tamil as appropriate.",
    Language.TELUGU: "Respond in Telugu script or Roman Telugu as appropriate.",
    Language.KANNADA: "Respond in Kannada script or Roman Kannada as appropriate.",
    Language.MALAYALAM: "Respond in Malayalam script or Roman Malayalam as appropriate.",
    Language.BENGALI: "Respond in Bengali script or Roman Bengali as appropriate.",
    Language.MARATHI: "Respond in Marathi using Devanagari script.",
    Language.GUJARATI: "Respond in Gujarati script.",
    Language.PUNJABI: "Respond in Punjabi using Gurmukhi or Roman script.",
    Language.ODIA: "Respond in Odia script.",
}


def get_language_instruction(language: Language) -> str:
    """Get prompt instruction for responding in a specific language."""
    return LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS[Language.ENGLISH])


# =============================================================================
# SINGLETON & CONVENIENCE
# =============================================================================

_detector: Optional[LanguageDetector] = None


def get_language_detector() -> LanguageDetector:
    """Get the global language detector instance."""
    global _detector
    if _detector is None:
        _detector = LanguageDetector()
    return _detector


def detect_language(text: str) -> LanguageDetectionResult:
    """Detect language from text."""
    return get_language_detector().detect(text)
