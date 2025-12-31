"""
Appointment Handler for AI-driven appointment booking.
Handles the conversational flow for collecting appointment information
and booking appointments through the AI bot.
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date, time, timedelta
import re

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
        
        # Default fields for minimal mode
        self.minimal_fields = [
            {"id": "name", "label": "Full Name", "type": "text", "required": True, "order": 1},
            {"id": "phone", "label": "Phone Number", "type": "phone", "required": True, "order": 2},
            {"id": "date", "label": "Appointment Date", "type": "date", "required": True, "order": 3},
            {"id": "time", "label": "Appointment Time", "type": "time", "required": True, "order": 4},
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
        Check slot availability for a given date/time.
        
        Args:
            user_id: Business owner's user ID
            check_date: Date to check (YYYY-MM-DD format)
            check_time: Optional specific time to check (HH:MM format)
            
        Returns:
            Dict with availability info and available slots
        """
        try:
            # Get existing appointments for the date
            result = self.supabase.table("appointments").select("time, duration, status").eq("user_id", user_id).eq("date", check_date).neq("status", "cancelled").execute()
            
            booked_times = []
            if result.data:
                for apt in result.data:
                    booked_times.append(apt["time"])
            
            # If checking specific time
            if check_time:
                is_available = check_time not in booked_times
                return {
                    "available": is_available,
                    "date": check_date,
                    "time": check_time,
                    "booked_times": booked_times
                }
            
            # Return all booked times for the date
            return {
                "date": check_date,
                "booked_times": booked_times,
                "booked_count": len(booked_times)
            }
            
        except Exception as e:
            logger.error(f"Error checking availability: {e}")
            return {"available": False, "error": str(e)}
    
    def get_available_slots(self, user_id: str, check_date: str, config: Dict = None) -> List[str]:
        """
        Get list of available time slots for a date.
        
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
                result = self.supabase.table("ai_capabilities").select("appointment_business_hours").eq("user_id", user_id).single().execute()
                business_hours = result.data.get("appointment_business_hours", {"start": "09:00", "end": "18:00", "duration": 60}) if result.data else {"start": "09:00", "end": "18:00", "duration": 60}
            else:
                business_hours = config.get("business_hours", {"start": "09:00", "end": "18:00", "duration": 60})
            
            # Get booked slots
            availability = self.check_availability(user_id, check_date)
            booked_times = availability.get("booked_times", [])
            
            # Generate available slots
            start_hour, start_min = map(int, business_hours["start"].split(":"))
            end_hour, end_min = map(int, business_hours["end"].split(":"))
            duration = business_hours.get("duration", 60)
            
            available_slots = []
            current = datetime.combine(date.today(), time(start_hour, start_min))
            end = datetime.combine(date.today(), time(end_hour, end_min))
            
            while current < end:
                time_str = current.strftime("%H:%M")
                if time_str not in booked_times:
                    available_slots.append(time_str)
                current += timedelta(minutes=duration)
            
            return available_slots
            
        except Exception as e:
            logger.error(f"Error getting available slots: {e}")
            return []
    
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
            # Try to parse various date formats
            for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"]:
                try:
                    parsed = datetime.strptime(value, fmt)
                    # Check if date is in the past
                    if parsed.date() < date.today():
                        return {"valid": False, "error": "Please choose a future date for your appointment."}
                    return {"valid": True, "value": parsed.strftime("%Y-%m-%d")}
                except ValueError:
                    continue
            
            # Try natural language parsing (tomorrow, next monday, etc.)
            value_lower = value.lower()
            today = date.today()
            
            if value_lower == "today":
                return {"valid": True, "value": today.strftime("%Y-%m-%d")}
            elif value_lower == "tomorrow":
                return {"valid": True, "value": (today + timedelta(days=1)).strftime("%Y-%m-%d")}
            
            return {"valid": False, "error": "Please provide a valid date (e.g., 2025-01-15 or tomorrow)."}
        
        elif field_type == "time":
            # Parse various time formats
            for fmt in ["%H:%M", "%I:%M %p", "%I %p", "%H"]:
                try:
                    parsed = datetime.strptime(value.upper().replace(".", ""), fmt)
                    return {"valid": True, "value": parsed.strftime("%H:%M")}
                except ValueError:
                    continue
            return {"valid": False, "error": "Please provide a valid time (e.g., 10:00 or 2:30 PM)."}
        
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

        # Validate the response
        validation = self.validate_field(field_def["type"], response)
        
        if not validation["valid"]:
            return {
                "valid": False,
                "error": validation["error"],
                "retry_question": self._generate_retry_question(field_def)
            }
        
        # Check for date/time conflicts
        collected = conversation_state.collected_fields.copy()
        
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
            
            return {
                "valid": True,
                "next_field": next_field_def,
                "question": self._generate_question(next_field_def)
            }
        
        # All fields collected - ready to book
        return {
            "valid": True,
            "complete": True,
            "collected_data": conversation_state.collected_fields,
            "confirmation_message": self._generate_confirmation(conversation_state.collected_fields)
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
    def _generate_question(self, field: Dict, is_first: bool = False) -> str:
        """Generate a conversational question for a field."""
        prefix = "Great! Let's book your appointment. " if is_first else ""
        
        questions = {
            "name": f"{prefix}What is your full name?",
            "phone": "What's your phone number?",
            "email": "What's your email address?",
            "date": "When would you like to schedule your appointment? (e.g., 2025-01-15 or tomorrow)",
            "time": "What time works best for you?",
        }
        
        # Use predefined question or field label
        if field["id"] in questions:
            return questions[field["id"]]
        
        return f"Please provide: {field['label']}"
    
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
        
        # Format time for display
        try:
            t = datetime.strptime(time_str, "%H:%M")
            time_display = t.strftime("%I:%M %p")
        except:
            time_display = time_str
        
        return f"""Perfect, {name}! Here's your appointment summary:

📅 Date: {date_str}
🕐 Time: {time_display}
📞 Phone: {data.get('phone', 'N/A')}

Should I confirm this booking? (Reply 'yes' to confirm or 'no' to cancel)"""
    
    def _generate_booking_success(self, data: Dict) -> str:
        """Generate success message after booking."""
        name = data.get("name", "").split()[0] if data.get("name") else "there"
        date_str = data.get("date", "")
        time_str = data.get("time", "")
        
        try:
            t = datetime.strptime(time_str, "%H:%M")
            time_display = t.strftime("%I:%M %p")
        except:
            time_display = time_str
        
        return f"""✅ Your appointment is confirmed!

Hi {name}, we've booked your appointment for {date_str} at {time_display}.

You'll receive a reminder before your appointment. See you soon! 🎉"""
    
    def _format_custom_fields(self, data: Dict) -> str:
        """Format custom fields for storage in notes."""
        custom_fields = []
        core_fields = {"name", "phone", "date", "time", "email"}
        
        for key, value in data.items():
            if key not in core_fields:
                custom_fields.append(f"{key}: {value}")
        
        return "\n".join(custom_fields) if custom_fields else None
