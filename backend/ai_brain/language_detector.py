"""
Language detection and routing for AI Brain.
Supports multiple Indian languages and Hinglish.

v2.0: Added Roman-script detection for Gujarati, Bengali, Marathi, Punjabi, Urdu.
      Improved code-switching confidence for Hinglish.
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
    URDU = "ur"
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

# Common Gujarati words in Roman script (NEW v2.0)
GUJARATI_INDICATORS = [
    r'\b(kem|cho|saru|barabar|nathi|aavjo|aavje)\b',
    r'\b(aabhar|dhanyavaad|bhav|shu|chal|che)\b',
    r'\b(tamari|dukan|kyaa|kyare|khule|bandh)\b',
]

# Common Bengali words in Roman script (NEW v2.0)
BENGALI_INDICATORS = [
    r'\b(kemon|acho|bhalo|dokan|kothay|din)\b',
    r'\b(dhonnobad|nomoshkar|ki|khobor|thik|ache|besh)\b',
    r'\b(kokhon|bondho|somoy|koto|dam)\b',
]

# Common Marathi words in Roman script (NEW v2.0)
MARATHI_INDICATORS = [
    r'\b(kasa|ahe|kay|challay|barobar|chhan)\b',
    r'\b(dhanyawad|aabhari|yeto|punha|bhetuyaa)\b',
    r'\b(mala|pahije|sangaa|namaskar)\b',
]

# Common Punjabi words in Roman script (NEW v2.0)
PUNJABI_INDICATORS = [
    r'\b(kiddan|ki|haal|sat|sri|akal|rabb|rakha)\b',
    r'\b(dhanvaad|shukriya|phir|milange|theek)\b',
    r'\b(kinne|paisa|kithe|kiven|changa)\b',
]

# Common Urdu words in Roman script (NEW v2.0)
URDU_INDICATORS = [
    r'\b(shukriya|khuda|hafiz|allah|adaab|salam)\b',
    r'\b(meherbani|kya|haal|kaisa|batao|zaroor)\b',
    r'\b(aap|janab|sahab|bibi|inshallah|mashallah)\b',
]


class LanguageDetector:
    """
    Detects language from text.

    v2.0: Supports detection of all major Indian languages in Roman script:
    - Hindi/Hinglish
    - Tamil, Telugu
    - Gujarati, Bengali, Marathi, Punjabi, Urdu
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
        self._gujarati_patterns = [
            re.compile(p, re.IGNORECASE) for p in GUJARATI_INDICATORS
        ]
        self._bengali_patterns = [
            re.compile(p, re.IGNORECASE) for p in BENGALI_INDICATORS
        ]
        self._marathi_patterns = [
            re.compile(p, re.IGNORECASE) for p in MARATHI_INDICATORS
        ]
        self._punjabi_patterns = [
            re.compile(p, re.IGNORECASE) for p in PUNJABI_INDICATORS
        ]
        self._urdu_patterns = [
            re.compile(p, re.IGNORECASE) for p in URDU_INDICATORS
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

        # Count new language indicators (v2.0)
        gujarati_matches = sum(
            1 for pattern in self._gujarati_patterns
            if pattern.search(text_lower)
        )
        bengali_matches = sum(
            1 for pattern in self._bengali_patterns
            if pattern.search(text_lower)
        )
        marathi_matches = sum(
            1 for pattern in self._marathi_patterns
            if pattern.search(text_lower)
        )
        punjabi_matches = sum(
            1 for pattern in self._punjabi_patterns
            if pattern.search(text_lower)
        )
        urdu_matches = sum(
            1 for pattern in self._urdu_patterns
            if pattern.search(text_lower)
        )

        # Determine best language match
        all_scores = {
            'hinglish': hinglish_matches,
            'tamil': tamil_matches,
            'telugu': telugu_matches,
            'gujarati': gujarati_matches,
            'bengali': bengali_matches,
            'marathi': marathi_matches,
            'punjabi': punjabi_matches,
            'urdu': urdu_matches,
        }
        max_lang = max(all_scores, key=all_scores.get)
        max_matches = all_scores[max_lang]

        if max_matches == 0:
            return None

        # Language mapping
        lang_map = {
            'hinglish': None,  # Special handling below
            'tamil': Language.TAMIL,
            'telugu': Language.TELUGU,
            'gujarati': Language.GUJARATI,
            'bengali': Language.BENGALI,
            'marathi': Language.MARATHI,
            'punjabi': Language.PUNJABI,
            'urdu': Language.URDU,
        }

        # Hinglish/Hindi gets special treatment
        if max_lang == 'hinglish':
            english_words = sum(1 for w in words if self._is_english_word(w))

            if english_words > total_words * 0.3:
                # Code-mixed Hinglish — improved confidence scoring
                # More matches = higher confidence (reward strong signals)
                match_density = hinglish_matches / max(total_words, 1)
                confidence = min(0.90, 0.45 + match_density * 0.5 + hinglish_matches * 0.08)
                return LanguageDetectionResult(
                    language=Language.HINGLISH,
                    confidence=confidence,
                    script="latin",
                    is_mixed=True
                )
            else:
                return LanguageDetectionResult(
                    language=Language.HINDI,
                    confidence=min(0.75, 0.3 + hinglish_matches * 0.1),
                    script="latin",
                    is_mixed=False
                )

        # All other languages
        language = lang_map.get(max_lang)
        if language:
            return LanguageDetectionResult(
                language=language,
                confidence=min(0.80, 0.3 + max_matches * 0.15),
                script="latin",
                is_mixed=True  # Roman script Indian = always mixed context
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
    Language.HINDI: "Respond in Hindi using Devanagari script.",
    Language.HINGLISH: "Respond in Hinglish - mix of Hindi and English in Roman script.",
    Language.TAMIL: "Respond in Tamil script or Roman Tamil as appropriate.",
    Language.TELUGU: "Respond in Telugu script or Roman Telugu as appropriate.",
    Language.KANNADA: "Respond in Kannada script or Roman Kannada as appropriate.",
    Language.MALAYALAM: "Respond in Malayalam script or Roman Malayalam as appropriate.",
    Language.BENGALI: "Respond in Bengali script or Roman Bengali as appropriate.",
    Language.GUJARATI: "Respond in Gujarati script or Roman Gujarati as appropriate.",
    Language.PUNJABI: "Respond in Punjabi script or Roman Punjabi as appropriate.",
    Language.MARATHI: "Respond in Marathi script or Roman Marathi as appropriate.",
    Language.URDU: "Respond in Urdu — Roman script preferred (WhatsApp style).",
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
