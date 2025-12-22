"""
Pydantic schemas for business data validation.
Defines the expected structure of business profile data from the database.
"""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from datetime import time
from enum import Enum


class Industry(str, Enum):
    """Supported business industry types."""
    SALON = "salon"
    CLINIC = "clinic"
    RESTAURANT = "restaurant"
    REAL_ESTATE = "real_estate"
    COACHING = "coaching"
    RETAIL = "retail"
    FITNESS = "fitness"
    EDUCATION = "education"
    HEALTHCARE = "healthcare"
    OTHER = "other"


class ContactInfo(BaseModel):
    """Business contact information."""
    phone: Optional[str] = None
    email: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None


class LocationInfo(BaseModel):
    """Business location details."""
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    google_maps_link: Optional[str] = None
    landmarks: List[str] = Field(default_factory=list)


class DayTiming(BaseModel):
    """Operating hours for a single day."""
    open: Optional[str] = None  # Format: "HH:MM"
    close: Optional[str] = None  # Format: "HH:MM"
    is_closed: bool = False


class BusinessTimings(BaseModel):
    """Weekly operating hours."""
    monday: Optional[DayTiming] = None
    tuesday: Optional[DayTiming] = None
    wednesday: Optional[DayTiming] = None
    thursday: Optional[DayTiming] = None
    friday: Optional[DayTiming] = None
    saturday: Optional[DayTiming] = None
    sunday: Optional[DayTiming] = None
    holidays: List[str] = Field(default_factory=list)
    special_notes: Optional[str] = None


class ProductService(BaseModel):
    """Product or service offering."""
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    price_unit: Optional[str] = None  # "per session", "per kg", etc.
    duration: Optional[str] = None  # For services
    available: bool = True


class BusinessPolicies(BaseModel):
    """Business policies and rules."""
    refund: Optional[str] = None
    cancellation: Optional[str] = None
    delivery: Optional[str] = None
    payment_methods: List[str] = Field(default_factory=list)
    booking_advance_days: Optional[int] = None


class FAQ(BaseModel):
    """Frequently asked question."""
    question: str
    answer: str


class BrandVoice(BaseModel):
    """Brand tone and communication preferences."""
    tone: str = "friendly"  # friendly, professional, casual
    language_preference: str = "en"  # en, hi, hinglish
    greeting_style: Optional[str] = None


class BusinessData(BaseModel):
    """
    Complete business profile schema.
    This is the main data structure that must be provided to the AI Brain.
    """
    model_config = {"use_enum_values": True}
    
    business_id: str
    business_name: str
    industry: str = "other"
    description: Optional[str] = None
    
    contact: ContactInfo = Field(default_factory=ContactInfo)
    location: LocationInfo = Field(default_factory=LocationInfo)
    timings: BusinessTimings = Field(default_factory=BusinessTimings)
    
    products_services: List[ProductService] = Field(default_factory=list)
    policies: BusinessPolicies = Field(default_factory=BusinessPolicies)
    faqs: List[FAQ] = Field(default_factory=list)
    
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    brand_voice: BrandVoice = Field(default_factory=BrandVoice)
    
    def get_timing_for_day(self, day: str) -> Optional[DayTiming]:
        """Get timing for a specific day."""
        return getattr(self.timings, day.lower(), None)
    
    def get_products_by_category(self, category: str) -> List[ProductService]:
        """Get products/services filtered by category."""
        return [p for p in self.products_services if p.category == category]
    
    def find_product_by_name(self, name: str) -> Optional[ProductService]:
        """Find a product/service by name (case-insensitive partial match)."""
        name_lower = name.lower()
        for product in self.products_services:
            if name_lower in product.name.lower():
                return product
        return None
    
    def to_context_string(self, max_tokens: int = 1200) -> str:
        """Convert business data to a context string for LLM."""
        parts = [
            f"Business: {self.business_name}",
            f"Industry: {self.industry}",
        ]
        
        if self.description:
            parts.append(f"About: {self.description}")
        
        # Contact info - include all available contact methods
        contact_parts = []
        if self.contact.phone:
            contact_parts.append(f"Phone: {self.contact.phone}")
        if self.contact.whatsapp and self.contact.whatsapp != self.contact.phone:
            contact_parts.append(f"WhatsApp: {self.contact.whatsapp}")
        if self.contact.email:
            contact_parts.append(f"Email: {self.contact.email}")
        if self.contact.website:
            contact_parts.append(f"Website: {self.contact.website}")
        
        if contact_parts:
            parts.append("\nContact Information:")
            parts.extend(contact_parts)
        
        # Location
        if self.location.address:
            loc = f"{self.location.address}"
            if self.location.city:
                loc += f", {self.location.city}"
            parts.append(f"Location: {loc}")
            if self.location.google_maps_link:
                parts.append(f"Maps: {self.location.google_maps_link}")
        
        # Products/Services (top items)
        if self.products_services:
            parts.append("\nProducts/Services:")
            for p in self.products_services[:10]:  # Limit to 10
                price_str = f"₹{p.price}" if p.price else "Price on request"
                if p.price_unit:
                    price_str += f" {p.price_unit}"
                parts.append(f"- {p.name}: {price_str}")
        
        # Timings summary
        parts.append("\nTimings:")
        for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
            timing = self.get_timing_for_day(day)
            if timing and not timing.is_closed:
                parts.append(f"- {day.capitalize()}: {timing.open} - {timing.close}")
            elif timing and timing.is_closed:
                parts.append(f"- {day.capitalize()}: Closed")
        
        # Policies
        if self.policies.payment_methods:
            parts.append(f"\nPayment: {', '.join(self.policies.payment_methods)}")
        if self.policies.refund:
            parts.append(f"Refund: {self.policies.refund}")
        if self.policies.cancellation:
            parts.append(f"Cancellation: {self.policies.cancellation}")
        
        # FAQs
        if self.faqs:
            parts.append("\nFAQs:")
            for faq in self.faqs[:5]:  # Limit to 5
                parts.append(f"Q: {faq.question}")
                parts.append(f"A: {faq.answer}")
        
        return "\n".join(parts)


class ConversationMessage(BaseModel):
    """A single message in conversation history."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: Optional[str] = None


class GenerateReplyResponse(BaseModel):
    """Response structure from generate_reply."""
    reply: str
    intent: str
    confidence: float
    needs_human: bool = False
    suggested_actions: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
