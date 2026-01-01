"""
Appointment Handler for AI-driven appointment booking.
Handles the conversational flow for collecting appointment information
and booking appointments through the AI bot.
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date, time, timedelta
import re

from .conversation_manager import FlowStatus

logger = logging.getLogger(__name__)


class AppointmentHandler:
    """
    Handles AI-driven appointment booking flow.
    
    This class manages:
    - Loading appointment configuration for a business
    - Checking slot availability
    - Collecting appointment fields through conversation
    - Booking appointments with conflict detection
    """
    
    def __init__(self, supabase_client, frontend_url: str = None):
        """
        Initialize the appointment handler.
        
        Args:
            supabase_client: Supabase client for database operations
            frontend_url: Frontend URL for API calls (optional)
        """
        self.supabase = supabase_client
        self.frontend_url = frontend_url or "http://localhost:3000"
        
        # Conversation state storage (in production, use Redis)
        self.booking_sessions: Dict[str, Dict] = {}
        
        # Default fields for minimal mode - ORDER: service → date → time → name → phone
        # This ensures we ask for service/date/time first, check availability, then collect customer details
        self.minimal_fields = [
            {"id": "service", "label": "Service", "type": "text", "required": True, "order": 1},
            {"id": "date", "label": "Appointment Date", "type": "date", "required": True, "order": 2},
            {"id": "time", "label": "Appointment Time", "type": "time", "required": True, "order": 3},
            {"id": "name", "label": "Full Name", "type": "text", "required": True, "order": 4},
            {"id": "phone", "label": "Phone Number", "type": "phone", "required": True, "order": 5},
        ]
    
    def get_config(self, user_id: str) -> Dict:
        """
        Get appointment configuration for a business.
        
        Args:
            user_id: The business owner's user ID (Firebase UID)
            
        Returns:
            Dict with appointment configuration or defaults
        """
        try:
            result = self.supabase.table("ai_capabilities").select("*").eq("user_id", user_id).single().execute()
            
            if result.data:
                config = result.data
                return {
                    "enabled": config.get("appointment_booking_enabled", False),
                    "fields": config.get("appointment_fields", self.minimal_fields),
                    "business_hours": config.get("appointment_business_hours", {
                        "start": "09:00",
                        "end": "18:00",
                        "duration": 60
                    }),
                    "minimal_mode": config.get("appointment_minimal_mode", False)
                }
            
            return {
                "enabled": False,
                "fields": self.minimal_fields,
                "business_hours": {"start": "09:00", "end": "18:00", "duration": 60},
                "minimal_mode": False
            }
            
        except Exception as e:
            logger.error(f"Error fetching appointment config: {e}")
            return {
                "enabled": False,
                "fields": self.minimal_fields,
                "business_hours": {"start": "09:00", "end": "18:00", "duration": 60},
                "minimal_mode": False
            }
    
    def check_availability(self, user_id: str, check_date: str, check_time: str = None) -> Dict:
        """
        Check slot availability for a given date/time, considering capacity.
        
        Args:
            user_id: Business owner's user ID
            check_date: Date to check (YYYY-MM-DD format)
            check_time: Optional specific time to check (HH:MM format)
            
        Returns:
            Dict with availability info and available slots
        """
        try:
            # Get service configuration for capacity
            config_result = self.supabase.table("ai_capabilities").select("appointment_services").eq("user_id", user_id).single().execute()
            services = config_result.data.get("appointment_services", []) if config_result.data else []
            default_capacity = services[0].get("capacity", 1) if services else 1
            
            # Get existing appointments for the date
            result = self.supabase.table("appointments").select("time, duration, status").eq("user_id", user_id).eq("date", check_date).neq("status", "cancelled").execute()
            
            # Count bookings per time slot
            bookings_per_slot = {}
            if result.data:
                for apt in result.data:
                    time_slot = apt["time"]
                    bookings_per_slot[time_slot] = bookings_per_slot.get(time_slot, 0) + 1
            
            # If checking specific time, check against capacity
            if check_time:
                current_bookings = bookings_per_slot.get(check_time, 0)
                is_available = current_bookings < default_capacity
                return {
                    "available": is_available,
                    "date": check_date,
                    "time": check_time,
                    "current_bookings": current_bookings,
                    "capacity": default_capacity,
                    "bookings_per_slot": bookings_per_slot
                }
            
            # Return all booking info for the date
            return {
                "date": check_date,
                "bookings_per_slot": bookings_per_slot,
                "capacity": default_capacity,
                "total_bookings": sum(bookings_per_slot.values())
            }
            
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            return {"available": False, "error": str(e)}
    
    def get_available_slots(self, user_id: str, check_date: str, config: Dict = None) -> List[str]:
        """
        Get list of available time slots for a date, considering capacity.
        
        Args:
            user_id: Business owner's user ID
            check_date: Date to check
            config: Optional appointment config (will fetch if not provided)
            
        Returns:
            List of available time strings
        """
        try:
            if not config:
                # Sync version - use execute() directly
                result = self.supabase.table("ai_capabilities").select("appointment_business_hours, appointment_services").eq("user_id", user_id).single().execute()
                business_hours = result.data.get("appointment_business_hours", {"start": "09:00", "end": "18:00", "duration": 60}) if result.data else {"start": "09:00", "end": "18:00", "duration": 60}
                services = result.data.get("appointment_services", []) if result.data else []
            else:
                business_hours = config.get("business_hours", {"start": "09:00", "end": "18:00", "duration": 60})
                services = config.get("services", [])
            
            # Get default capacity from services
            default_capacity = services[0].get("capacity", 1) if services else 1
            
            # Get booked slots with capacity info
            availability = self.check_availability(user_id, check_date)
            bookings_per_slot = availability.get("bookings_per_slot", {})
            
            # Generate available slots
            start_hour, start_min = map(int, business_hours["start"].split(":"))
            end_hour, end_min = map(int, business_hours["end"].split(":"))
            duration = business_hours.get("duration", 60)
            
            available_slots = []
            current = datetime.combine(date.today(), time(start_hour, start_min))
            end = datetime.combine(date.today(), time(end_hour, end_min))
            
            while current < end:
                time_str = current.strftime("%H:%M")
                current_bookings = bookings_per_slot.get(time_str, 0)
                # Slot is available if under capacity
                if current_bookings < default_capacity:
                    available_slots.append(time_str)
                current += timedelta(minutes=duration)
            
            return available_slots
            
        except Exception as e:
            logger.error(f"Error getting available slots: {e}")
            return []
    
    def parse_multi_field_response(self, message: str, missing_fields: List[str]) -> Dict[str, str]:
        """
        Try to extract multiple field values from a single message.
        
        This handles cases where users provide all details at once like:
        "Raja, 6383634873, 02-01-26 morning 10am, hair cut"
        
        Returns a dict of field_id: value for any fields that could be extracted.
        """
        extracted = {}
        
        # Split message by common separators
        parts = re.split(r'[,\n]+', message)
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            # Try to identify what type of data this is
            
            # Phone number pattern (10+ digits)
            if "phone" in missing_fields and not extracted.get("phone"):
                phone_match = re.search(r'\b(\d{10,})\b', part)
                if phone_match:
                    extracted["phone"] = phone_match.group(1)
                    continue
            
            # Date pattern
            if "date" in missing_fields and not extracted.get("date"):
                date_validation = self.validate_field("date", part)
                if date_validation["valid"]:
                    extracted["date"] = date_validation["value"]
                    continue
            
            # Time pattern
            if "time" in missing_fields and not extracted.get("time"):
                time_validation = self.validate_field("time", part)
                if time_validation["valid"]:
                    extracted["time"] = time_validation["value"]
                    continue
            
            # Service keywords
            if "service" in missing_fields and not extracted.get("service"):
                service_keywords = ["haircut", "hair cut", "facial", "massage", "manicure", 
                                   "pedicure", "waxing", "threading", "spa", "treatment",
                                   "consultation", "checkup", "check up", "cleaning"]
                for kw in service_keywords:
                    if kw in part.lower():
                        extracted["service"] = part
                        break
                if extracted.get("service"):
                    continue
            
            # Name (usually first non-matched item if it's just letters)
            if "name" in missing_fields and not extracted.get("name"):
                if re.match(r'^[a-zA-Z\s]+$', part) and len(part) >= 2:
                    extracted["name"] = part
                    continue
        
        return extracted
    
    def validate_field(self, field_type: str, value: str) -> Dict:
        """
        Validate a field value based on its type.
        
        Args:
            field_type: Type of field (text, phone, email, date, time)
            value: User-provided value
            
        Returns:
            Dict with valid flag and normalized value or error message
        """
        value = value.strip()
        
        if field_type == "phone":
            # Remove common formatting
            phone = re.sub(r'[\s\-\(\)\+]', '', value)
            if len(phone) >= 10 and phone.isdigit():
                return {"valid": True, "value": phone}
            return {"valid": False, "error": "Please provide a valid phone number with at least 10 digits."}
        
        elif field_type == "email":
            email_pattern = r'^[\w\.-]+@[\w\.-]+\.\w+$'
            if re.match(email_pattern, value):
                return {"valid": True, "value": value.lower()}
            return {"valid": False, "error": "Please provide a valid email address."}
        
        elif field_type == "date":
            # Try to parse various date formats - DD-MM-YY as preferred format
            date_formats = [
                "%d-%m-%y",     # DD-MM-YY (preferred format)
                "%d/%m/%y",     # DD/MM/YY
                "%d-%m-%Y",     # DD-MM-YYYY
                "%d/%m/%Y",     # DD/MM/YYYY
                "%Y-%m-%d",     # YYYY-MM-DD (ISO format)
                "%m-%d-%y",     # MM-DD-YY (US format fallback)
                "%m/%d/%y",     # MM/DD/YY
            ]
            
            for fmt in date_formats:
                try:
                    parsed = datetime.strptime(value, fmt)
                    # Check if date is in the past
                    if parsed.date() < date.today():
                        return {"valid": False, "error": "Please choose a future date for your appointment."}
                    return {"valid": True, "value": parsed.strftime("%Y-%m-%d")}
                except ValueError:
                    continue
            
            # Try natural language parsing (tomorrow, next monday, etc.)
            value_lower = value.lower().strip()
            today = date.today()
            
            if value_lower == "today":
                return {"valid": True, "value": today.strftime("%Y-%m-%d")}
            elif value_lower == "tomorrow":
                return {"valid": True, "value": (today + timedelta(days=1)).strftime("%Y-%m-%d")}
            
            # Try to parse "02-01-26 morning" format (date with extra text)
            date_match = re.match(r'^(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})', value)
            if date_match:
                date_part = date_match.group(1)
                for fmt in date_formats:
                    try:
                        parsed = datetime.strptime(date_part, fmt)
                        if parsed.date() < date.today():
                            return {"valid": False, "error": "Please choose a future date for your appointment."}
                        return {"valid": True, "value": parsed.strftime("%Y-%m-%d")}
                    except ValueError:
                        continue
            
            return {"valid": False, "error": "Please provide a valid date in DD-MM-YY format (e.g., 15-01-26 for 15th Jan 2026)."}
        
        elif field_type == "time":
            # Clean and normalize the input
            value_clean = value.upper().replace(".", "").strip()
            
            # Handle "10am", "2pm" format (no space)
            value_clean = re.sub(r'(\d+)(AM|PM)', r'\1 \2', value_clean)
            
            # Handle "morning 10am" or "10am morning" format
            time_match = re.search(r'(\d{1,2}(?::\d{2})?)\s*(AM|PM)?', value_clean)
            if time_match:
                time_part = time_match.group(1)
                period = time_match.group(2) or ""
                
                # Handle keywords like "morning", "afternoon", "evening"
                if "MORNING" in value_clean and not period:
                    period = "AM"
                elif "AFTERNOON" in value_clean and not period:
                    period = "PM"
                elif "EVENING" in value_clean and not period:
                    period = "PM"
                
                if period:
                    value_clean = f"{time_part} {period}"
                else:
                    value_clean = time_part
            
            # Parse various time formats
            time_formats = [
                "%H:%M",      # 14:30
                "%I:%M %p",   # 2:30 PM
                "%I %p",      # 2 PM
                "%I:%M%p",    # 2:30PM (no space)
                "%I%p",       # 2PM (no space)
                "%H",         # 14
            ]
            
            for fmt in time_formats:
                try:
                    parsed = datetime.strptime(value_clean, fmt)
                    return {"valid": True, "value": parsed.strftime("%H:%M")}
                except ValueError:
                    continue
            
            return {"valid": False, "error": "Please provide a valid time (e.g., 10:00 AM, 2:30 PM, or 14:00)."}
        
        # For text and other types, just validate length
        if len(value) < 2:
            return {"valid": False, "error": "Please provide a more detailed response."}
        
        return {"valid": True, "value": value}
    
    def start_booking_session(self, user_id: str, customer_phone: str, config: Dict) -> Dict:
        """
        Start a new booking session for a customer.
        
        Args:
            user_id: Business owner's user ID
            customer_phone: Customer's phone number (WhatsApp)
            config: Appointment configuration
            
        Returns:
            Session info with first question
        """
        session_key = f"{user_id}:{customer_phone}"
        
        # Get fields to collect
        if config.get("minimal_mode"):
            fields = [f for f in self.minimal_fields]
        else:
            fields = sorted(config.get("fields", self.minimal_fields), key=lambda x: x.get("order", 0))
        
        # Create session
        self.booking_sessions[session_key] = {
            "user_id": user_id,
            "customer_phone": customer_phone,
            "fields": fields,
            "current_field_index": 0,
            "collected_data": {},
            "started_at": datetime.now().isoformat()
        }
        
        # Return first question
        first_field = fields[0]
        return {
            "session_started": True,
            "current_field": first_field,
            "question": self._generate_question(first_field, is_first=True)
        }
    
    def process_response(
        self, 
        user_id: str, 
        customer_phone: str, 
        response: str,
        conversation_state: Any = None
    ) -> Dict:
        """
        Process a customer's response in the booking flow.
        
        Args:
            user_id: Business owner's user ID
            customer_phone: Customer's phone number
            response: Customer's response text
            conversation_state: ConversationState object (Optional but recommended)
            
        Returns:
            Dict with next action (next question, validation error, or confirmation)
        """
        # If no state object provided, try legacy session (not recommended)
        if not conversation_state:
            session_key = f"{user_id}:{customer_phone}"
            session = self.booking_sessions.get(session_key)
            if not session:
                return {"error": "No active booking session", "restart_needed": True}
            
            # Legacy logic wrapper
            fields = session["fields"]
            current_index = session["current_field_index"]
            current_field = fields[current_index]
            
            # Logic continues as before... but we want to move away from this
            return self._legacy_process_response(session, current_field, user_id, response)

        # STATE-DRIVEN LOGIC
        if not conversation_state.is_active():
             return {"error": "No active flow", "restart_needed": True}
        
        current_field_id = conversation_state.current_field
        
        # Get field definition from config or minimal defaults
        field_def = self._get_field_definition(current_field_id, conversation_state.flow_config)
        
        if not field_def:
             # Should not happen if state is consistent
             return {"error": "Unknown field", "restart_needed": True}

        # Try to extract multiple fields if user provided complex message
        # (e.g., "Raja, 6383634873, 02-01-26 10am, hair cut")
        if len(response.split()) > 3 or ',' in response:
            extracted = self.parse_multi_field_response(response, conversation_state.missing_fields)
            if extracted:
                # Process extracted fields in order
                for field_id in list(conversation_state.missing_fields):
                    if field_id in extracted:
                        # Validate and collect the field
                        field_def_temp = self._get_field_definition(field_id, conversation_state.flow_config)
                        validation_temp = self.validate_field(field_def_temp["type"], extracted[field_id])
                        if validation_temp["valid"]:
                            conversation_state.collect_field(field_id, validation_temp["value"])
                
                # If we have a next field, ask for it
                if conversation_state.missing_fields:
                    next_field_id = conversation_state.missing_fields[0]
                    conversation_state.current_field = next_field_id
                    next_field_def = self._get_field_definition(next_field_id, conversation_state.flow_config)
                    
                    # Get available slots for time question
                    slots_for_time = None
                    if next_field_id == "time":
                        slots_for_time = conversation_state.flow_config.get("_available_slots")
                    
                    return {
                        "valid": True,
                        "next_field": next_field_def,
                        "question": self._generate_question(next_field_def, available_slots=slots_for_time)
                    }
                else:
                    # All done!
                    conversation_state.flow_status = FlowStatus.AWAITING_CONFIRMATION
                    return {
                        "valid": True,
                        "complete": True,
                        "collected_data": conversation_state.collected_fields,
                        "confirmation_message": self._generate_confirmation(conversation_state.collected_fields)
                    }

        # Validate the response for current field
        validation = self.validate_field(field_def["type"], response)
        
        if not validation["valid"]:
            return {
                "valid": False,
                "error": validation["error"],
                "retry_question": self._generate_retry_question(field_def)
            }
        
        # Check for date/time conflicts
        collected = conversation_state.collected_fields.copy()
        
        # After collecting date, check availability and get slots for time question
        available_slots = None
        if field_def["id"] == "date":
            check_date = validation["value"]
            available_slots = self.get_available_slots(user_id, check_date)
            if not available_slots:
                return {
                    "valid": False,
                    "conflict": True,
                    "error": f"Sorry, no slots are available on {check_date}. Would you like to try a different date? 📅"
                }
            # Store available slots for time question
            conversation_state.flow_config["_available_slots"] = available_slots
        
        if field_def["id"] == "time":
            if "date" in collected:
                check_date = collected["date"]
                availability = self.check_availability(user_id, check_date, validation["value"])
                if not availability.get("available", True):
                    available_slots = self.get_available_slots(user_id, check_date)
                    return {
                        "valid": False,
                        "conflict": True,
                        "error": self._generate_conflict_message(check_date, available_slots)
                    }
        
        # Store valid value in state
        next_field_id = conversation_state.collect_field(current_field_id, validation["value"])
        
        if next_field_id:
            # Get next field definition
            next_field_def = self._get_field_definition(next_field_id, conversation_state.flow_config)
            
            # Get available slots for time question
            slots_for_time = None
            if next_field_id == "time":
                slots_for_time = conversation_state.flow_config.get("_available_slots")
            
            return {
                "valid": True,
                "next_field": next_field_def,
                "question": self._generate_question(next_field_def, available_slots=slots_for_time)
            }
        
        # All fields collected - ready to book
        return {
            "valid": True,
            "complete": True,
            "collected_data": conversation_state.collected_fields,
            "confirmation_message": self._generate_confirmation(conversation_state.collected_fields),
            "use_buttons": True,
            "buttons": [
                {"id": "confirm_yes", "title": " Yes, Confirm"},
                {"id": "confirm_no", "title": " No, Cancel"}
            ]
        }

    def _get_field_definition(self, field_id: str, config: Dict) -> Dict:
        """Helper to find field definition in config."""
        fields = config.get("fields", self.minimal_fields)
        for f in fields:
            if f["id"] == field_id:
                return f
        # Fallback to minimal fields
        for f in self.minimal_fields:
            if f["id"] == field_id:
                return f
        return {"id": field_id, "label": field_id, "type": "text"}
        
    def _legacy_process_response(self, session, current_field, user_id, response):
        """Legacy in-memory session handler."""
        # Validate the response
        validation = self.validate_field(current_field["type"], response)
        
        if not validation["valid"]:
            return {
                "valid": False,
                "error": validation["error"],
                "retry_question": self._generate_retry_question(current_field)
            }
        
        # Store the validated value
        session["collected_data"][current_field["id"]] = validation["value"]
        
        # Check for date/time conflicts
        if current_field["id"] == "time":
            collected = session["collected_data"]
            if "date" in collected:
                availability = self.check_availability(user_id, collected["date"], validation["value"])
                if not availability.get("available", True):
                    available_slots = self.get_available_slots(user_id, collected["date"])
                    return {
                        "valid": False,
                        "conflict": True,
                        "error": self._generate_conflict_message(collected["date"], available_slots)
                    }
        
        # Move to next field
        session["current_field_index"] += 1
        fields = session["fields"]
        
        # Check if we have more fields
        if session["current_field_index"] < len(fields):
            next_field = fields[session["current_field_index"]]
            return {
                "valid": True,
                "next_field": next_field,
                "question": self._generate_question(next_field)
            }
        
        # All fields collected - ready to book
        return {
            "valid": True,
            "complete": True,
            "collected_data": session["collected_data"],
            "confirmation_message": self._generate_confirmation(session["collected_data"])
        }
    
    def book_appointment(self, user_id: str, customer_phone: str) -> Dict:
        """
        Finalize and book the appointment.
        
        Args:
            user_id: Business owner's user ID
            customer_phone: Customer's phone number
            
        Returns:
            Booking result with success status and confirmation
        """
        session_key = f"{user_id}:{customer_phone}"
        session = self.booking_sessions.get(session_key)
        
        if not session or not session.get("collected_data"):
            return {"success": False, "error": "No booking data found"}
        
        data = session["collected_data"]
        
        try:
            # Final availability check
            availability = self.check_availability(user_id, data["date"], data["time"])
            if not availability.get("available", True):
                available_slots = self.get_available_slots(user_id, data["date"])
                return {
                    "success": False,
                    "conflict": True,
                    "error": self._generate_conflict_message(data["date"], available_slots)
                }
            
            # Create the appointment
            appointment_data = {
                "user_id": user_id,
                "customer_name": data.get("name", ""),
                "customer_phone": data.get("phone", customer_phone),
                "customer_email": data.get("email"),
                "date": data["date"],
                "time": data["time"],
                "status": "pending",
                "source": "ai",
                "notes": self._format_custom_fields(data)
            }
            
            result = self.supabase.table("appointments").insert(appointment_data).execute()
            
            if result.data:
                # Clear the session
                del self.booking_sessions[session_key]
                
                return {
                    "success": True,
                    "appointment": result.data[0],
                    "confirmation": self._generate_booking_success(data)
                }
            
            return {"success": False, "error": "Failed to create appointment"}
            
        except Exception as e:
            logger.error(f"Error booking appointment: {e}")
            return {"success": False, "error": str(e)}
    
    def cancel_session(self, user_id: str, customer_phone: str) -> bool:
        """Cancel an active booking session."""
        session_key = f"{user_id}:{customer_phone}"
        if session_key in self.booking_sessions:
            del self.booking_sessions[session_key]
            return True
        return False
    
    def get_session(self, user_id: str, customer_phone: str) -> Optional[Dict]:
        """Get current booking session if exists."""
        session_key = f"{user_id}:{customer_phone}"
        return self.booking_sessions.get(session_key)
    
    # Message generation helpers
    def _generate_question(self, field: Dict, is_first: bool = False, available_slots: List[str] = None) -> str:
        """Generate a conversational question for a field."""
        prefix = "Great! Let's book your appointment. 📅\n\n" if is_first else ""
        
        questions = {
            "service": f"{prefix}What service would you like to book? 💇✨",
            "date": "📅 What date would you like to book?\n\n(Please use DD-MM-YY format, e.g., 15-01-26 for 15th Jan 2026, or say 'tomorrow')",
            "time": self._generate_time_question(available_slots),
            "name": "What is your full name?",
            "phone": "And what's your phone number?",
            "email": "What's your email address?",
        }
        
        # Use predefined question or field label
        if field["id"] in questions:
            return questions[field["id"]]
        
        return f"Please provide: {field['label']}"
    
    def _generate_time_question(self, available_slots: List[str] = None) -> str:
        """Generate time question with available slots if known."""
        base_question = "⏰ What time works best for you?"
        
        if available_slots and len(available_slots) > 0:
            # Show available slots
            slots_display = []
            for slot in available_slots[:6]:  # Show max 6 slots
                try:
                    t = datetime.strptime(slot, "%H:%M")
                    slots_display.append(t.strftime("%I:%M %p"))
                except:
                    slots_display.append(slot)
            
            slots_str = ", ".join(slots_display)
            return f"{base_question}\n\nAvailable times: {slots_str}"
        
        return f"{base_question}\n\n(e.g., 10:00 AM, 2:30 PM)"
    
    def _generate_retry_question(self, field: Dict) -> str:
        """Generate a retry message when validation fails."""
        return f"Could you please provide your {field['label'].lower()} again?"
    
    def _generate_conflict_message(self, date_str: str, available_slots: List[str]) -> str:
        """Generate message for time slot conflict."""
        if not available_slots:
            return f"I'm sorry, there are no available slots on {date_str}. Would you like to try a different date?"
        
        # Show up to 5 available slots
        slots_to_show = available_slots[:5]
        slots_str = ", ".join(slots_to_show)
        
        return f"I'm sorry, that time slot is already booked. Available times on {date_str} are: {slots_str}. Which one would you prefer?"
    
    def _generate_confirmation(self, data: Dict) -> str:
        """Generate booking summary for confirmation."""
        name = data.get("name", "there")
        date_str = data.get("date", "")
        time_str = data.get("time", "")
        service = data.get("service", "")
        
        # Format date for display (DD-MM-YY format)
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d")
            date_display = d.strftime("%d-%m-%y")  # DD-MM-YY format
        except:
            date_display = date_str
        
        # Format time for display (12-hour format)
        try:
            t = datetime.strptime(time_str, "%H:%M")
            time_display = t.strftime("%I:%M %p")
        except:
            time_display = time_str
        
        summary = f"""Perfect, {name}! Here's your appointment summary: ✨

 Service: {service}
 Date: {date_display}
 Time: {time_display}
 Phone: {data.get('phone', 'N/A')}

Should I confirm this booking?"""
        
        return summary
    
    def _generate_booking_success(self, data: Dict) -> str:
        """Generate success message after booking."""
        name = data.get("name", "").split()[0] if data.get("name") else "there"
        date_str = data.get("date", "")
        time_str = data.get("time", "")
        service = data.get("service", "")
        
        # Format date for display (DD-MM-YY)
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d")
            date_display = d.strftime("%d-%m-%y")  # DD-MM-YY format
        except:
            date_display = date_str
        
        # Format time for display (12-hour)
        try:
            t = datetime.strptime(time_str, "%H:%M")
            time_display = t.strftime("%I:%M %p")
        except:
            time_display = time_str
        
        service_line = f"\n💇 Service: {service}" if service else ""
        
        return f"""Your appointment is confirmed!

Hi {name}, we've booked your appointment:{service_line}
📅 Date: {date_display}
🕐 Time: {time_display}

You'll receive a reminder before your appointment. See you soon! 🎉"""
    
    def _format_custom_fields(self, data: Dict) -> str:
        """Format custom fields for storage in notes."""
        custom_fields = []
        core_fields = {"name", "phone", "date", "time", "email"}
        
        for key, value in data.items():
            if key not in core_fields:
                custom_fields.append(f"{key}: {value}")
        
        return "\n".join(custom_fields) if custom_fields else None
