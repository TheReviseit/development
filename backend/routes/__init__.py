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
    register_test_routes(app)  # Register test push endpoint
    register_messaging_routes(app)  # Register messaging endpoint
    print("✅ Registered API routes: templates, contacts, analytics, campaigns, bulk-campaigns, appointments, orders, payments, inventory, test-push, messaging")



