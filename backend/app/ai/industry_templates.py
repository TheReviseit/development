# Industry-specific automation templates

INDUSTRY_TEMPLATES = {
    "restaurant": {
        "intents": [
            {
                "intent_name": "table_booking",
                "display_name": "Table Reservation",
                "description": "Customer wants to book a table",
                "training_examples": [
                    "I want to book a table",
                    "Reserve table for 4",
                    "Can I make a reservation?",
                    "Book a table tonight"
                ],
                "response_templates": [
                    "I'd be happy to help! For how many people and what time would you like to book?",
                    "Great! What time works best for you, and for how many guests?"
                ]
            },
            {
                "intent_name": "menu_request",
                "display_name": "Menu Inquiry",
                "description": "Customer asks about menu",
                "training_examples": [
                    "What's on the menu?",
                    "Do you have a menu?",
                    "Show me the menu",
                    "What do you serve?"
                ],
                "response_templates": [
                    "You can view our full menu at [menu link]. What type of cuisine are you interested in?",
                    "We serve Italian cuisine. Would you like to know about our specials?"
                ]
            }
        ],
        "automation_rules": [
            {
                "name": "Opening Hours",
                "trigger_keywords": ["hours", "open", "opening time", "when are you open"],
                "response_template": "We're open Monday-Sunday, 11 AM - 10 PM. Would you like to make a reservation?"
            }
        ]
    },
    
    "clinic": {
        "intents": [
            {
                "intent_name": "appointment_booking",
                "display_name": "Appointment Booking",
                "description": "Patient wants to schedule appointment",
                "training_examples": [
                    "I need an appointment",
                    "Can I see the doctor?",
                    "Book appointment with Dr. Smith",
                    "Schedule a checkup"
                ],
                "response_templates": [
                    "I can help you schedule an appointment. What type of visit do you need?",
                    "When would you prefer your appointment? Morning or afternoon?"
                ]
            }
        ],
        "automation_rules": [
            {
                "name": "Emergency Info",
                "trigger_keywords": ["emergency", "urgent", "asap"],
                "response_template": "For medical emergencies, please call 911 or visit the nearest ER. For urgent care, call us at [phone]."
            }
        ]
    },
    
    "real_estate": {
        "intents": [
            {
                "intent_name": "property_inquiry",
                "display_name": "Property Inquiry",
                "description": "Lead asks about properties",
                "training_examples": [
                    "What properties do you have?",
                    "Show me houses for sale",
                    "I'm looking for a 3BR apartment",
                    "Available properties?"
                ],
                "response_templates": [
                    "I'd love to help! What's your budget range and preferred location?",
                    "Great! Are you looking to buy or rent? And what type of property?"
                ]
            },
            {
                "intent_name": "site_visit",
                "display_name": "Site Visit Request",
                "description": "Lead wants to schedule viewing",
                "training_examples": [
                    "Can I visit the property?",
                    "Schedule a viewing",
                    "Want to see the house",
                    "Can we do a site visit?"
                ],
                "response_templates": [
                    "Absolutely! Which property are you interested in viewing? I can arrange a tour.",
                    "I can set that up. What day works best for you this week?"
                ]
            }
        ]
    },
    
    "ecommerce": {
        "intents": [
            {
                "intent_name": "product_inquiry",
                "display_name": "Product Question",
                "description": "Customer asks about products",
                "training_examples": [
                    "Do you have X in stock?",
                    "Tell me about this product",
                    "Is this available?",
                    "Product details"
                ],
                "response_templates": [
                    "Which product are you interested in? I can check availability.",
                    "Yes, we have that! Would you like to know more details?"
                ]
            },
            {
                "intent_name": "order_status",
                "display_name": "Order Status",
                "description": "Customer checks order status",
                "training_examples": [
                    "Where is my order?",
                    "Track my package",
                    "Order status",
                    "When will I receive it?"
                ],
                "response_templates": [
                    "I can help track your order. Can you share your order number?",
                    "Let me check that for you. What's your order ID?"
                ]
            }
        ],
        "automation_rules": [
            {
                "name": "Return Policy",
                "trigger_keywords": ["return", "refund", "exchange"],
                "response_template": "We offer 30-day returns. Please visit [return policy link] or let me know your order number to start a return."
            }
        ]
    },
    
    "salon": {
        "intents": [
            {
                "intent_name": "booking",
                "display_name": "Appointment Booking",
                "description": "Customer wants to book service",
                "training_examples": [
                    "Book a haircut",
                    "I need a manicure appointment",
                    "Schedule a spa treatment",
                    "Can I book for tomorrow?"
                ],
                "response_templates": [
                    "I'd love to book you in! What service would you like and when?",
                    "Perfect! Which day works best for you? We have slots available."
                ]
            },
            {
                "intent_name": "services",
                "display_name": "Services Inquiry",
                "description": "Ask about available services",
                "training_examples": [
                    "What services do you offer?",
                    "Do you do highlights?",
                    "What treatments are available?",
                    "Price list?"
                ],
                "response_templates": [
                    "We offer haircuts, coloring, treatments, and spa services. What are you interested in?",
                    "Our services include [list]. Would you like detailed pricing?"
                ]
            }
        ]
    }
}


def get_templates_for_industry(industry: str) -> dict:
    """Get pre-built templates for specific industry"""
    return INDUSTRY_TEMPLATES.get(industry, {})
