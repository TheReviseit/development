"""
Structured Logging Configuration.
JSON-formatted logs for production observability.
"""

import os
import sys
import logging
from typing import Dict, Any

try:
    import structlog
    STRUCTLOG_AVAILABLE = True
except ImportError:
    STRUCTLOG_AVAILABLE = False

try:
    from pythonjsonlogger import jsonlogger
    JSON_LOGGER_AVAILABLE = True
except ImportError:
    JSON_LOGGER_AVAILABLE = False


def setup_structured_logging(
    level: str = None,
    format_type: str = None,
    include_request_id: bool = True
) -> logging.Logger:
    """
    Set up structured logging for production.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        format_type: "json" for JSON output, "text" for human-readable
        include_request_id: Whether to include request IDs
    
    Returns:
        Configured root logger
    """
    level = level or os.getenv("LOG_LEVEL", "INFO")
    # Use text format by default in development for cleaner logs
    format_type = format_type or os.getenv("LOG_FORMAT", "text")
    
    # Set up root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # Remove existing handlers
    root_logger.handlers = []
    
    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(getattr(logging, level.upper()))
    
    if format_type == "json" and JSON_LOGGER_AVAILABLE:
        # JSON formatter for production - with readable emojis
        formatter = jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
            json_ensure_ascii=False  # Allow emojis and Unicode characters
        )
    else:
        # Human-readable format for development
        formatter = logging.Formatter(
            fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)
    
    # Configure structlog if available
    if STRUCTLOG_AVAILABLE:
        _configure_structlog(format_type)
    
    # Set log levels for noisy libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("requests").setLevel(logging.WARNING)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    
    return root_logger


def _configure_structlog(format_type: str):
    """Configure structlog processors."""
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]
    
    if format_type == "json":
        processors.append(structlog.processors.JSONRenderer(ensure_ascii=False))
    else:
        processors.append(structlog.dev.ConsoleRenderer())
    
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the specified name.
    
    Args:
        name: Logger name (usually module name)
    
    Returns:
        Configured logger
    """
    if STRUCTLOG_AVAILABLE:
        return structlog.get_logger(name)
    return logging.getLogger(name)


class RequestLogMiddleware:
    """
    Middleware to log all requests with timing.
    
    Usage:
        app.wsgi_app = RequestLogMiddleware(app.wsgi_app)
    """
    
    def __init__(self, app):
        self.app = app
        self.logger = get_logger("request")
    
    def __call__(self, environ, start_response):
        import time
        import uuid
        
        # Generate request ID
        request_id = str(uuid.uuid4())[:8]
        environ["REQUEST_ID"] = request_id
        
        # Log request start
        path = environ.get("PATH_INFO", "/")
        method = environ.get("REQUEST_METHOD", "GET")
        
        start_time = time.time()
        
        def custom_start_response(status, headers, exc_info=None):
            # Add request ID to response headers
            headers.append(("X-Request-ID", request_id))
            return start_response(status, headers, exc_info)
        
        try:
            response = self.app(environ, custom_start_response)
            
            # Log request completion
            elapsed_ms = (time.time() - start_time) * 1000
            status_code = "200"  # Would need to extract from response
            
            self.logger.info(
                f"{method} {path}",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "duration_ms": round(elapsed_ms, 2),
                }
            )
            
            return response
            
        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            
            self.logger.error(
                f"{method} {path} failed",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "duration_ms": round(elapsed_ms, 2),
                    "error": str(e),
                }
            )
            raise


def log_slow_request(threshold_ms: int = 500):
    """
    Decorator to log requests slower than threshold.
    
    Usage:
        @log_slow_request(threshold_ms=200)
        def my_endpoint():
            ...
    """
    def decorator(func):
        import functools
        import time
        
        logger = get_logger(func.__module__)
        
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            result = func(*args, **kwargs)
            elapsed_ms = (time.time() - start_time) * 1000
            
            if elapsed_ms > threshold_ms:
                logger.warning(
                    f"Slow request: {func.__name__} took {elapsed_ms:.2f}ms "
                    f"(threshold: {threshold_ms}ms)"
                )
            
            return result
        
        return wrapper
    return decorator

