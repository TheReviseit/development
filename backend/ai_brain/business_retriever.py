"""
Business Data Retriever for AI Brain v2.0.
Reduces token usage by retrieving only relevant business data snippets
instead of sending full profiles (25-45% token savings).
"""

import re
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass


@dataclass
class RetrievalResult:
    """Result from business data retrieval."""
    context: str                    # Relevant context string
    sources: List[str]              # Which data sources were used
    token_estimate: int             # Estimated tokens
    full_data_tokens: int           # What full data would cost
    savings_percent: float          # Token savings achieved


class BusinessRetriever:
    """
    Smart retriever that extracts only relevant business data.
    
    Instead of sending 800-1200 tokens of full business data,
    retrieves only the 50-200 tokens relevant to the query.
    
    Strategies:
    1. Intent-based extraction: Only get data relevant to detected intent
    2. Keyword matching: Extract products/services mentioned
    3. Token budgeting: Stay within token limits
    """
    
    def __init__(self, max_tokens: int = 400):
        """
        Initialize retriever.
        
        Args:
            max_tokens: Maximum tokens for retrieved context
        """
        self.max_tokens = max_tokens
    
    def retrieve(
        self,
        business_data: Dict[str, Any],
        intent: str,
        message: str,
        entities: Dict[str, Any] = None
    ) -> RetrievalResult:
        """
        Retrieve relevant business data based on query context.
        
        Args:
            business_data: Full business profile
            intent: Detected intent
            message: User's message
            entities: Extracted entities (product names, etc.)
            
        Returns:
            RetrievalResult with optimized context
        """
        # Estimate full data cost
        full_context = self._format_full_data(business_data)
        full_tokens = len(full_context) // 4  # Rough token estimate
        
        # Route to intent-specific retriever
        if intent == "pricing":
            context, sources = self._retrieve_pricing(
                business_data, message, entities
            )
        elif intent == "booking":
            context, sources = self._retrieve_booking(
                business_data, message, entities
            )
        elif intent == "hours":
            context, sources = self._retrieve_hours(business_data)
        elif intent == "location":
            context, sources = self._retrieve_location(business_data)
        elif intent in ["greeting", "thank_you", "goodbye"]:
            context, sources = self._retrieve_minimal(business_data)
        elif intent == "general_enquiry":
            context, sources = self._retrieve_general(
                business_data, message, entities
            )
        else:
            # Unknown or complex - return more context
            context, sources = self._retrieve_comprehensive(
                business_data, message
            )
        
        # Enforce token limit
        if len(context) // 4 > self.max_tokens:
            context = self._truncate_to_tokens(context, self.max_tokens)
        
        token_estimate = len(context) // 4
        savings = ((full_tokens - token_estimate) / full_tokens * 100) if full_tokens > 0 else 0
        
        return RetrievalResult(
            context=context,
            sources=sources,
            token_estimate=token_estimate,
            full_data_tokens=full_tokens,
            savings_percent=round(savings, 1)
        )
    
    def _retrieve_pricing(
        self,
        data: Dict[str, Any],
        message: str,
        entities: Dict[str, Any] = None
    ) -> Tuple[str, List[str]]:
        """Retrieve pricing-relevant data."""
        parts = [f"Business: {data.get('business_name', 'N/A')}"]
        sources = ["business_name"]
        
        products = data.get("products_services", [])
        if not products:
            parts.append("No products/services listed.")
            return "\n".join(parts), sources
        
        # Extract product name from message or entities
        query_terms = self._extract_query_terms(message, entities)
        
        # Find matching products
        matched = []
        for p in products:
            name = p.get("name", "").lower()
            # Check if any query term matches
            if any(term in name or name in term for term in query_terms):
                matched.append(p)
        
        # If no matches, return top 5 products
        if not matched:
            matched = products[:5]
        else:
            matched = matched[:5]  # Limit matches
        
        # Format products
        parts.append("\nProducts/Services:")
        for p in matched:
            name = p.get("name", "")
            price = p.get("price")
            price_str = f"₹{price}" if price else "Price on request"
            unit = p.get("price_unit", "")
            if unit:
                price_str += f" {unit}"
            parts.append(f"- {name}: {price_str}")
        
        sources.append("products_services")
        
        # Add payment methods if available
        policies = data.get("policies", {})
        payment = policies.get("payment_methods", [])
        if payment:
            parts.append(f"\nPayment: {', '.join(payment)}")
            sources.append("payment_methods")
        
        return "\n".join(parts), sources
    
    def _retrieve_booking(
        self,
        data: Dict[str, Any],
        message: str,
        entities: Dict[str, Any] = None
    ) -> Tuple[str, List[str]]:
        """Retrieve booking-relevant data."""
        parts = [f"Business: {data.get('business_name', 'N/A')}"]
        sources = ["business_name"]
        
        # Get timings for availability context
        timings = data.get("timings", {})
        if timings:
            parts.append("\nOperating Hours:")
            for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
                timing = timings.get(day, {})
                if isinstance(timing, dict):
                    if timing.get("is_closed"):
                        parts.append(f"- {day.capitalize()}: Closed")
                    elif timing.get("open") and timing.get("close"):
                        parts.append(f"- {day.capitalize()}: {timing['open']}-{timing['close']}")
            sources.append("timings")
        
        # Get relevant service if mentioned
        query_terms = self._extract_query_terms(message, entities)
        products = data.get("products_services", [])
        
        matched = []
        for p in products:
            name = p.get("name", "").lower()
            if any(term in name for term in query_terms):
                matched.append(p)
        
        if matched:
            parts.append("\nServices available:")
            for p in matched[:3]:
                duration = p.get("duration", "")
                dur_str = f" ({duration})" if duration else ""
                parts.append(f"- {p.get('name', '')}{dur_str}")
            sources.append("products_services")
        
        # Booking policy
        policies = data.get("policies", {})
        if policies.get("booking_advance_days"):
            parts.append(f"\nBooking: Up to {policies['booking_advance_days']} days in advance")
        if policies.get("cancellation"):
            parts.append(f"Cancellation: {policies['cancellation'][:100]}")
            sources.append("policies")
        
        # Contact for confirmation
        contact = data.get("contact", {})
        if contact.get("phone") or contact.get("whatsapp"):
            parts.append(f"\nContact: {contact.get('phone') or contact.get('whatsapp')}")
            sources.append("contact")
        
        return "\n".join(parts), sources
    
    def _retrieve_hours(self, data: Dict[str, Any]) -> Tuple[str, List[str]]:
        """Retrieve operating hours data."""
        parts = [f"Business: {data.get('business_name', 'N/A')}"]
        sources = ["business_name"]
        
        timings = data.get("timings", {})
        if timings:
            parts.append("\nOperating Hours:")
            for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
                timing = timings.get(day, {})
                if isinstance(timing, dict):
                    if timing.get("is_closed"):
                        parts.append(f"- {day.capitalize()}: Closed")
                    elif timing.get("open") and timing.get("close"):
                        parts.append(f"- {day.capitalize()}: {timing['open']}-{timing['close']}")
            
            special = timings.get("special_notes")
            if special:
                parts.append(f"\nNote: {special[:100]}")
            
            holidays = timings.get("holidays", [])
            if holidays:
                parts.append(f"Holidays: {', '.join(holidays[:3])}")
            
            sources.append("timings")
        else:
            parts.append("Operating hours not available.")
        
        return "\n".join(parts), sources
    
    def _retrieve_location(self, data: Dict[str, Any]) -> Tuple[str, List[str]]:
        """Retrieve location data."""
        parts = [f"Business: {data.get('business_name', 'N/A')}"]
        sources = ["business_name"]
        
        location = data.get("location", {})
        if location:
            if location.get("address"):
                parts.append(f"\nAddress: {location['address']}")
            if location.get("city"):
                city_line = location["city"]
                if location.get("state"):
                    city_line += f", {location['state']}"
                if location.get("pincode"):
                    city_line += f" - {location['pincode']}"
                parts.append(city_line)
            if location.get("landmarks"):
                parts.append(f"Landmarks: {', '.join(location['landmarks'][:3])}")
            if location.get("google_maps_link"):
                parts.append(f"Maps: {location['google_maps_link']}")
            sources.append("location")
        else:
            parts.append("Location details not available.")
        
        # Contact
        contact = data.get("contact", {})
        if contact.get("phone"):
            parts.append(f"\nPhone: {contact['phone']}")
            sources.append("contact")
        
        return "\n".join(parts), sources
    
    def _retrieve_minimal(self, data: Dict[str, Any]) -> Tuple[str, List[str]]:
        """Retrieve minimal data for simple intents."""
        parts = [
            f"Business: {data.get('business_name', 'N/A')}",
            f"Industry: {data.get('industry', 'other')}"
        ]
        return "\n".join(parts), ["business_name", "industry"]
    
    def _retrieve_general(
        self,
        data: Dict[str, Any],
        message: str,
        entities: Dict[str, Any] = None
    ) -> Tuple[str, List[str]]:
        """Retrieve general enquiry data."""
        parts = [
            f"Business: {data.get('business_name', 'N/A')}",
            f"Industry: {data.get('industry', 'other')}"
        ]
        sources = ["business_name", "industry"]
        
        if data.get("description"):
            parts.append(f"About: {data['description'][:200]}")
            sources.append("description")
        
        # Get relevant products
        query_terms = self._extract_query_terms(message, entities)
        products = data.get("products_services", [])
        
        if query_terms:
            matched = []
            for p in products:
                name = p.get("name", "").lower()
                desc = p.get("description", "").lower()
                if any(term in name or term in desc for term in query_terms):
                    matched.append(p)
            products = matched[:5] if matched else products[:5]
        else:
            products = products[:5]
        
        if products:
            parts.append("\nServices/Products:")
            for p in products:
                price = p.get("price")
                price_str = f" - ₹{price}" if price else ""
                parts.append(f"- {p.get('name', '')}{price_str}")
            sources.append("products_services")
        
        # FAQs
        faqs = data.get("faqs", [])
        if faqs and query_terms:
            # Find relevant FAQ
            for faq in faqs[:3]:
                q = faq.get("question", "").lower()
                if any(term in q for term in query_terms):
                    parts.append(f"\nFAQ: {faq.get('question', '')}")
                    parts.append(f"A: {faq.get('answer', '')[:150]}")
                    sources.append("faqs")
                    break
        
        return "\n".join(parts), sources
    
    def _retrieve_comprehensive(
        self,
        data: Dict[str, Any],
        message: str
    ) -> Tuple[str, List[str]]:
        """Retrieve comprehensive data for complex/unknown queries."""
        parts = [
            f"Business: {data.get('business_name', 'N/A')}",
            f"Industry: {data.get('industry', 'other')}"
        ]
        sources = ["business_name", "industry"]
        
        if data.get("description"):
            parts.append(f"About: {data['description'][:150]}")
            sources.append("description")
        
        # Contact
        contact = data.get("contact", {})
        if contact.get("phone"):
            parts.append(f"Phone: {contact['phone']}")
            sources.append("contact")
        
        # Products (summarized)
        products = data.get("products_services", [])
        if products:
            parts.append(f"\n{len(products)} products/services available")
            for p in products[:3]:
                parts.append(f"- {p.get('name', '')}")
            sources.append("products_services")
        
        # Location summary
        location = data.get("location", {})
        if location.get("city"):
            parts.append(f"\nLocation: {location['city']}")
            sources.append("location")
        
        return "\n".join(parts), sources
    
    def _extract_query_terms(
        self,
        message: str,
        entities: Dict[str, Any] = None
    ) -> List[str]:
        """Extract searchable terms from message and entities."""
        terms = []
        
        # From entities
        if entities:
            if entities.get("product"):
                terms.append(entities["product"].lower())
            if entities.get("service"):
                terms.append(entities["service"].lower())
        
        # From message - extract nouns/keywords
        message_lower = message.lower()
        
        # Remove common words
        stopwords = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'what', 'how', 
            'much', 'does', 'do', 'for', 'of', 'and', 'or', 'to', 'in',
            'your', 'you', 'me', 'my', 'i', 'we', 'please', 'can', 'could',
            'price', 'cost', 'rate', 'book', 'booking', 'appointment'
        }
        
        words = re.findall(r'\b[a-z]{3,}\b', message_lower)
        terms.extend([w for w in words if w not in stopwords])
        
        return list(set(terms))
    
    def _format_full_data(self, data: Dict[str, Any]) -> str:
        """Format full business data (for comparison)."""
        # Import the existing formatter
        from .prompts import format_business_data_for_prompt
        return format_business_data_for_prompt(data)
    
    def _truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to approximate token count."""
        max_chars = max_tokens * 4
        if len(text) <= max_chars:
            return text
        
        # Cut at line boundary
        lines = text[:max_chars].split('\n')
        return '\n'.join(lines[:-1]) + '\n...'


# =============================================================================
# SINGLETON
# =============================================================================

_retriever: Optional[BusinessRetriever] = None


def get_retriever(max_tokens: int = 400) -> BusinessRetriever:
    """Get the global business retriever."""
    global _retriever
    if _retriever is None:
        _retriever = BusinessRetriever(max_tokens)
    return _retriever
