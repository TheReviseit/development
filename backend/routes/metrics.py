"""
Metrics Endpoint - Prometheus /metrics Route
=============================================
Exposes Prometheus-formatted metrics for scraping.

Usage:
    Register in app.py:
        from routes.metrics import metrics_bp
        app.register_blueprint(metrics_bp)

    Access metrics:
        curl http://localhost:5000/metrics

Configure Prometheus scraping:
    scrape_configs:
      - job_name: 'reviseit-backend'
        static_configs:
          - targets: ['localhost:5000']
        metrics_path: '/metrics'
        scrape_interval: 15s
"""

from flask import Blueprint, Response
import logging

logger = logging.getLogger('reviseit.metrics')

# Create blueprint
metrics_bp = Blueprint('metrics', __name__)

@metrics_bp.route('/metrics')
def metrics():
    """
    Prometheus metrics endpoint.

    Returns metrics in Prometheus text format for scraping.

    Returns:
        Response: Prometheus-formatted metrics with text/plain mimetype
    """
    try:
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

        # Generate metrics in Prometheus format
        metrics_data = generate_latest()

        return Response(
            metrics_data,
            mimetype=CONTENT_TYPE_LATEST,
            headers={
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            }
        )

    except ImportError:
        logger.warning("prometheus_client not installed. Install: pip install prometheus-client")
        return Response(
            "# prometheus_client not installed\n# Install: pip install prometheus-client\n",
            mimetype='text/plain'
        )
    except Exception as e:
        logger.error(f"Failed to generate metrics: {e}")
        return Response(
            f"# Error generating metrics: {str(e)}\n",
            mimetype='text/plain',
            status=500
        )


@metrics_bp.route('/health')
def health():
    """
    Health check endpoint for monitoring.

    Returns:
        dict: Health status
    """
    from services.observability import is_metrics_enabled

    return {
        'status': 'healthy',
        'metrics_enabled': is_metrics_enabled(),
    }, 200
