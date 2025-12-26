"""
Routes package initialization.
Register all blueprints here.
"""

from .templates import templates_bp
from .contacts import contacts_bp
from .analytics import analytics_bp
from .campaigns import campaigns_bp
from .test_push import register_test_routes

__all__ = [
    'templates_bp',
    'contacts_bp',
    'analytics_bp',
    'campaigns_bp',
    'register_test_routes'
]


def register_routes(app):
    """Register all route blueprints with the Flask app."""
    app.register_blueprint(templates_bp)
    app.register_blueprint(contacts_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(campaigns_bp)
    register_test_routes(app)  # Register test push endpoint
    print("✅ Registered API routes: templates, contacts, analytics, campaigns, test-push")
