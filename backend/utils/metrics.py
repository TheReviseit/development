"""
WhatsApp Inventory Metrics.

Track key metrics for ops visibility:
- whatsapp_stock_block_count
- whatsapp_invalid_selection_count
- reservation_failure_rate
"""
import logging
from threading import Lock
from typing import Dict
from datetime import datetime, timezone

logger = logging.getLogger('reviseit.metrics.inventory')

# Thread-safe counters
_metrics_lock = Lock()
_metrics: Dict[str, int] = {
    'whatsapp_stock_block_count': 0,
    'whatsapp_invalid_selection_count': 0,
    'reservation_failure_count': 0,
    'reservation_success_count': 0,
    'order_creation_blocked_count': 0,
    'reservation_early_exit_count': 0,  # SEV-1: Tracks idempotent reservation skips
}


def increment(metric_name: str, amount: int = 1) -> None:
    """Increment a metric counter."""
    with _metrics_lock:
        if metric_name in _metrics:
            _metrics[metric_name] += amount
            logger.debug(f"📊 {metric_name}: {_metrics[metric_name]}")


def get_metrics() -> Dict[str, any]:
    """Get current metrics snapshot."""
    with _metrics_lock:
        return {
            **_metrics.copy(),
            'reservation_failure_rate': _calculate_failure_rate(),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }


def _calculate_failure_rate() -> float:
    """Calculate reservation failure rate."""
    total = _metrics['reservation_success_count'] + _metrics['reservation_failure_count']
    if total == 0:
        return 0.0
    return round(_metrics['reservation_failure_count'] / total * 100, 2)


def reset() -> None:
    """Reset all metrics (for testing)."""
    with _metrics_lock:
        for key in _metrics:
            _metrics[key] = 0


# Metric names as constants
STOCK_BLOCK = 'whatsapp_stock_block_count'
INVALID_SELECTION = 'whatsapp_invalid_selection_count'
RESERVATION_FAILURE = 'reservation_failure_count'
RESERVATION_SUCCESS = 'reservation_success_count'
ORDER_BLOCKED = 'order_creation_blocked_count'
RESERVATION_EARLY_EXIT = 'reservation_early_exit_count'  # SEV-1: Idempotent skips

