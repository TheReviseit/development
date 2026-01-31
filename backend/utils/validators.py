"""
UUID and input validation utilities.
"""
import uuid
import re


def is_valid_uuid(value: str) -> bool:
    """
    Validate UUID format.
    Rejects semantic IDs like 'Free Size_Blue'.
    
    Args:
        value: String to validate
        
    Returns:
        True if valid UUID, False otherwise
    """
    if not value:
        return False
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def is_opaque_button_id(value: str) -> bool:
    """
    Check if value is an opaque button ID (btn_xxxxxxxx format).
    
    Args:
        value: String to check
        
    Returns:
        True if matches opaque button format
    """
    if not value:
        return False
    return bool(re.match(r'^btn_[a-f0-9]{8}$', value))


def sanitize_phone(phone: str) -> str:
    """
    Sanitize phone number to digits only.
    
    Args:
        phone: Raw phone string
        
    Returns:
        Cleaned phone number
    """
    if not phone:
        return ""
    return re.sub(r'[^\d]', '', phone)
