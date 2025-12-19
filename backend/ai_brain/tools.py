"""
Function/Tool definitions for ChatGPT function-calling.
Defines structured tools for actionable intents like booking, pricing, and location queries.
"""

from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum


class ToolName(str, Enum):
    """Available tool names for function calling."""
    GET_PRICING = "get_pricing"
    SEARCH_PRODUCTS = "search_products"
    CHECK_AVAILABILITY = "check_availability"
    BOOK_APPOINTMENT = "book_appointment"
    GET_BUSINESS_HOURS = "get_business_hours"
    GET_LOCATION = "get_location"
    ESCALATE_TO_HUMAN = "escalate_to_human"
    COLLECT_LEAD = "collect_lead"


# =============================================================================
# TOOL SCHEMAS (OpenAI Function Calling Format)
# =============================================================================

TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_pricing",
            "description": "Get the price information for a specific product or service. Use when user asks about costs, prices, rates, or fees for a specific item.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_name": {
                        "type": "string",
                        "description": "Name of the product or service to get pricing for (e.g., 'haircut', 'consultation', 'pizza')"
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category to filter (e.g., 'hair', 'spa', 'food')"
                    }
                },
                "required": ["product_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search for products or services matching a query. Use when user wants to browse or find services.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (e.g., 'spa treatments', 'vegetarian dishes')"
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default 5)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check if a specific date/time slot is available for booking. Use before making a booking.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "Date to check (format: YYYY-MM-DD or 'today', 'tomorrow')"
                    },
                    "time": {
                        "type": "string",
                        "description": "Time to check (format: HH:MM or '2pm', '3:30pm')"
                    },
                    "service": {
                        "type": "string",
                        "description": "Optional service name to check availability for"
                    }
                },
                "required": ["date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Create a booking/appointment for the customer. Only call after confirming availability and getting customer details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_name": {
                        "type": "string",
                        "description": "Customer's full name"
                    },
                    "phone": {
                        "type": "string",
                        "description": "Customer's phone number"
                    },
                    "date": {
                        "type": "string",
                        "description": "Booking date (format: YYYY-MM-DD)"
                    },
                    "time": {
                        "type": "string",
                        "description": "Booking time (format: HH:MM)"
                    },
                    "service": {
                        "type": "string",
                        "description": "Service to book"
                    },
                    "notes": {
                        "type": "string",
                        "description": "Any special requests or notes"
                    }
                },
                "required": ["customer_name", "phone", "date", "time", "service"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_business_hours",
            "description": "Get the operating hours/timings of the business. Use when user asks about when the business is open or closed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "day": {
                        "type": "string",
                        "description": "Specific day to check (e.g., 'monday', 'today', 'tomorrow')"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_location",
            "description": "Get the business location, address, and directions. Use when user asks where the business is located.",
            "parameters": {
                "type": "object",
                "properties": {
                    "include_maps_link": {
                        "type": "boolean",
                        "description": "Whether to include Google Maps link",
                        "default": True
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "escalate_to_human",
            "description": "Hand off the conversation to a human agent. Use for complaints, complex issues, or when explicitly requested.",
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "Reason for escalation (e.g., 'complaint', 'complex_query', 'user_requested')"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent"],
                        "description": "Priority level of the escalation"
                    },
                    "summary": {
                        "type": "string",
                        "description": "Brief summary of the issue for the human agent"
                    }
                },
                "required": ["reason"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "collect_lead",
            "description": "Collect customer contact information for follow-up. Use when customer shows interest and wants to be contacted.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Customer's name"
                    },
                    "phone": {
                        "type": "string",
                        "description": "Customer's phone number"
                    },
                    "interest": {
                        "type": "string",
                        "description": "What the customer is interested in"
                    },
                    "preferred_callback_time": {
                        "type": "string",
                        "description": "When the customer prefers to be contacted"
                    }
                },
                "required": ["phone", "interest"]
            }
        }
    }
]


# =============================================================================
# TOOL EXECUTORS
# =============================================================================

@dataclass
class ToolResult:
    """Result from executing a tool."""
    success: bool
    data: Dict[str, Any]
    message: str
    should_respond: bool = True  # Whether AI should generate a response


class ToolExecutor:
    """
    Executes tool functions using business data.
    Each tool function takes business_data and arguments, returns ToolResult.
    """
    
    def __init__(self, business_data: Dict[str, Any]):
        self.business_data = business_data
        self._handlers: Dict[str, Callable] = {
            ToolName.GET_PRICING: self._get_pricing,
            ToolName.SEARCH_PRODUCTS: self._search_products,
            ToolName.CHECK_AVAILABILITY: self._check_availability,
            ToolName.BOOK_APPOINTMENT: self._book_appointment,
            ToolName.GET_BUSINESS_HOURS: self._get_business_hours,
            ToolName.GET_LOCATION: self._get_location,
            ToolName.ESCALATE_TO_HUMAN: self._escalate_to_human,
            ToolName.COLLECT_LEAD: self._collect_lead,
        }
    
    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """Execute a tool by name with given arguments."""
        handler = self._handlers.get(tool_name)
        if not handler:
            return ToolResult(
                success=False,
                data={},
                message=f"Unknown tool: {tool_name}"
            )
        
        try:
            return handler(arguments)
        except Exception as e:
            return ToolResult(
                success=False,
                data={"error": str(e)},
                message=f"Error executing {tool_name}: {str(e)}"
            )
    
    def _get_pricing(self, args: Dict[str, Any]) -> ToolResult:
        """Get pricing for a product/service."""
        product_name = args.get("product_name", "").lower()
        category = args.get("category", "").lower()
        
        products = self.business_data.get("products_services", [])
        matches = []
        
        for p in products:
            name = p.get("name", "").lower()
            cat = p.get("category", "").lower()
            
            # Match by name (partial match)
            if product_name in name or name in product_name:
                matches.append(p)
            # Also match by category if specified
            elif category and category in cat:
                matches.append(p)
        
        if matches:
            return ToolResult(
                success=True,
                data={"products": matches},
                message=f"Found {len(matches)} matching product(s)"
            )
        else:
            return ToolResult(
                success=False,
                data={"searched_for": product_name},
                message=f"No pricing found for '{product_name}'. Please check with our team."
            )
    
    def _search_products(self, args: Dict[str, Any]) -> ToolResult:
        """Search for products/services."""
        query = args.get("query", "").lower()
        category = args.get("category", "").lower()
        max_results = args.get("max_results", 5)
        
        products = self.business_data.get("products_services", [])
        matches = []
        
        for p in products:
            name = p.get("name", "").lower()
            desc = p.get("description", "").lower()
            cat = p.get("category", "").lower()
            
            # Score-based matching
            score = 0
            if query in name:
                score += 3
            if query in desc:
                score += 1
            if category and category in cat:
                score += 2
            
            if score > 0:
                matches.append((score, p))
        
        # Sort by score and take top results
        matches.sort(key=lambda x: x[0], reverse=True)
        results = [p for _, p in matches[:max_results]]
        
        return ToolResult(
            success=len(results) > 0,
            data={"products": results, "query": query},
            message=f"Found {len(results)} matching product(s)"
        )
    
    def _check_availability(self, args: Dict[str, Any]) -> ToolResult:
        """Check availability for a date/time."""
        # This is a placeholder - in production, this would check a booking system
        date = args.get("date", "")
        time = args.get("time", "")
        
        # For now, always return available and suggest collecting info
        return ToolResult(
            success=True,
            data={
                "date": date,
                "time": time,
                "available": True,
                "note": "Availability check is simulated - integrate with booking system"
            },
            message="Slot appears to be available. Please provide your details to confirm booking."
        )
    
    def _book_appointment(self, args: Dict[str, Any]) -> ToolResult:
        """Create a booking."""
        required_fields = ["customer_name", "phone", "date", "time", "service"]
        missing = [f for f in required_fields if not args.get(f)]
        
        if missing:
            return ToolResult(
                success=False,
                data={"missing_fields": missing},
                message=f"Missing required information: {', '.join(missing)}"
            )
        
        # In production, this would create a booking in the system
        booking_data = {
            "customer_name": args.get("customer_name"),
            "phone": args.get("phone"),
            "date": args.get("date"),
            "time": args.get("time"),
            "service": args.get("service"),
            "notes": args.get("notes", ""),
            "status": "pending_confirmation"
        }
        
        return ToolResult(
            success=True,
            data={"booking": booking_data},
            message="Booking request created! Our team will confirm shortly."
        )
    
    def _get_business_hours(self, args: Dict[str, Any]) -> ToolResult:
        """Get business operating hours."""
        timings = self.business_data.get("timings", {})
        day = args.get("day", "").lower()
        
        if not timings:
            return ToolResult(
                success=False,
                data={},
                message="Operating hours information not available."
            )
        
        if day and day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
            day_timing = timings.get(day, {})
            return ToolResult(
                success=True,
                data={"day": day, "timing": day_timing},
                message=f"Hours for {day}"
            )
        
        # Return all timings
        formatted = {}
        for d in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
            if d in timings:
                formatted[d] = timings[d]
        
        return ToolResult(
            success=True,
            data={"timings": formatted, "special_notes": timings.get("special_notes")},
            message="Business operating hours"
        )
    
    def _get_location(self, args: Dict[str, Any]) -> ToolResult:
        """Get business location and directions."""
        location = self.business_data.get("location", {})
        
        if not location or not location.get("address"):
            return ToolResult(
                success=False,
                data={},
                message="Location information not available."
            )
        
        include_maps = args.get("include_maps_link", True)
        
        result_data = {
            "address": location.get("address"),
            "city": location.get("city"),
            "state": location.get("state"),
            "pincode": location.get("pincode"),
            "landmarks": location.get("landmarks", []),
        }
        
        if include_maps and location.get("google_maps_link"):
            result_data["maps_link"] = location["google_maps_link"]
        
        return ToolResult(
            success=True,
            data=result_data,
            message="Business location"
        )
    
    def _escalate_to_human(self, args: Dict[str, Any]) -> ToolResult:
        """Escalate to human agent."""
        reason = args.get("reason", "user_requested")
        priority = args.get("priority", "medium")
        summary = args.get("summary", "")
        
        # In production, this would create a ticket/notification
        escalation = {
            "reason": reason,
            "priority": priority,
            "summary": summary,
            "status": "escalated"
        }
        
        contact = self.business_data.get("contact", {})
        contact_info = contact.get("phone") or contact.get("whatsapp")
        
        return ToolResult(
            success=True,
            data={"escalation": escalation, "contact": contact_info},
            message="Connecting you with our team. Someone will respond shortly."
        )
    
    def _collect_lead(self, args: Dict[str, Any]) -> ToolResult:
        """Collect lead information."""
        phone = args.get("phone")
        interest = args.get("interest")
        
        if not phone:
            return ToolResult(
                success=False,
                data={"missing": "phone"},
                message="Please share your phone number so we can contact you."
            )
        
        lead = {
            "name": args.get("name", ""),
            "phone": phone,
            "interest": interest,
            "preferred_callback_time": args.get("preferred_callback_time", ""),
            "status": "new"
        }
        
        return ToolResult(
            success=True,
            data={"lead": lead},
            message="Thank you! Our team will contact you shortly."
        )


def get_tool_schemas() -> List[Dict[str, Any]]:
    """Get all tool schemas for OpenAI function calling."""
    return TOOL_SCHEMAS


def get_tool_names() -> List[str]:
    """Get list of all tool names."""
    return [t.value for t in ToolName]
