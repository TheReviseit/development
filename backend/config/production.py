"""
Production Configuration for WhatsApp Chatbot API.
Centralizes all configuration for Flask, Redis, Celery, database, and performance settings.
"""

import os
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from enum import Enum


class Environment(str, Enum):
    """Application environment types."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


@dataclass
class ServerConfig:
    """
    WSGI Server configuration for Gunicorn.
    Optimized for high-performance with threaded or async workers.
    """
    # Workers calculation: 2-4 workers per CPU core
    workers: int = 4
    worker_class: str = "gthread"  # Threaded (cross-platform), use "gevent" on Linux
    threads_per_worker: int = 4  # Threads per worker for gthread
    
    # Connection settings
    timeout: int = 120
    keepalive: int = 5
    max_requests: int = 1000  # Restart workers after N requests (memory leak prevention)
    max_requests_jitter: int = 50
    
    # Backlog for pending connections
    backlog: int = 2048
    
    # Enable HTTP/2 (requires nginx in front)
    enable_http2: bool = True
    
    @classmethod
    def from_env(cls) -> "ServerConfig":
        return cls(
            workers=int(os.getenv("GUNICORN_WORKERS", "4")),
            worker_class=os.getenv("GUNICORN_WORKER_CLASS", "gevent"),
            timeout=int(os.getenv("GUNICORN_TIMEOUT", "120")),
            max_requests=int(os.getenv("GUNICORN_MAX_REQUESTS", "1000")),
        )
    
    def to_gunicorn_args(self) -> str:
        """Generate Gunicorn command line arguments."""
        args = (
            f"-w {self.workers} "
            f"-k {self.worker_class} "
            f"--timeout {self.timeout} "
            f"--keep-alive {self.keepalive} "
            f"--max-requests {self.max_requests} "
            f"--max-requests-jitter {self.max_requests_jitter} "
            f"--backlog {self.backlog}"
        )
        # Add threads for gthread worker class
        if self.worker_class == "gthread":
            args += f" --threads {self.threads_per_worker}"
        return args


@dataclass
class RedisConfig:
    """Redis configuration for caching and Celery broker."""
    url: str = "redis://localhost:6379/0"
    cache_db: int = 0
    celery_db: int = 1
    session_db: int = 2
    
    # Connection pool settings
    max_connections: int = 50
    socket_timeout: float = 5.0
    socket_connect_timeout: float = 5.0
    retry_on_timeout: bool = True
    
    # Health check
    health_check_interval: int = 30
    
    @classmethod
    def from_env(cls) -> "RedisConfig":
        return cls(
            url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "50")),
        )
    
    def get_cache_url(self) -> str:
        """Get Redis URL for caching."""
        base = self.url.rsplit("/", 1)[0]
        return f"{base}/{self.cache_db}"
    
    def get_celery_url(self) -> str:
        """Get Redis URL for Celery broker."""
        base = self.url.rsplit("/", 1)[0]
        return f"{base}/{self.celery_db}"


@dataclass
class CacheConfig:
    """
    Multi-layer caching configuration.
    L1: In-memory (fast, limited)
    L2: Redis (shared across workers)
    """
    # L1 In-memory cache
    l1_max_size: int = 500
    l1_ttl_seconds: int = 300  # 5 minutes
    
    # L2 Redis cache
    l2_ttl_seconds: int = 3600  # 1 hour
    
    # Cache strategy by content type
    session_ttl: int = 1800  # 30 minutes for session data
    user_profile_ttl: int = 3600  # 1 hour for user profiles
    static_content_ttl: int = 86400  # 24 hours for static content
    
    # Response caching
    response_cache_enabled: bool = True
    response_cache_threshold: int = 500  # Min bytes to cache
    
    @classmethod
    def from_env(cls) -> "CacheConfig":
        return cls(
            l1_max_size=int(os.getenv("CACHE_L1_MAX_SIZE", "500")),
            l1_ttl_seconds=int(os.getenv("CACHE_L1_TTL", "300")),
            l2_ttl_seconds=int(os.getenv("CACHE_L2_TTL", "3600")),
        )


@dataclass
class CeleryConfig:
    """Celery background task configuration."""
    broker_url: str = "redis://localhost:6379/1"
    result_backend: str = "redis://localhost:6379/1"
    
    # Task settings
    task_serializer: str = "json"
    result_serializer: str = "json"
    accept_content: tuple = ("json",)
    timezone: str = "UTC"
    enable_utc: bool = True
    
    # Concurrency
    worker_concurrency: int = 4
    worker_prefetch_multiplier: int = 4
    
    # Task time limits (seconds)
    task_soft_time_limit: int = 300
    task_time_limit: int = 600
    
    # Task priority queues
    task_queues: Dict[str, Any] = field(default_factory=lambda: {
        "high": {"exchange": "high", "routing_key": "high"},
        "default": {"exchange": "default", "routing_key": "default"},
        "low": {"exchange": "low", "routing_key": "low"},
    })
    
    # Retry settings
    task_default_retry_delay: int = 60
    task_max_retries: int = 3
    
    @classmethod
    def from_env(cls, redis_config: RedisConfig = None) -> "CeleryConfig":
        redis_url = redis_config.get_celery_url() if redis_config else os.getenv("REDIS_URL", "redis://localhost:6379/1")
        return cls(
            broker_url=redis_url,
            result_backend=redis_url,
            worker_concurrency=int(os.getenv("CELERY_CONCURRENCY", "4")),
        )


@dataclass
class MemoryConfig:
    """
    Intelligent memory management configuration.
    Implements multi-layer memory architecture for chatbot context.
    """
    # Session Memory (Short-term)
    session_message_limit: int = 15  # Last N messages per conversation
    session_timeout_minutes: int = 30  # Inactivity timeout
    
    # Context Management
    context_window_size: int = 10  # Messages to include in LLM context
    context_compression_threshold: int = 20  # Compress after N exchanges
    
    # Memory Algorithms
    enable_sliding_window: bool = True
    enable_semantic_scoring: bool = True
    enable_decay_function: bool = True
    decay_half_life_hours: float = 24.0  # Older messages decay
    
    # Context Pruning
    prune_after_exchanges: int = 15  # Remove irrelevant data
    relevance_threshold: float = 0.3  # Min relevance score to keep
    
    @classmethod
    def from_env(cls) -> "MemoryConfig":
        return cls(
            session_message_limit=int(os.getenv("MEMORY_SESSION_LIMIT", "15")),
            session_timeout_minutes=int(os.getenv("MEMORY_SESSION_TIMEOUT", "30")),
            context_window_size=int(os.getenv("MEMORY_CONTEXT_WINDOW", "10")),
        )


@dataclass
class PerformanceConfig:
    """Performance optimization settings."""
    # Response time targets
    target_p95_response_ms: int = 200
    target_p99_response_ms: int = 500
    
    # Compression
    enable_gzip: bool = True
    gzip_min_size: int = 500  # Min bytes to compress
    gzip_level: int = 6  # 1-9, higher = more compression
    
    # Connection pooling
    http_connection_pool_size: int = 20
    http_connection_timeout: float = 10.0
    
    # Request limits
    max_content_length: int = 16 * 1024 * 1024  # 16MB
    
    # JSON optimization
    use_orjson: bool = True
    
    @classmethod
    def from_env(cls) -> "PerformanceConfig":
        return cls(
            enable_gzip=os.getenv("ENABLE_GZIP", "true").lower() == "true",
            gzip_level=int(os.getenv("GZIP_LEVEL", "6")),
        )


@dataclass
class WhatsAppConfig:
    """WhatsApp-specific configuration."""
    # Message limits
    max_message_length: int = 1600  # WhatsApp limit
    message_split_threshold: int = 1500  # Split before limit
    
    # Rate limiting (per user)
    messages_per_minute: int = 10
    max_bulk_recipients: int = 1000
    
    # Webhook settings
    webhook_timeout: int = 20  # Max seconds for webhook response
    webhook_retry_count: int = 3
    
    # Interactive features
    max_list_items: int = 10
    max_button_options: int = 3
    
    @classmethod
    def from_env(cls) -> "WhatsAppConfig":
        return cls(
            messages_per_minute=int(os.getenv("WHATSAPP_RATE_LIMIT", "10")),
        )


@dataclass
class MonitoringConfig:
    """Monitoring and profiling configuration."""
    enable_profiler: bool = True
    profiler_sampling_rate: float = 0.1  # Sample 10% of requests
    
    # Metrics
    enable_prometheus: bool = True
    prometheus_port: int = 9090
    
    # Logging
    log_level: str = "INFO"
    log_format: str = "json"
    log_slow_requests_ms: int = 500  # Log requests slower than this
    
    # Alerting thresholds
    alert_error_rate: float = 0.05  # 5% error rate
    alert_p95_latency_ms: int = 500
    
    @classmethod
    def from_env(cls) -> "MonitoringConfig":
        return cls(
            enable_profiler=os.getenv("ENABLE_PROFILER", "true").lower() == "true",
            log_level=os.getenv("LOG_LEVEL", "INFO"),
        )


@dataclass
class SecurityConfig:
    """Security configuration."""
    # Rate limiting
    rate_limit_per_user: int = 10  # Messages per minute
    rate_limit_per_ip: int = 30  # Requests per minute
    
    # Webhook validation
    validate_webhook_signature: bool = True
    webhook_timestamp_tolerance: int = 300  # 5 minutes
    
    # Input validation
    max_message_length: int = 4096
    sanitize_inputs: bool = True
    
    # Encryption
    encrypt_at_rest: bool = True
    
    # GDPR
    data_retention_days: int = 90
    allow_data_deletion: bool = True
    
    @classmethod
    def from_env(cls) -> "SecurityConfig":
        return cls(
            rate_limit_per_user=int(os.getenv("RATE_LIMIT_PER_USER", "10")),
            validate_webhook_signature=os.getenv("VALIDATE_WEBHOOK", "true").lower() == "true",
        )


@dataclass
class ProductionConfig:
    """
    Main production configuration class.
    Aggregates all configuration modules.
    """
    environment: Environment = Environment.PRODUCTION
    debug: bool = False
    
    server: ServerConfig = field(default_factory=ServerConfig)
    redis: RedisConfig = field(default_factory=RedisConfig)
    cache: CacheConfig = field(default_factory=CacheConfig)
    celery: CeleryConfig = field(default_factory=CeleryConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    performance: PerformanceConfig = field(default_factory=PerformanceConfig)
    whatsapp: WhatsAppConfig = field(default_factory=WhatsAppConfig)
    monitoring: MonitoringConfig = field(default_factory=MonitoringConfig)
    security: SecurityConfig = field(default_factory=SecurityConfig)
    
    @classmethod
    def from_env(cls) -> "ProductionConfig":
        """Create configuration from environment variables."""
        env = os.getenv("FLASK_ENV", "production").lower()
        environment = Environment(env) if env in [e.value for e in Environment] else Environment.PRODUCTION
        
        redis = RedisConfig.from_env()
        
        return cls(
            environment=environment,
            debug=env == "development",
            server=ServerConfig.from_env(),
            redis=redis,
            cache=CacheConfig.from_env(),
            celery=CeleryConfig.from_env(redis),
            memory=MemoryConfig.from_env(),
            performance=PerformanceConfig.from_env(),
            whatsapp=WhatsAppConfig.from_env(),
            monitoring=MonitoringConfig.from_env(),
            security=SecurityConfig.from_env(),
        )
    
    def to_flask_config(self) -> Dict[str, Any]:
        """Convert to Flask config dictionary."""
        return {
            "DEBUG": self.debug,
            "ENV": self.environment.value,
            
            # Caching
            "CACHE_TYPE": "RedisCache",
            "CACHE_REDIS_URL": self.redis.get_cache_url(),
            "CACHE_DEFAULT_TIMEOUT": self.cache.l2_ttl_seconds,
            
            # Compression
            "COMPRESS_MIMETYPES": [
                "text/html", "text/css", "text/xml",
                "application/json", "application/javascript"
            ],
            "COMPRESS_LEVEL": self.performance.gzip_level,
            "COMPRESS_MIN_SIZE": self.performance.gzip_min_size,
            
            # Limits
            "MAX_CONTENT_LENGTH": self.performance.max_content_length,
            
            # Profiler
            "flask_profiler": {
                "enabled": self.monitoring.enable_profiler,
                "storage": {
                    "engine": "sqlite"
                },
                "sampling_rate": self.monitoring.profiler_sampling_rate,
                "endpointRoot": "profiler",
            },
        }


def get_config() -> ProductionConfig:
    """Get the current configuration."""
    return ProductionConfig.from_env()


def config_from_env() -> ProductionConfig:
    """Alias for get_config()."""
    return get_config()


# =============================================================================
# KPI Targets (for monitoring dashboards)
# =============================================================================

KPI_TARGETS = {
    "response_time_p95_ms": 200,
    "response_time_p99_ms": 500,
    "messages_per_second": 100,
    "context_retention_accuracy": 0.85,
    "user_satisfaction_score": 4.0,
    "conversation_completion_rate": 0.75,
    "concurrent_conversations": 500,
}

