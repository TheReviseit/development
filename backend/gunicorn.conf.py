"""
Gunicorn Configuration for Production WhatsApp Chatbot API.
Optimized for high-performance async I/O with gevent.
"""

import os
import multiprocessing

# =============================================================================
# Server Socket
# =============================================================================
bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
backlog = 2048  # Pending connection queue size

# =============================================================================
# Worker Processes
# =============================================================================
# Workers = 2-4 × CPU cores for optimal performance
# For 2-core server: 4-8 workers
# For 4-core server: 8-16 workers
workers = int(os.getenv("GUNICORN_WORKERS", multiprocessing.cpu_count() * 2 + 1))

# Worker class options:
# - "gthread": Threaded workers (works on all platforms, recommended for Windows)
# - "gevent": Async greenlets (Linux/macOS only, requires gevent package)
# - "sync": Synchronous (default, one request at a time per worker)
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "gthread")

# Threads per worker (for gthread worker class)
threads = int(os.getenv("GUNICORN_THREADS", 4))

# Number of simultaneous connections per worker (for gevent)
worker_connections = 1000

# Restart workers after this many requests (prevents memory leaks)
max_requests = 1000
max_requests_jitter = 50  # Randomize to prevent thundering herd

# =============================================================================
# Timeouts
# =============================================================================
# Worker timeout for long AI operations
timeout = 120  # seconds

# Keep-alive connections
keepalive = 5  # seconds

# Graceful shutdown timeout
graceful_timeout = 30

# =============================================================================
# Logging
# =============================================================================
loglevel = os.getenv("LOG_LEVEL", "info")
accesslog = "-"  # stdout
errorlog = "-"   # stderr
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# =============================================================================
# Process Naming
# =============================================================================
proc_name = "whatsapp-chatbot-api"

# =============================================================================
# Server Mechanics
# =============================================================================
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# =============================================================================
# SSL (if terminating SSL at Gunicorn level)
# =============================================================================
# keyfile = None
# certfile = None
# ssl_version = 2
# cert_reqs = 0
# ca_certs = None
# suppress_ragged_eofs = True
# do_handshake_on_connect = False

# =============================================================================
# Server Hooks for Monitoring and Lifecycle
# =============================================================================

def on_starting(server):
    """Called just before the master process is initialized."""
    print(f"🚀 Starting Gunicorn with {workers} workers...")


def on_reload(server):
    """Called when workers are being reloaded."""
    print("🔄 Reloading workers...")


def when_ready(server):
    """Called just after the server is started."""
    print(f"✅ Gunicorn server ready on {bind}")
    print(f"   Workers: {workers} × gevent")
    print(f"   Max connections per worker: {worker_connections}")


def worker_int(worker):
    """Called when a worker receives SIGINT or SIGQUIT."""
    print(f"⚠️ Worker {worker.pid} interrupted")


def worker_abort(worker):
    """Called when a worker receives SIGABRT."""
    print(f"❌ Worker {worker.pid} aborted")


def pre_fork(server, worker):
    """Called just before a worker is forked."""
    pass


def post_fork(server, worker):
    """Called just after a worker has been forked."""
    print(f"👷 Worker {worker.pid} spawned")


def pre_exec(server):
    """Called just before a new master process is forked."""
    print("🔧 Pre-exec: forking new master")


def child_exit(server, worker):
    """Called when a worker process is terminated."""
    print(f"👋 Worker {worker.pid} exited")


def worker_exit(server, worker):
    """Called after a worker exits."""
    pass


def nworkers_changed(server, new_value, old_value):
    """Called when number of workers changes."""
    print(f"📊 Workers changed: {old_value} → {new_value}")

