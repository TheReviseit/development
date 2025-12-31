"""
Monitoring Module for Production Observability.
Includes Flask-Profiler, Prometheus metrics, and structured logging.
"""

from .profiler import init_profiler, get_profiler_config
from .metrics import (
    init_metrics,
    track_request_latency,
    track_ai_response,
    track_cache_operation,
    get_metrics_summary,
    check_kpis,
)
from .logging_config import setup_structured_logging, get_logger

__all__ = [
    'init_profiler',
    'get_profiler_config',
    'init_metrics',
    'track_request_latency',
    'track_ai_response',
    'track_cache_operation',
    'get_metrics_summary',
    'check_kpis',
    'setup_structured_logging',
    'get_logger',
]

