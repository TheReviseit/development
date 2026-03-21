"""
Industry-specific response templates.
Provides tailored greetings, CTAs, and response formats for different business types.
"""

from typing import Dict, Any


# Industry-specific templates with greetings, CTAs, and response styles
INDUSTRY_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "salon": {
        "emoji": "💇",
        "greeting": "Welcome to {name}! 💇 How can we help you look amazing today?",
        "booking_cta": "Would you like to book an appointment? Just share your preferred date and time!",
        "price_response": "Here are our services and prices:",
        "closing": "Thank you for choosing {name}! See you soon! ✨",
        "keywords": ["haircut", "styling", "spa", "facial", "manicure", "pedicure", "makeup"],
    },
    "clinic": {
        "emoji": "🏥",
        "greeting": "Hello! Welcome to {name}. 🏥 How can we assist you with your health needs today?",
        "booking_cta": "Would you like to schedule an appointment with our doctor? Please share your preferred timing.",
        "price_response": "Here are our consultation fees and services:",
        "closing": "Wishing you good health! Feel free to reach out if you have any questions. 🙏",
        "keywords": ["doctor", "appointment", "checkup", "test", "consultation", "treatment"],
    },
    "restaurant": {
        "emoji": "🍽️",
        "greeting": "Namaste! 🍽️ Welcome to {name}. What would you like to order today?",
        "booking_cta": "Would you like to reserve a table? Please share the date, time, and number of guests.",
        "price_response": "Here's our menu:",
        "closing": "Thank you for ordering with us! Enjoy your meal! 😋",
        "keywords": ["food", "order", "menu", "delivery", "table", "reservation", "dine"],
    },
    "real_estate": {
        "emoji": "🏠",
        "greeting": "Hello! 🏠 Welcome to {name}. Looking for your dream property?",
        "booking_cta": "Would you like to schedule a property visit? Share your preferred date and time.",
        "price_response": "Here are some properties that might interest you:",
        "closing": "Happy house hunting! We're here to help you find your perfect home. 🔑",
        "keywords": ["property", "flat", "apartment", "house", "rent", "buy", "sell", "bhk"],
    },
    "coaching": {
        "emoji": "📚",
        "greeting": "Hello! 📚 Welcome to {name}. How can we help you in your learning journey?",
        "booking_cta": "Would you like to enroll in a course or schedule a demo class?",
        "price_response": "Here are our courses and fee structure:",
        "closing": "All the best for your learning! We're here to support you. 🌟",
        "keywords": ["class", "course", "tuition", "batch", "exam", "study", "learn"],
    },
    "fitness": {
        "emoji": "💪",
        "greeting": "Hey there! 💪 Welcome to {name}. Ready to start your fitness journey?",
        "booking_cta": "Would you like to book a trial session or join our membership?",
        "price_response": "Here are our membership plans:",
        "closing": "Stay fit, stay healthy! See you at the gym! 🏋️",
        "keywords": ["gym", "workout", "trainer", "membership", "yoga", "fitness"],
    },
    "retail": {
        "emoji": "🛍️",
        "greeting": "Hello! 🛍️ Welcome to {name}. How can we help you shop today?",
        "booking_cta": "Would you like to place an order or visit our store?",
        "price_response": "Here are our products:",
        "closing": "Thank you for shopping with us! Happy to serve you again! 😊",
        "keywords": ["buy", "order", "product", "stock", "price", "available"],
    },
    "healthcare": {
        "emoji": "⚕️",
        "greeting": "Hello! ⚕️ Welcome to {name}. How can we help you today?",
        "booking_cta": "Would you like to book a consultation? Please share your preferred date and time.",
        "price_response": "Here are our services and fees:",
        "closing": "Wishing you good health! Take care! 🙏",
        "keywords": ["health", "doctor", "medicine", "test", "report", "pharmacy"],
    },
    "education": {
        "emoji": "🎓",
        "greeting": "Hello! 🎓 Welcome to {name}. How can we help with your educational needs?",
        "booking_cta": "Would you like to know about admissions or schedule a campus visit?",
        "price_response": "Here are our programs and fee structure:",
        "closing": "Best wishes for your educational journey! 📖",
        "keywords": ["admission", "course", "fee", "batch", "class", "certificate"],
    },
    "other": {
        "emoji": "👋",
        "greeting": "Hello! 👋 Welcome to {name}. How can we assist you today?",
        "booking_cta": "Would you like to schedule an appointment or learn more about our services?",
        "price_response": "Here are our services and pricing:",
        "closing": "Thank you for reaching out! We're happy to help. 😊",
        "keywords": [],
    },
}


# Response templates for different intents
INTENT_RESPONSE_TEMPLATES = {
    "greeting": {
        "default": "{greeting}",
        "with_name": "Hi {customer_name}! {greeting}",
    },
    "pricing": {
        "found": "{price_response}\n\n{product_list}\n\nWould you like to know more about any of these?",
        "not_found": "I don't have pricing information for that specific item. Let me connect you with our team who can help. Could you share your contact number?",
        "partial": "Here's what I found:\n{product_list}\n\nFor detailed pricing on other items, please contact us at {contact}.",
    },
    "booking": {
        "available": "Great! I can help you book an appointment. Please share:\n1. Your preferred date\n2. Preferred time\n3. Your name and phone number",
        "confirm": "Booking confirmed! ✅\n\n📅 Date: {date}\n⏰ Time: {time}\n📍 Location: {location}\n\nSee you soon!",
        "not_available": "I'm sorry, that slot isn't available. Would you like to try another time? Here are some available slots:\n{available_slots}",
    },
    "hours": {
        "open": "We're open! 🟢\n\n{timing_details}\n\nWould you like to visit us or book an appointment?",
        "closed": "We're currently closed. 🔴\n\nOur operating hours:\n{timing_details}\n\nFeel free to leave a message and we'll get back to you!",
        "schedule": "Our operating hours:\n\n{timing_details}",
    },
    "location": {
        "with_map": "📍 Here's how to find us:\n\n{address}\n\nGoogle Maps: {maps_link}\n\n{landmarks}",
        "without_map": "📍 Our address:\n\n{address}\n\nLandmarks: {landmarks}",
    },
    "complaint": {
        "acknowledge": "I'm really sorry to hear about this issue. 😔 Your feedback is important to us.\n\nCould you please share more details so we can resolve this quickly? Our team will get back to you within {sla} hours.",
        "escalate": "I understand your concern. Let me connect you with our support team right away. Someone will reach out to you shortly at {contact}.",
    },
    "lead_capture": {
        "request": "Great to hear you're interested! 🎉\n\nPlease share your:\n1. Name\n2. Phone number\n3. Preferred time for callback\n\nOur team will reach out to you soon!",
        "thanks": "Thank you for your interest! 🙏 Our team will contact you at {contact} within {timeframe}.",
    },
    "unknown": {
        "default": "I'm not sure I understood that. Could you please rephrase or choose from these options:\n\n1️⃣ Know our services\n2️⃣ Check prices\n3️⃣ Book appointment\n4️⃣ Our location\n5️⃣ Talk to human",
        "handoff": "I'll connect you with our team who can help better. Someone will respond shortly. 🙏",
    },
    "thank_you": {
        "default": "You're welcome! 😊 Is there anything else I can help you with?",
    },
    "goodbye": {
        "default": "{closing}\n\nFeel free to message us anytime! 👋",
    },
}


def get_industry_template(industry: str) -> Dict[str, Any]:
    """Get template for a specific industry, defaulting to 'other' if not found."""
    return INDUSTRY_TEMPLATES.get(industry.lower(), INDUSTRY_TEMPLATES["other"])


def get_intent_template(intent: str, variant: str = "default") -> str:
    """Get response template for an intent."""
    intent_templates = INTENT_RESPONSE_TEMPLATES.get(intent, INTENT_RESPONSE_TEMPLATES["unknown"])
    return intent_templates.get(variant, intent_templates.get("default", ""))


def format_template(template: str, **kwargs) -> str:
    """
    Format a template string with provided values.
    Missing values are replaced with empty strings.
    """
    try:
        return template.format(**{k: v or "" for k, v in kwargs.items()})
    except KeyError:
        # If some keys are missing, do partial formatting
        result = template
        for key, value in kwargs.items():
            result = result.replace(f"{{{key}}}", str(value) if value else "")
        return result


# =============================================================================
# BUSINESS-SPECIFIC TEMPLATES (per industry, per intent)
# =============================================================================

import random

BUSINESS_TEMPLATES = {
    "salon": {
        "greeting": [
            "Welcome to {business_name}! 💇 Ready for a fresh new look?",
            "Hi! 👋 Thanks for reaching out to {business_name}. How can we make you look amazing today?",
            "Hello! ✨ Welcome to {business_name}. Looking for a haircut, styling, or spa treatment?",
        ],
        "pricing": [
            "Here are our prices at {business_name}: 💰\n{product_list}\n\nWould you like to book?",
            "Our services and rates at {business_name}:\n{product_list}\n\nReady to schedule? 💇",
        ],
        "booking": [
            "Great choice! 💇 To book at {business_name}, please share:\n1. Your name\n2. Phone number\n3. Preferred date & time\n4. Service needed",
        ],
        "hours": [
            "Our timing at {business_name}:\n{timing_details}\n\nWould you like to book an appointment? 💇",
        ],
    },
    "restaurant": {
        "greeting": [
            "Namaste! 🍽️ Welcome to {business_name}. Hungry? Check out our menu!",
            "Hi there! 😋 Welcome to {business_name}. What would you like to order today?",
        ],
        "pricing": [
            "Here's our menu at {business_name}: 🍕\n{product_list}\n\nReady to order?",
        ],
        "booking": [
            "Perfect! 🍽️ To reserve a table at {business_name}, share:\n1. Date & time\n2. Number of guests\n3. Your name & phone",
        ],
        "hours": [
            "We're open at {business_name}:\n{timing_details}\n\nSee you soon! 🍽️",
        ],
    },
    "clinic": {
        "greeting": [
            "Hello! 🏥 Welcome to {business_name}. How can we assist with your health needs?",
            "Hi! Thank you for contacting {business_name}. How may we help you today? 🩺",
        ],
        "pricing": [
            "Our consultation fees at {business_name}:\n{product_list}\n\nWould you like to book an appointment? 🏥",
        ],
        "booking": [
            "To schedule an appointment at {business_name}, please share:\n1. Your name\n2. Phone number\n3. Preferred date & time\n4. Reason for visit",
        ],
    },
    "retail": {
        "greeting": [
            "Hello! 🛍️ Welcome to {business_name}. What are you looking for today?",
            "Hi! 👋 Thanks for visiting {business_name}. How can we help you shop?",
        ],
        "pricing": [
            "Here's what we have at {business_name}: ✨\n{product_list}\n\nNeed more details?",
        ],
    },
    "fitness": {
        "greeting": [
            "Hey there! 💪 Welcome to {business_name}. Ready to start your fitness journey?",
            "Hi! 🏋️ Thanks for reaching out to {business_name}. How can we help you get fit?",
        ],
        "booking": [
            "Awesome! 💪 To book a trial or join at {business_name}, share:\n1. Your name\n2. Phone number\n3. Preferred timing",
        ],
    },
    "other": {
        "greeting": [
            "Hello! 👋 Welcome to {business_name}. How can we assist you today?",
            "Hi there! Thanks for reaching out to {business_name}. How may we help? 😊",
        ],
        "pricing": [
            "Our services at {business_name}:\n{product_list}\n\nWould you like more details?",
        ],
        "booking": [
            "To schedule with {business_name}, please share:\n1. Your name\n2. Phone number\n3. Preferred date & time",
        ],
    },
}

# Fallback templates for any intent not covered above
FALLBACK_TEMPLATES = {
    "out_of_scope": [
        "I can only help with queries about {business_name}. How can I assist you with our services? 😊",
        "That's outside my expertise! I'm here to help with {business_name}. What can I do for you? 🙏",
    ],
    "unknown": [
        "I'll connect you with someone from {business_name}. They'll respond shortly! 🙏",
        "Let me get our team at {business_name} to help you with this. One moment! 🙏",
    ],
    "human_escalation": [
        "I'll connect you with someone from {business_name}. 🙏\n\n⏱️ Typical response time: 5-10 minutes",
    ],
}


def get_business_template(
    industry: str, 
    intent: str, 
    business_name: str = "",
    **kwargs
) -> str:
    """
    Get a business-specific template with random selection for variety.
    Falls back to industry 'other' if not found.
    """
    # Try industry-specific template first
    templates = BUSINESS_TEMPLATES.get(industry.lower(), BUSINESS_TEMPLATES["other"])
    intent_templates = templates.get(intent, FALLBACK_TEMPLATES.get(intent, []))
    
    if not intent_templates:
        intent_templates = FALLBACK_TEMPLATES.get("unknown", ["Thanks for your message! 🙏"])
    
    # Random selection for variety
    template = random.choice(intent_templates)
    
    # Format with business data
    return format_template(template, business_name=business_name, **kwargs)

