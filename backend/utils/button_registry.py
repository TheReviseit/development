"""
Opaque Button ID Registry.

⚠️ NEVER encode product info in button IDs.
Use random tokens with server-side lookup.

Why:
- Prevents injection bugs
- Prevents UUID parsing errors
- Allows schema evolution without breaking clients
"""
import uuid
import time
import logging
from typing import Dict, Any, Optional, List
from threading import Lock

logger = logging.getLogger('reviseit.utils.button_registry')

# Thread-safe registry
_registry_lock = Lock()
_button_registry: Dict[str, Dict[str, Any]] = {}

# TTL for button mappings (15 minutes)
BUTTON_TTL_SECONDS = 900


def register_button(
    product_id: str,
    variant_id: Optional[str] = None,
    size: Optional[str] = None,
    color: Optional[str] = None,
    product_name: Optional[str] = None,
    available_sizes: Optional[List[str]] = None,
    available_colors: Optional[List[str]] = None,
    stock: Optional[int] = None,
    max_qty: Optional[int] = None
) -> str:
    """
    Generate opaque button ID and store product snapshot.
    
    ENTERPRISE-GRADE: This stores an immutable snapshot of the product state
    at the time the button was rendered. This ensures button clicks always
    resolve to the correct product, even after pagination or state changes.
    
    Args:
        product_id: Product UUID
        variant_id: Optional variant UUID
        size: Optional pre-selected size (or None if user will select)
        color: Optional pre-selected color (or None if user will select)
        product_name: Product name for logging/display
        available_sizes: List of sizes available for selection
        available_colors: List of colors available for selection
        stock: Current stock at time of rendering (for revalidation)
        max_qty: Maximum orderable quantity
        
    Returns:
        Opaque button ID (e.g., "btn_8f7a2c0e")
    """
    btn_id = f"btn_{uuid.uuid4().hex[:8]}"
    now = time.time()
    
    with _registry_lock:
        _button_registry[btn_id] = {
            # SCHEMA VERSION: Allows future evolution without breaking old buttons
            "schema_version": 1,
            # Core product identity
            "product_id": product_id,
            "variant_id": variant_id,
            # AMAZON-GRADE: Authoritative scope - NEVER re-infer this downstream
            "scope": "VARIANT" if variant_id else "BASE",
            "size": size,
            "color": color,
            "product_name": product_name,
            # AMAZON-GRADE: Snapshot fields for revalidation
            "sizes": available_sizes or [],
            "colors": available_colors or [],
            "stock": stock,
            "max_qty": max_qty,
            # Timing (defensive - works even if Redis TTL fails)
            "created_at": now,
            "expires_at": now + BUTTON_TTL_SECONDS
        }
    
    logger.debug(f"Registered button {btn_id} → {product_name or product_id} (sizes={available_sizes}, colors={available_colors})")
    return btn_id


def resolve_button(btn_id: str) -> Optional[Dict[str, Any]]:
    """
    Resolve opaque button ID to product info.
    
    Args:
        btn_id: Opaque button ID
        
    Returns:
        Product info dict or None if not found/expired
    """
    now = time.time()
    
    with _registry_lock:
        entry = _button_registry.get(btn_id)
        
        if not entry:
            logger.warning(f"Button not found: {btn_id}")
            return None
        
        # DEFENSIVE: Check expires_at first (survives Redis TTL failures)
        expires_at = entry.get('expires_at', 0)
        if now > expires_at:
            del _button_registry[btn_id]
            logger.warning(f"Button expired: {btn_id} (expires_at passed)")
            return None
        
        # Fallback: Check created_at + TTL (for old snapshots without expires_at)
        created_at = entry.get('created_at', 0)
        if created_at > 0 and (now - created_at) > BUTTON_TTL_SECONDS:
            del _button_registry[btn_id]
            logger.warning(f"Button expired: {btn_id} (age={now - created_at:.0f}s)")
            return None
        
        return entry


def get_allowed_quantity(snapshot: Dict[str, Any], current_stock: int) -> int:
    """
    Calculate allowed quantity for an order, protecting against oversells.
    
    AMAZON-GRADE: Uses min(snapshot_max_qty, current_stock) to prevent
    edge-case oversells during long conversations where stock changes.
    
    Args:
        snapshot: Button snapshot from resolve_button()
        current_stock: Current stock from live inventory check
        
    Returns:
        Maximum allowed quantity for this order
    """
    snapshot_max_qty = snapshot.get('max_qty') or float('inf')
    snapshot_stock = snapshot.get('stock') or float('inf')
    
    # Most conservative: min of all constraints
    allowed = min(snapshot_max_qty, snapshot_stock, current_stock)
    
    # Ensure at least 0
    return max(0, int(allowed) if allowed != float('inf') else current_stock)


def clear_expired():
    """Clear expired buttons. Call periodically."""
    now = time.time()
    expired = []
    
    with _registry_lock:
        for btn_id, entry in _button_registry.items():
            # Use expires_at if available, fallback to created_at + TTL
            expires_at = entry.get('expires_at')
            if expires_at:
                if now > expires_at:
                    expired.append(btn_id)
            else:
                age = now - entry.get('created_at', 0)
                if age > BUTTON_TTL_SECONDS:
                    expired.append(btn_id)
        
        for btn_id in expired:
            del _button_registry[btn_id]
    
    if expired:
        logger.info(f"Cleared {len(expired)} expired buttons")


def clear_all():
    """Clear all buttons. Use for testing."""
    with _registry_lock:
        _button_registry.clear()


def get_registry_size() -> int:
    """Get number of registered buttons."""
    with _registry_lock:
        return len(_button_registry)
