"""
Username Utilities
Enterprise-grade username validation, generation, and management

Features:
- Format validation (3-30 chars, alphanumeric + hyphens)
- Case-insensitive uniqueness checking
- Reserved word blocking
- Smart collision handling with numeric suffixes
- Unicode/emoji stripping
- Intelligent username generation from business names
"""

import re
import logging
import unicodedata
from typing import Optional, List, Tuple
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

# Username validation regex
# - Must start and end with alphanumeric
# - Can contain hyphens in the middle
# - 3-30 characters total
USERNAME_REGEX = re.compile(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')

# Min/max length
MIN_LENGTH = 3
MAX_LENGTH = 30


def sanitize_for_username(text: str) -> str:
    """
    Convert arbitrary text to username-safe format
    
    - Strips unicode/emoji
    - Converts to lowercase
    - Replaces spaces with hyphens
    - Removes special characters
    
    Args:
        text: Input text (business name, display name, etc.)
    
    Returns:
        Sanitized username base
    """
    if not text:
        return ""
    
    # Normalize unicode and remove accents
    # NFD = Canonical Decomposition
    text = unicodedata.normalize('NFD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    
    # Convert to lowercase
    text = text.lower()
    
    # Replace spaces and underscores with hyphens
    text = re.sub(r'[\s_]+', '-', text)
    
    # Remove all non-alphanumeric except hyphens
    text = re.sub(r'[^a-z0-9-]', '', text)
    
    # Remove consecutive hyphens
    text = re.sub(r'-+', '-', text)
    
    # Remove leading/trailing hyphens
    text = text.strip('-')
    
    # Truncate to max length
    if len(text) > MAX_LENGTH:
        text = text[:MAX_LENGTH].rstrip('-')
    
    return text


def validate_username_format(username: str) -> Tuple[bool, Optional[str]]:
    """
    Validate username format (does not check database availability)
    
    Rules:
    - 3-30 characters
    - Lowercase alphanumeric + hyphens
    - Must start/end with alphanumeric
    - No consecutive hyphens
    
    Args:
        username: Username to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not username:
        return False, "Username is required"
    
    # Check length
    if len(username) < MIN_LENGTH:
        return False, f"Username must be at least {MIN_LENGTH} characters"
    
    if len(username) > MAX_LENGTH:
        return False, f"Username must be at most {MAX_LENGTH} characters"
    
    # Check format
    if not USERNAME_REGEX.match(username.lower()):
        return False, "Username can only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphens)"
    
    # Check for consecutive hyphens
    if '--' in username:
        return False, "Username cannot contain consecutive hyphens"
    
    return True, None


def is_reserved_username(username: str) -> bool:
    """
    Check if username is in reserved list
    
    Args:
        username: Username to check (case-insensitive)
    
    Returns:
        True if reserved, False otherwise
    """
    try:
        db = get_supabase_client()
        username_lower = username.lower().strip()
        
        result = db.table('reserved_usernames').select('username_lower').eq(
            'username_lower', username_lower
        ).limit(1).execute()
        
        return bool(result.data)
    
    except Exception as e:
        logger.error(f"Error checking reserved username '{username}': {e}")
        # Fail safe: assume reserved if we can't check
        return True


def is_username_available(username: str, exclude_user_id: Optional[str] = None) -> bool:
    """
    Check if username is available in database
    
    Args:
        username: Username to check (case-insensitive)
        exclude_user_id: User ID to exclude (for checking own username)
    
    Returns:
        True if available, False if taken
    """
    try:
        db = get_supabase_client()
        username_lower = username.lower().strip()
        
        query = db.table('users').select('id').eq('username_lower', username_lower)
        
        # Exclude current user (for username changes)
        if exclude_user_id:
            query = query.neq('firebase_uid', exclude_user_id)
        
        result = query.limit(1).execute()
        
        # Available if no results
        return len(result.data) == 0
    
    except Exception as e:
        logger.error(f"Error checking username availability '{username}': {e}")
        # Fail safe: assume unavailable if we can't check
        return False


def check_username_availability(
    username: str, 
    user_id: Optional[str] = None
) -> dict:
    """
    Complete username validation and availability check
    
    Returns comprehensive status for frontend display
    
    Args:
        username: Username to check
        user_id: Current user ID (for change validation)
    
    Returns:
        Dict with validation results:
        {
            "available": bool,
            "valid": bool,
            "error": str (if any),
            "suggestions": list (if unavailable)
        }
    """
    # Format validation
    is_valid, error = validate_username_format(username)
    if not is_valid:
        return {
            "available": False,
            "valid": False,
            "error": error
        }
    
    username_lower = username.lower().strip()
    
    # Reserved check
    if is_reserved_username(username_lower):
        return {
            "available": False,
            "valid": True,
            "error": "This username is reserved and cannot be used",
            "suggestions": generate_username_suggestions(username, 3)
        }
    
    # Availability check
    if not is_username_available(username_lower, user_id):
        return {
            "available": False,
            "valid": True,
            "error": "This username is already taken",
            "suggestions": generate_username_suggestions(username, 3)
        }
    
    # All checks passed
    return {
        "available": True,
        "valid": True
    }


def generate_username_suggestions(base: str, count: int = 5) -> List[str]:
    """
    Generate username suggestions when preferred username is taken
    
    Strategy:
    1. base-1, base-2, base-3 (numeric suffixes)
    2. base-shop, base-store (contextual suffixes)
    3. base + random 2-digit number
    
    Args:
        base: Base username
        count: Number of suggestions to generate
    
    Returns:
        List of available username suggestions
    """
    suggestions = []
    base_sanitized = sanitize_for_username(base)
    
    if not base_sanitized:
        return []
    
    # Try numeric suffixes first
    for i in range(1, count + 10):  # Try more than needed
        candidate = f"{base_sanitized}-{i}"
        
        # Check length
        if len(candidate) > MAX_LENGTH:
            continue
        
        # Check if available
        if (not is_reserved_username(candidate) and 
            is_username_available(candidate)):
            suggestions.append(candidate)
            
            if len(suggestions) >= count:
                break
    
    # If still need more, try contextual suffixes
    if len(suggestions) < count:
        contextual = ['shop', 'store', 'co', 'official', 'hq']
        for suffix in contextual:
            if len(suggestions) >= count:
                break
            
            candidate = f"{base_sanitized}-{suffix}"
            
            if len(candidate) <= MAX_LENGTH:
                if (not is_reserved_username(candidate) and 
                    is_username_available(candidate)):
                    suggestions.append(candidate)
    
    return suggestions[:count]


def generate_username_for_migration(
    business_name: Optional[str],
    full_name: Optional[str],
    email: Optional[str],
    user_id: str
) -> str:
    """
    Generate username for existing users during migration
    
    Priority:
    1. Business name
    2. Full name
    3. Email prefix
    4. Fallback: user{last_8_of_uid}
    
    Handles collisions with numeric suffixes
    
    Args:
        business_name: User's business name
        full_name: User's full name
        email: User's email
        user_id: Firebase UID
    
    Returns:
        Available username (guaranteed)
    """
    # Try business name first
    if business_name:
        base = sanitize_for_username(business_name)
        if base and len(base) >= MIN_LENGTH:
            username = find_available_username(base, user_id)
            if username:
                return username
    
    # Try full name
    if full_name:
        base = sanitize_for_username(full_name)
        if base and len(base) >= MIN_LENGTH:
            username = find_available_username(base, user_id)
            if username:
                return username
    
    # Try email prefix
    if email and '@' in email:
        email_prefix = email.split('@')[0]
        base = sanitize_for_username(email_prefix)
        if base and len(base) >= MIN_LENGTH:
            username = find_available_username(base, user_id)
            if username:
                return username
    
    # Fallback: user{uid_suffix}
    uid_suffix = user_id.replace('-', '')[-8:]
    base = f"user{uid_suffix}"
    
    return find_available_username(base, user_id)


def find_available_username(base: str, exclude_user_id: Optional[str] = None) -> str:
    """
    Find available username starting with base
    
    Adds numeric suffixes if base is taken: base, base-1, base-2, etc.
    
    Args:
        base: Base username
        exclude_user_id: User ID to exclude
    
    Returns:
        Available username (guaranteed)
    """
    # Try base first
    if (len(base) >= MIN_LENGTH and 
        not is_reserved_username(base) and 
        is_username_available(base, exclude_user_id)):
        return base
    
    # Try with numeric suffixes
    suffix = 1
    while suffix < 10000:  # Safety limit
        candidate = f"{base}-{suffix}"
        
        # Truncate if too long
        if len(candidate) > MAX_LENGTH:
            # Remove chars from base to make room
            chars_to_remove = len(candidate) - MAX_LENGTH
            new_base = base[:-chars_to_remove].rstrip('-')
            candidate = f"{new_base}-{suffix}"
        
        if (not is_reserved_username(candidate) and 
            is_username_available(candidate, exclude_user_id)):
            return candidate
        
        suffix += 1
    
    # Should never reach here, but fallback just in case
    import time
    timestamp_suffix = str(int(time.time()))[-6:]
    return f"user{timestamp_suffix}"


def get_username_by_user_id(user_id: str) -> Optional[str]:
    """
    Get username for a given user ID
    
    Args:
        user_id: Firebase UID
    
    Returns:
        Username or None
    """
    try:
        db = get_supabase_client()
        result = db.table('users').select('username').eq(
            'firebase_uid', user_id
        ).eq('username_status', 'active').limit(1).execute()
        
        if result.data:
            return result.data[0].get('username')
        
        return None
    
    except Exception as e:
        logger.error(f"Error fetching username for user {user_id}: {e}")
        return None
