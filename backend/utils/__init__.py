"""
Backend utilities package.
"""
from .validators import is_valid_uuid, is_opaque_button_id, sanitize_phone
from .availability import (
    compute_sellable_options,
    get_stock_for_selection,
    is_product_sellable,
    get_sellable_sizes,
    get_sellable_colors,
    filter_sellable_products
)
from .button_registry import (
    register_button,
    resolve_button,
    get_allowed_quantity,
    clear_expired,
    clear_all
)
from .metrics import (
    increment as increment_metric,
    get_metrics,
    STOCK_BLOCK,
    INVALID_SELECTION,
    RESERVATION_FAILURE,
    RESERVATION_SUCCESS,
    ORDER_BLOCKED,
)

__all__ = [
    # Validators
    'is_valid_uuid',
    'is_opaque_button_id',
    'sanitize_phone',
    # Availability
    'compute_sellable_options',
    'get_stock_for_selection',
    'is_product_sellable',
    'get_sellable_sizes',
    'get_sellable_colors',
    'filter_sellable_products',
    # Button registry
    'register_button',
    'resolve_button',
    'get_allowed_quantity',
    'clear_expired',
    'clear_all',
    # Metrics
    'increment_metric',
    'get_metrics',
    'STOCK_BLOCK',
    'INVALID_SELECTION',
    'RESERVATION_FAILURE',
    'RESERVATION_SUCCESS',
    'ORDER_BLOCKED',
]
