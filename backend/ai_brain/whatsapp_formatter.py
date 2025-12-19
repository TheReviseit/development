"""
WhatsApp message formatter for AI Brain.
Formats AI responses for optimal WhatsApp display.
"""

import re
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class FormattingRules:
    """Configurable formatting rules for WhatsApp."""
    max_chars: int = 500
    max_lines: int = 15
    max_bullets: int = 5
    max_emojis: int = 3
    split_threshold: int = 800
    sentence_limit: int = 4


DEFAULT_RULES = FormattingRules()


class WhatsAppFormatter:
    """
    Formats AI responses for optimal WhatsApp display.
    
    WhatsApp best practices:
    - Short messages (under 500 chars ideal)
    - Bullet points for lists
    - Emojis used sparingly (1-3 per message)
    - Line breaks for readability
    - No markdown (WhatsApp has limited support)
    """
    
    def __init__(self, rules: FormattingRules = None):
        self.rules = rules or DEFAULT_RULES
    
    def format(self, text: str) -> str:
        """
        Format text for WhatsApp display.
        
        Args:
            text: Raw text to format
            
        Returns:
            WhatsApp-optimized text
        """
        if not text:
            return ""
        
        # Apply formatting steps
        text = self._normalize_whitespace(text)
        text = self._format_lists(text)
        text = self._limit_length(text)
        text = self._limit_emojis(text)
        text = self._add_line_breaks(text)
        
        return text.strip()
    
    def format_list(self, items: List[str], title: str = None) -> str:
        """
        Format a list of items for WhatsApp.
        
        Args:
            items: List of items
            title: Optional title
            
        Returns:
            Formatted list string
        """
        lines = []
        
        if title:
            lines.append(f"{title}\n")
        
        # Limit items
        items = items[:self.rules.max_bullets]
        
        for item in items:
            # Clean and truncate each item
            item = item.strip()
            if len(item) > 80:
                item = item[:77] + "..."
            lines.append(f"• {item}")
        
        return "\n".join(lines)
    
    def format_price_list(
        self,
        products: List[dict],
        title: str = "Our prices:"
    ) -> str:
        """
        Format a price list for WhatsApp.
        
        Args:
            products: List of products with name/price
            title: List title
            
        Returns:
            Formatted price list
        """
        lines = [f"{title} 💰\n"]
        
        for p in products[:self.rules.max_bullets]:
            name = p.get("name", "")
            price = p.get("price")
            unit = p.get("price_unit", "")
            
            if price:
                price_str = f"₹{price}"
                if unit:
                    price_str += f" {unit}"
            else:
                price_str = "Price on request"
            
            lines.append(f"• {name}: {price_str}")
        
        return "\n".join(lines)
    
    def format_hours(self, timings: dict, title: str = "🕐 Our hours:") -> str:
        """Format business hours for WhatsApp."""
        lines = [f"{title}\n"]
        
        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        short_days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        
        for day, short in zip(days, short_days):
            timing = timings.get(day, {})
            if isinstance(timing, dict):
                if timing.get("is_closed"):
                    lines.append(f"• {short}: Closed")
                elif timing.get("open") and timing.get("close"):
                    lines.append(f"• {short}: {timing['open']}-{timing['close']}")
        
        return "\n".join(lines)
    
    def format_location(self, location: dict) -> str:
        """Format location for WhatsApp."""
        lines = ["📍 Find us here:\n"]
        
        if location.get("address"):
            lines.append(location["address"])
        
        if location.get("city"):
            city_line = location["city"]
            if location.get("pincode"):
                city_line += f" - {location['pincode']}"
            lines.append(city_line)
        
        if location.get("landmarks"):
            landmarks = location["landmarks"]
            if isinstance(landmarks, list):
                lines.append(f"\n🏢 Near: {', '.join(landmarks[:3])}")
        
        if location.get("google_maps_link"):
            lines.append(f"\n🗺️ Maps: {location['google_maps_link']}")
        
        return "\n".join(lines)
    
    def format_booking_confirmation(self, booking: dict) -> str:
        """Format booking confirmation for WhatsApp."""
        lines = ["✅ Booking Confirmed!\n"]
        
        if booking.get("date"):
            lines.append(f"📅 Date: {booking['date']}")
        if booking.get("time"):
            lines.append(f"⏰ Time: {booking['time']}")
        if booking.get("service"):
            lines.append(f"💇 Service: {booking['service']}")
        if booking.get("customer_name"):
            lines.append(f"👤 Name: {booking['customer_name']}")
        
        lines.append("\nSee you soon! 😊")
        
        return "\n".join(lines)
    
    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================
    
    def _normalize_whitespace(self, text: str) -> str:
        """Normalize whitespace in text."""
        # Replace multiple spaces with single space
        text = re.sub(r' +', ' ', text)
        # Replace multiple newlines with double newline
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()
    
    def _format_lists(self, text: str) -> str:
        """Ensure consistent list formatting."""
        # Convert various list markers to bullet points
        text = re.sub(r'^[-*]\s+', '• ', text, flags=re.MULTILINE)
        text = re.sub(r'^\d+\.\s+', '• ', text, flags=re.MULTILINE)
        return text
    
    def _limit_length(self, text: str) -> str:
        """Limit text length for WhatsApp."""
        if len(text) <= self.rules.max_chars:
            return text
        
        # Try to cut at sentence boundary
        sentences = text.split('. ')
        result = ""
        
        for i, sentence in enumerate(sentences):
            if len(result) + len(sentence) + 2 <= self.rules.max_chars:
                if result:
                    result += ". " + sentence
                else:
                    result = sentence
            else:
                break
        
        # Add period if needed
        if result and not result.endswith(('.', '!', '?')):
            result += "."
        
        # Add ellipsis if truncated
        if len(result) < len(text) - 10:
            result = result.rstrip('.') + "..."
        
        return result or text[:self.rules.max_chars - 3] + "..."
    
    def _limit_emojis(self, text: str) -> str:
        """Limit number of emojis in text."""
        # Find all emojis
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map
            "\U0001F1E0-\U0001F1FF"  # flags
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "]+",
            flags=re.UNICODE
        )
        
        emojis = emoji_pattern.findall(text)
        
        if len(emojis) <= self.rules.max_emojis:
            return text
        
        # Remove excess emojis (keep first N)
        count = 0
        result = []
        for char in text:
            is_emoji = bool(emoji_pattern.match(char))
            if is_emoji:
                if count < self.rules.max_emojis:
                    result.append(char)
                    count += 1
            else:
                result.append(char)
        
        return ''.join(result)
    
    def _add_line_breaks(self, text: str) -> str:
        """Add line breaks for readability."""
        # Ensure newline after colons followed by lists
        text = re.sub(r':\s*•', ':\n•', text)
        
        # Add break before CTAs at end
        cta_patterns = [
            r'Would you like',
            r'Can I help',
            r'Let me know',
            r'Feel free to',
        ]
        for pattern in cta_patterns:
            text = re.sub(f'(?<!\n)({pattern})', r'\n\1', text)
        
        return text
    
    def split_long_message(self, text: str) -> List[str]:
        """
        Split a long message into multiple WhatsApp-sized chunks.
        
        Args:
            text: Long text to split
            
        Returns:
            List of message chunks
        """
        if len(text) <= self.rules.split_threshold:
            return [text]
        
        chunks = []
        current_chunk = ""
        
        paragraphs = text.split('\n\n')
        
        for para in paragraphs:
            if len(current_chunk) + len(para) + 2 <= self.rules.split_threshold:
                if current_chunk:
                    current_chunk += "\n\n" + para
                else:
                    current_chunk = para
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = para
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

_formatter: Optional[WhatsAppFormatter] = None


def get_formatter() -> WhatsAppFormatter:
    """Get the global formatter instance."""
    global _formatter
    if _formatter is None:
        _formatter = WhatsAppFormatter()
    return _formatter


def format_for_whatsapp(text: str) -> str:
    """Format text for WhatsApp display."""
    return get_formatter().format(text)


def split_message(text: str) -> List[str]:
    """Split long text into WhatsApp-sized chunks."""
    return get_formatter().split_long_message(text)
