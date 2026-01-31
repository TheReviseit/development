"""
⚠️ DO NOT implement stock logic outside this file.
This is the SINGLE SOURCE OF TRUTH for product availability.

Used by:
- WhatsApp product cards
- Website product display
- Checkout validation
- Admin previews
"""
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger('reviseit.utils.availability')


def compute_sellable_options(product: dict) -> List[Dict[str, Any]]:
    """
    Returns ONLY purchasable combinations of (product_id, variant_id, size).
    
    Rules:
    - Excludes any option with effective_stock <= 0
    - Excludes disabled/unavailable variants
    - Returns is_sellable=True for all returned options
    
    Args:
        product: Product dict with id, stock, variants, sizes, size_stocks
        
    Returns:
        List of sellable options with product_id, variant_id, size, stock, is_sellable
    """
    options = []
    product_id = product.get('id')
    
    if not product_id:
        return options
    
    # Process variants first (variant has priority over base)
    variants = product.get('variants', []) or []
    for variant in variants:
        if not isinstance(variant, dict):
            continue
            
        # Skip unavailable variants
        if not variant.get('is_available', True):
            continue
        
        variant_id = variant.get('id')
        variant_stock = variant.get('stock', 0) or 0
        variant_size = variant.get('size')
        variant_color = variant.get('color')
        
        # Check variant-level size stocks if present
        variant_size_stocks = variant.get('size_stocks', {}) or {}
        
        if variant_size_stocks:
            # Variant has size-level stock tracking
            for size, size_stock in variant_size_stocks.items():
                if (size_stock or 0) > 0:
                    options.append({
                        'product_id': product_id,
                        'variant_id': variant_id,
                        'size': size,
                        'color': variant_color,
                        'stock': size_stock,
                        'is_sellable': True
                    })
        elif variant_stock > 0:
            # Variant has single stock count
            options.append({
                'product_id': product_id,
                'variant_id': variant_id,
                'size': variant_size,
                'color': variant_color,
                'stock': variant_stock,
                'is_sellable': True
            })
    
    # CRITICAL FIX: Process base product size_stocks ALWAYS (not just when no variants)
    # This ensures size-specific stock lookup works even when product has variants
    size_stocks = product.get('size_stocks', {}) or {}
    sizes = product.get('sizes', []) or []
    base_stock = product.get('stock', 0) or 0
    
    if sizes and size_stocks:
        # Base product has size-level stock - ALWAYS add these
        for size in sizes:
            stock = size_stocks.get(size, 0) or 0
            if stock > 0:
                options.append({
                    'product_id': product_id,
                    'variant_id': None,
                    'size': size,
                    'color': None,
                    'stock': stock,
                    'is_sellable': True
                })
    elif not variants and base_stock > 0:
        # Base product with single stock count (only if no variants)
        options.append({
            'product_id': product_id,
            'variant_id': None,
            'size': None,
            'color': None,
            'stock': base_stock,
            'is_sellable': True
        })
    
    return options


def get_stock_for_selection(
    product: dict,
    variant_id: Optional[str] = None,
    size: Optional[str] = None,
    base_only: bool = False
) -> int:
    """
    Get available stock for a specific selection.
    
    AMAZON-GRADE: This is the single source of truth for quantity validation.
    
    Args:
        product: Product dict with id, stock, variants, sizes, size_stocks
        variant_id: Optional variant ID to check stock for
        size: Optional size to check stock for
        base_only: If True, only check base product stock (ignore variants)
        
    Returns:
        Available stock quantity (0 if not found/out of stock)
    """
    if not product or not isinstance(product, dict):
        return 0
    
    # CRITICAL: If base_only=True, go directly to base product size_stocks
    # This prevents mixing variant stock with base product stock
    if base_only or (variant_id is None and size):
        size_stocks = product.get('size_stocks', {}) or {}
        if size and size in size_stocks:
            stock = size_stocks.get(size, 0) or 0
            logger.info(f"📦 BASE_ONLY stock check: size={size}, stock={stock}")
            return stock
        # If no size or size not found, return 0 for base_only
        if base_only:
            return 0
    
    # Check variant stock if variant_id specified
    # AMAZON-GRADE: Variant stock is completely separate from base stock
    if variant_id:
        variants = product.get('variants', []) or []
        for variant in variants:
            if variant.get('id') == variant_id:
                logger.info(f"📦 VARIANT stock path: variant_id={variant_id}, size={size}")
                variant_size_stocks = variant.get('size_stocks', {}) or {}
                
                if size and size in variant_size_stocks:
                    stock = variant_size_stocks.get(size, 0) or 0
                    logger.info(f"📦 VARIANT size stock: {size}={stock}")
                    return stock
                
                # FAIL-FAST: Size not in variant's size_stocks
                if size and size not in variant_size_stocks:
                    logger.warning(f"⚠️ Invalid size '{size}' for variant {variant_id} - available: {list(variant_size_stocks.keys())}")
                    return 0
                
                # No size specified, return variant's base stock
                stock = variant.get('stock', 0) or 0
                logger.info(f"📦 VARIANT base stock (no size): {stock}")
                return stock
        
        # Variant ID specified but not found - this is a data error
        logger.warning(f"⚠️ Variant {variant_id} not found in product variants")
        return 0
    
    # Fallback to compute_sellable_options for general lookup
    options = compute_sellable_options(product)
    
    if not options:
        return 0
    
    # Find matching option
    for opt in options:
        # Match variant if specified
        if variant_id and opt.get('variant_id') != variant_id:
            continue
        
        # Match size if specified
        if size and opt.get('size') != size:
            continue
        
        # If no filters or all filters match, return stock
        if (variant_id is None or opt.get('variant_id') == variant_id) and \
           (size is None or opt.get('size') == size):
            return opt.get('stock', 0)
    
    # No matching option found
    return 0


def is_product_sellable(product: dict) -> bool:
    """
    Quick check if product has ANY sellable options.
    
    Rules:
    - Products with is_available=False are NOT sellable
    - Products with explicit stock tracking use compute_sellable_options
    - Products WITHOUT stock tracking are assumed available (backwards compatibility)
    
    Args:
        product: Product dict
        
    Returns:
        True if at least one option is sellable
    """
    # Explicit unavailability flag
    if product.get('is_available') is False:
        return False
    
    # Check if product has stock tracking enabled
    has_stock_tracking = (
        product.get('stock') is not None or
        product.get('size_stocks') or
        any(v.get('stock') is not None for v in (product.get('variants') or []))
    )
    
    if has_stock_tracking:
        # Use centralized logic
        return len(compute_sellable_options(product)) > 0
    else:
        # No stock tracking = backwards compatible, consider sellable
        logger.debug(f"📦 No stock tracking for {product.get('name')}, assuming available")
        return True


def get_sellable_sizes(product: dict, variant_id: Optional[str] = None, base_only: bool = False) -> List[str]:
    """
    Get list of sellable sizes for a product/variant.
    
    Args:
        product: Product dict
        variant_id: Optional variant ID to filter by
        base_only: If True, only return sizes from base product (ignore variants)
        
    Returns:
        List of size strings that are in stock
    """
    # CRITICAL: If base_only, return only sizes from base product size_stocks
    if base_only or (variant_id is None):
        size_stocks = product.get('size_stocks', {}) or {}
        sizes = product.get('sizes', []) or []
        sellable = []
        for size in sizes:
            stock = size_stocks.get(size, 0) or 0
            if stock > 0 and size not in sellable:
                sellable.append(size)
        if sellable:
            logger.info(f"📏 BASE_ONLY sizes: {sellable}")
            return sellable
        # If base_only and no sellable sizes, return empty
        if base_only:
            return []
    
    # For variant or fallback, use compute_sellable_options
    options = compute_sellable_options(product)
    sizes = []
    
    for opt in options:
        if variant_id and opt.get('variant_id') != variant_id:
            continue
        size = opt.get('size')
        if size and size not in sizes:
            sizes.append(size)
    
    return sizes


def get_sellable_colors(product: dict) -> List[str]:
    """
    Get list of sellable colors for a product.
    
    Args:
        product: Product dict
        
    Returns:
        List of color strings that have stock
    """
    options = compute_sellable_options(product)
    colors = []
    
    for opt in options:
        color = opt.get('color')
        if color and color not in colors:
            colors.append(color)
    
    return colors


def filter_sellable_products(products: List[dict], max_count: int = 5) -> List[dict]:
    """
    Filter products to only those with sellable options.
    Respects max count (e.g., WhatsApp 5-card limit).
    
    Args:
        products: List of product dicts
        max_count: Maximum number of products to return
        
    Returns:
        Filtered list of sellable products
    """
    sellable = []
    
    for p in products:
        if not isinstance(p, dict):
            continue
        if is_product_sellable(p):
            sellable.append(p)
            if len(sellable) >= max_count:
                break
        else:
            logger.debug(f"⏭️ OOS: {p.get('name')}")
    
    return sellable
