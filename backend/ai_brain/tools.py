"""
Function/Tool definitions for ChatGPT function-calling.
Defines structured tools for actionable intents like booking, pricing, and location queries.
"""

import os
import logging
import requests
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


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
    
    # Frontend API URL for booking (booking endpoint is on frontend)
    FRONTEND_API_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
    INTERNAL_API_KEY = os.environ.get('INTERNAL_API_KEY', 'flowauxi-internal-key')
    
    def __init__(self, business_data: Dict[str, Any], user_id: str = None, business_owner_id: str = None):
        self.business_data = business_data
        self.user_id = user_id  # Customer's WhatsApp ID
        # Business owner's Firebase UID - use from business_data or explicit parameter
        self.business_owner_id = business_owner_id or business_data.get("business_id") or business_data.get("user_id")
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
        """Check availability for a date/time by calling the actual booking API."""
        # Normalize date and time
        date = self._normalize_date(args.get("date", ""))
        time = self._normalize_time(args.get("time", "")) if args.get("time") else ""
        
        logger.info(f"📅 Checking availability for date: {args.get('date')} → {date}, time: {args.get('time')} → {time}")
        
        if not self.business_owner_id:
            logger.error("No business_owner_id available for availability check")
            return ToolResult(
                success=True,  # Assume available if we can't check
                data={"date": date, "time": time, "available": True},
                message="Slot appears to be available. Please provide your details to confirm booking."
            )
        
        try:
            # Call the frontend API to check actual availability
            api_url = f"{self.FRONTEND_API_URL}/api/ai-appointment-book"
            params = {"user_id": self.business_owner_id, "date": date}
            
            response = requests.get(
                api_url,
                params=params,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": self.INTERNAL_API_KEY
                },
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                available_slots = result.get("available_slots", [])
                
                # Format date for display (DD-MM-YY)
                try:
                    from datetime import datetime
                    parsed = datetime.strptime(date, "%Y-%m-%d")
                    display_date = parsed.strftime("%d-%m-%y")
                except:
                    display_date = date
                
                # Format time for display
                def format_time_12h(t):
                    try:
                        parts = t.split(':')
                        h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
                        period = 'PM' if h >= 12 else 'AM'
                        display_h = h - 12 if h > 12 else (12 if h == 0 else h)
                        return f"{display_h}:{m:02d} {period}"
                    except:
                        return t
                
                if time:
                    time_display = format_time_12h(time)
                    # Check if specific time is available
                    is_available = time in available_slots
                    if is_available:
                        return ToolResult(
                            success=True,
                            data={"date": date, "time": time, "available": True, "available_slots": available_slots},
                            message=f"Great news! {time_display} on {display_date} is available. Please provide your name and phone number to confirm the booking."
                        )
                    else:
                        slots_display = [format_time_12h(s) for s in available_slots[:5]]
                        slots_str = ", ".join(slots_display) if slots_display else "No slots"
                        return ToolResult(
                            success=True,
                            data={"date": date, "time": time, "available": False, "available_slots": available_slots},
                            message=f"Sorry, {time_display} is not available on {display_date}. Available times: {slots_str}. Please choose another time."
                        )
                else:
                    # Return all available slots for the date
                    if available_slots:
                        slots_display = [format_time_12h(s) for s in available_slots[:5]]
                        slots_str = ", ".join(slots_display)
                        return ToolResult(
                            success=True,
                            data={"date": date, "available_slots": available_slots},
                            message=f"Available times on {display_date}: {slots_str}. Which time works best for you?"
                        )
                    else:
                        return ToolResult(
                            success=True,
                            data={"date": date, "available_slots": []},
                            message=f"Sorry, no slots available on {display_date}. Would you like to try a different date?"
                        )
            else:
                logger.warning(f"Availability check failed: {response.status_code}")
                # Fall back to assuming available
                return ToolResult(
                    success=True,
                    data={"date": date, "time": time, "available": True},
                    message="Slot appears to be available. Please provide your details to confirm booking."
                )
                
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            # Fall back to assuming available
            return ToolResult(
                success=True,
                data={"date": date, "time": time, "available": True},
                message="Slot appears to be available. Please provide your details to confirm booking."
            )
    
    def _normalize_date(self, date_str: str) -> str:
        """Normalize date to YYYY-MM-DD format. Expects DD-MM-YY input."""
        import re
        from datetime import datetime, timedelta
        
        if not date_str:
            return date_str
        
        date_str = date_str.strip()
        
        # Already in YYYY-MM-DD format
        if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            return date_str
        
        # Handle natural language
        lower = date_str.lower()
        today = datetime.now().date()
        if lower == 'today':
            return today.strftime("%Y-%m-%d")
        elif lower == 'tomorrow':
            return (today + timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Parse DD-MM-YY format (e.g., 01-02-26 = 1st Feb 2026)
        match = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$', date_str)
        if match:
            day, month, year = match.groups()
            day = int(day)
            month = int(month)
            year = int(year)
            
            # Handle 2-digit year
            if year < 100:
                year = 2000 + year if year < 50 else 1900 + year
            
            # Validate day and month
            if 1 <= day <= 31 and 1 <= month <= 12:
                try:
                    from datetime import date as date_class
                    parsed_date = date_class(year, month, day)
                    result = parsed_date.strftime("%Y-%m-%d")
                    logger.info(f"📅 Parsed DD-MM-YY: {date_str} → day={day}, month={month}, year={year} → {result}")
                    return result
                except ValueError as e:
                    logger.warning(f"Invalid date: {date_str} - {e}")
        
        logger.warning(f"Could not normalize date: {date_str}")
        return date_str
    
    def _normalize_time(self, time_str: str) -> str:
        """Normalize time to HH:MM format."""
        import re
        from datetime import datetime
        
        if not time_str:
            return time_str
        
        time_str = time_str.strip().upper()
        
        # Already in HH:MM format
        if re.match(r'^\d{2}:\d{2}$', time_str):
            return time_str
        
        # Handle "10:00 AM" or "2:30 PM" format
        match = re.match(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', time_str)
        if match:
            hour, minute, period = int(match.group(1)), match.group(2), match.group(3)
            if period == 'PM' and hour != 12:
                hour += 12
            elif period == 'AM' and hour == 12:
                hour = 0
            return f"{hour:02d}:{minute}"
        
        # Handle "10AM" or "2PM" format
        match = re.match(r'^(\d{1,2})\s*(AM|PM)$', time_str)
        if match:
            hour, period = int(match.group(1)), match.group(2)
            if period == 'PM' and hour != 12:
                hour += 12
            elif period == 'AM' and hour == 12:
                hour = 0
            return f"{hour:02d}:00"
        
        # Handle 24-hour format without colon
        match = re.match(r'^(\d{1,2})(\d{2})$', time_str)
        if match:
            return f"{match.group(1).zfill(2)}:{match.group(2)}"
        
        logger.warning(f"Could not normalize time: {time_str}")
        return time_str
    
    def _book_appointment(self, args: Dict[str, Any]) -> ToolResult:
        """Create a booking by calling the actual booking API."""
        # Service is optional for booking - remove from required fields
        required_fields = ["customer_name", "phone", "date", "time"]
        missing = [f for f in required_fields if not args.get(f)]
        
        if missing:
            return ToolResult(
                success=False,
                data={"missing_fields": missing},
                message=f"Missing required information: {', '.join(missing)}"
            )
        
        # Check if business_owner_id is available (this is the Firebase UID of the business owner)
        if not self.business_owner_id:
            logger.error("No business_owner_id available for booking")
            return ToolResult(
                success=False,
                data={"error": "configuration_error"},
                message="Unable to process booking. Please try again or contact us directly."
            )
        
        # Normalize date and time formats
        normalized_date = self._normalize_date(args.get("date", ""))
        normalized_time = self._normalize_time(args.get("time", ""))
        
        logger.info(f"📅 Date normalization: {args.get('date')} → {normalized_date}")
        logger.info(f"⏰ Time normalization: {args.get('time')} → {normalized_time}")
        
        # Prepare booking data for the API
        # user_id in the API is the business owner's Firebase UID, NOT the customer's WhatsApp number
        booking_payload = {
            "user_id": self.business_owner_id,  # Business owner's Firebase UID
            "customer_name": args.get("customer_name"),
            "customer_phone": args.get("phone"),
            "date": normalized_date,
            "time": normalized_time,
            "service": args.get("service", "General Appointment"),
            "notes": args.get("notes", ""),
        }
        
        try:
            # Call the frontend booking API (ai-appointment-book endpoint)
            api_url = f"{self.FRONTEND_API_URL}/api/ai-appointment-book"
            headers = {
                "Content-Type": "application/json",
                "x-api-key": self.INTERNAL_API_KEY
            }
            
            logger.info(f"📅 Booking API call: {api_url}")
            logger.info(f"   Business Owner ID: {self.business_owner_id}")
            logger.info(f"   Business Owner ID length: {len(self.business_owner_id) if self.business_owner_id else 0}")
            logger.info(f"   Business Owner ID format: {'UUID' if self.business_owner_id and '-' in self.business_owner_id else 'Firebase UID'}")
            logger.info(f"   Payload: {booking_payload}")
            logger.info(f"   API Key present: {bool(self.INTERNAL_API_KEY)}")
            
            response = requests.post(
                api_url,
                json=booking_payload,
                headers=headers,
                timeout=15
            )
            
            logger.info(f"📅 Booking API response status: {response.status_code}")
            
            try:
                result = response.json()
                logger.info(f"📅 Booking API response: {result}")
            except Exception as json_err:
                logger.error(f"📅 Failed to parse response JSON: {json_err}")
                logger.error(f"📅 Raw response: {response.text[:500]}")
                return ToolResult(
                    success=False,
                    data={"error": "invalid_response"},
                    message="Unable to process booking response. Please try again."
                )
            
            if response.status_code == 200 and result.get("success"):
                # Booking successful!
                appointment = result.get("appointment", {})
                return ToolResult(
                    success=True,
                    data={
                        "booking": appointment,
                        "status": "confirmed",
                        "confirmation_message": result.get("confirmation_message", "")
                    },
                    message=result.get("confirmation_message", "Your appointment has been confirmed!")
                )
            
            elif response.status_code == 409:
                # Time slot conflict
                available_slots = result.get("available_slots", [])
                slots_str = ", ".join(available_slots[:5]) if available_slots else "No slots available"
                return ToolResult(
                    success=False,
                    data={
                        "conflict": True,
                        "available_slots": available_slots,
                        "requested_date": args.get("date"),
                        "requested_time": args.get("time")
                    },
                    message=f"Sorry, that time slot is already booked. Available times: {slots_str}. Please choose another time."
                )
            
            else:
                # Other error
                error_msg = result.get("error", "Failed to book appointment")
                logger.error(f"Booking API error: {error_msg}")
                return ToolResult(
                    success=False,
                    data={"error": error_msg},
                    message=f"Unable to complete booking: {error_msg}"
                )
                
        except requests.Timeout:
            logger.error("Booking API timeout")
            return ToolResult(
                success=False,
                data={"error": "timeout"},
                message="The booking system is taking too long. Please try again."
            )
        except requests.RequestException as e:
            logger.error(f"Booking API request error: {e}")
            return ToolResult(
                success=False,
                data={"error": str(e)},
                message="Unable to connect to booking system. Please try again later."
            )
        except Exception as e:
            logger.error(f"Unexpected error in _book_appointment: {e}")
            return ToolResult(
                success=False,
                data={"error": str(e)},
                message="An unexpected error occurred. Please try again."
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
