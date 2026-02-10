"""
Domain Context Resolution for Multi-Product SaaS Architecture

This module provides domain detection and capability mapping for the 
domain-based product isolation system.

Supported Products:
- shop: Commerce/e-commerce product (shop.flowauxi.com)
- showcase: Portfolio/catalog product (showcase.flowauxi.com) 
- marketing: Campaigns/messaging product (marketing.flowauxi.com)
- dashboard: Legacy monolithic dashboard (flowauxi.com)

Enterprise Rule: Domain context ALWAYS wins over manual capability toggles.
Users on shop.flowauxi.com see commerce features regardless of individual preferences.
"""

from typing import Literal, Optional
from flask import Request

# Product domain types
ProductDomain = Literal["shop", "showcase", "marketing", "dashboard"]


def resolve_domain_from_request(request: Request) -> ProductDomain:
    """
    Resolve product domain from HTTP request hostname.
    
    Supports:
    - Production subdomains (shop.flowauxi.com, showcase.flowauxi.com, etc.)
    - Development environments (localhost, vercel.app preview URLs)
    - Path-based detection for local dev
    
    Args:
        request: Flask Request object
        
    Returns:
        ProductDomain: Detected product domain
        
    Examples:
        >>> resolve_domain_from_request(request_with_host("shop.flowauxi.com"))
        "shop"
        >>> resolve_domain_from_request(request_with_host("localhost:3000", "/shop/dashboard"))
        "shop"
    """
    hostname = request.host.lower()
    
    # Production subdomain detection
    if hostname.startswith("shop."):
        return "shop"
    elif hostname.startswith("showcase."):
        return "showcase"
    elif hostname.startswith("marketing."):
        return "marketing"
    
    # Development environment detection
    if "localhost" in hostname or "vercel.app" in hostname:
        path = request.path.lower()
        
        # Check path prefixes for product hints
        if path.startswith("/shop"):
            return "shop"
        elif path.startswith("/showcase"):
            return "showcase"
        elif path.startswith("/marketing"):
            return "marketing"
    
    # Default to legacy dashboard
    return "dashboard"


def get_required_capability(domain: ProductDomain) -> Optional[str]:
    """
    Get the database capability column name required for a given domain.
    
    Args:
        domain: Product domain
        
    Returns:
        str: Capability column name (e.g., 'shop_enabled'), or None if no capability required
        
    Examples:
        >>> get_required_capability("shop")
        "shop_enabled"
        >>> get_required_capability("dashboard")
        None
    """
    capability_map = {
        "shop": "shop_enabled",
        "showcase": "showcase_enabled",
        "marketing": "marketing_enabled",
        # dashboard has no specific capability requirement (legacy access)
    }
    return capability_map.get(domain)


def get_domain_metadata(domain: ProductDomain) -> dict:
    """
    Get metadata for a product domain (SEO base, name, etc.).
    
    Args:
        domain: Product domain
        
    Returns:
        dict: Domain metadata including name, base_url, and description
    """
    metadata = {
        "shop": {
            "name": "Flowauxi Shop",
            "base_url": "https://shop.flowauxi.com",
            "description": "Commerce and e-commerce management platform",
            "required_capability": "shop_enabled",
        },
        "showcase": {
            "name": "Flowauxi Showcase",
            "base_url": "https://showcase.flowauxi.com",
            "description": "Portfolio and catalog showcase",
            "required_capability": "showcase_enabled",
        },
        "marketing": {
            "name": "Flowauxi Marketing",
            "base_url": "https://marketing.flowauxi.com",
            "description": "Campaigns and bulk messaging platform",
            "required_capability": "marketing_enabled",
        },
        "dashboard": {
            "name": "Flowauxi Dashboard",
            "base_url": "https://flowauxi.com",
            "description": "Unified dashboard (legacy)",
            "required_capability": None,
        },
    }
    return metadata.get(domain, metadata["dashboard"])


def should_auto_grant_capability(domain: ProductDomain, user_capabilities: dict) -> bool:
    """
    Determine if a capability should be auto-granted for a user accessing a domain.
    
    Auto-grant rules:
    - Shop capability: Always auto-grant (backwards compatibility)
    - Showcase: Only if user has existing showcase data
    - Marketing: Manual opt-in only
    
    Args:
        domain: Product domain being accessed
        user_capabilities: User's current capabilities from database
        
    Returns:
        bool: True if capability should be auto-granted
        
    Security Note:
        This is a server-side trust decision. Frontend NEVER sets capabilities.
    """
    required_cap = get_required_capability(domain)
    
    if not required_cap:
        return False  # No capability required
    
    # Already has capability
    if user_capabilities.get(required_cap):
        return False
    
    # Auto-grant rules by domain
    if domain == "shop":
        # Shop is auto-granted for all users (backwards compatibility)
        return True
    elif domain == "showcase":
        # Auto-grant showcase if user has showcase data
        # (Implementation would check for existing showcase_items)
        return False  # For now, require manual enable
    elif domain == "marketing":
        # Marketing is always opt-in
        return False
    
    return False
