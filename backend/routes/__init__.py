"""
Routes package initialization.
Register all blueprints here.
"""

from .templates import templates_bp
from .contacts import contacts_bp
from .analytics import analytics_bp
from .campaigns import campaigns_bp
from .bulk_campaigns import bulk_campaigns_bp
from .test_push import register_test_routes
from .appointments import appointments_bp
from .messaging import register_messaging_routes
from .orders import orders_bp
from .payments import payments_bp
from .inventory import inventory_bp
from .showcase_api import showcase_bp
from .slug_cache import slug_cache_bp  # ✅ Slug cache invalidation
from .shop_business import shop_business_bp  # ✅ Shop business update (replaces service-role writes)
from .monitor import monitor_bp  # Platform monitoring dashboard
from .health_api import health_bp  # Health check endpoints
from .billing_api import billing_bp  # Billing API endpoints

__all__ = [
    'templates_bp',
    'contacts_bp',
    'analytics_bp',
    'campaigns_bp',
    'bulk_campaigns_bp',
    'register_test_routes',
    'appointments_bp',
    'register_messaging_routes',
    'orders_bp',
    'payments_bp',
    'inventory_bp',
    'showcase_bp',
    'slug_cache_bp',  # ✅ Export slug cache
    'shop_business_bp',  # ✅ Shop business update
    'monitor_bp',  # Platform monitoring
    'health_bp',  # Health check endpoints
    'billing_bp',  # Billing API endpoints
]


def register_routes(app):
    """Register all route blueprints with the Flask app."""
    app.register_blueprint(templates_bp)
    app.register_blueprint(contacts_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(campaigns_bp)
    app.register_blueprint(bulk_campaigns_bp)
    app.register_blueprint(appointments_bp)
    app.register_blueprint(orders_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(showcase_bp)  # Enterprise showcase system
    app.register_blueprint(slug_cache_bp)  # ✅ Slug cache invalidation
    app.register_blueprint(shop_business_bp)  # ✅ Shop business update (entitlement-gated)
    app.register_blueprint(monitor_bp)  # Platform monitoring dashboard
    app.register_blueprint(health_bp)  # Health check endpoints (MUST be registered before billing)
    app.register_blueprint(billing_bp)  # Billing API endpoints
    register_test_routes(app)  # Register test push endpoint
    register_messaging_routes(app)  # Register messaging endpoint
    print("✅ Registered API routes: templates, contacts, analytics, campaigns, bulk-campaigns, appointments, orders, payments, inventory, showcase, slug-cache, monitor, health, billing, test-push, messaging")



