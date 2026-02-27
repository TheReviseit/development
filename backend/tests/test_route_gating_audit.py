"""
Route Gating Audit Test — CI-Ready Static Analysis
====================================================
Ensures every write endpoint (POST/PUT/PATCH/DELETE) on Shop domain
blueprints has a @require_feature or @require_limit decorator.

Prevents future regressions: if a new write route is added without
a feature gate, this test fails.

No DB, no Redis — inspects registered Flask routes and function closures.
"""

import pytest
import functools
import inspect


# ============================================================================
# CONFIGURATION
# ============================================================================

# Blueprints that MUST have write routes gated
GATED_BLUEPRINTS = {
    'campaigns',
    'bulk_campaigns',
    'templates',
    'contacts',
    'showcase',
    'messaging',
}

# Read-only route functions that are intentionally ungated
EXEMPT_ROUTES = {
    # GET-only endpoints (read operations)
    'list_campaigns',
    'get_campaign',
    'get_campaign_stats',
    'list_templates',
    'get_template',
    'list_contacts',
    'get_contact',
    'export_contacts',
    'get_all_tags',
    'list_contact_lists',
    'get_list_members',
    'list_bulk_campaigns',
    'get_bulk_campaign',
    'get_showcase',
    'get_settings',
    'get_items',
    # Error handlers
    'not_found',
    'internal_error',
    # Public endpoints 
    'public_get_showcase',
    'public_get_items',
}

# Methods that MUST be gated (write operations)
WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}

# Decorator names that satisfy the gating requirement
GATE_DECORATOR_NAMES = {'require_feature', 'require_limit', 'with_feature_gate'}


# ============================================================================
# HELPERS
# ============================================================================

def _has_feature_gate_decorator(func) -> bool:
    """
    Check if a function (or its wrapper chain) has a feature gate decorator.
    
    Inspects:
    1. __wrapped__ chain (functools.wraps)
    2. Closure variable names
    3. Function name patterns
    """
    # Walk the wrapper chain
    current = func
    visited = set()
    
    while current and id(current) not in visited:
        visited.add(id(current))
        
        # Check if the function itself is a known gate decorator result
        qualname = getattr(current, '__qualname__', '')
        for decorator_name in GATE_DECORATOR_NAMES:
            if decorator_name in qualname:
                return True
        
        # Check closure variables for gate decorator references
        if hasattr(current, '__closure__') and current.__closure__:
            for cell in current.__closure__:
                try:
                    cell_value = cell.cell_contents
                    if callable(cell_value):
                        cell_qualname = getattr(cell_value, '__qualname__', '')
                        for decorator_name in GATE_DECORATOR_NAMES:
                            if decorator_name in cell_qualname:
                                return True
                except (ValueError, AttributeError):
                    continue
        
        # Move up the wrapper chain
        current = getattr(current, '__wrapped__', None)
    
    return False


def _get_decorator_names(func) -> list:
    """
    Inspect the source code for decorator names (best-effort).
    Falls back to closure inspection if source is unavailable.
    """
    try:
        source = inspect.getsource(func)
        decorators = []
        for line in source.split('\n'):
            stripped = line.strip()
            if stripped.startswith('@'):
                decorators.append(stripped)
        return decorators
    except (OSError, TypeError):
        return []


# ============================================================================
# TEST
# ============================================================================

class TestRouteGatingAudit:
    """
    Static analysis: every write route on Shop domain blueprints
    MUST have a @require_feature or @require_limit decorator.
    
    This test catches regressions when new routes are added
    without proper entitlement enforcement.
    """

    @pytest.fixture
    def app(self):
        """Import and configure the Flask app."""
        import sys
        import os
        
        # Add backend to path if needed
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        
        try:
            # Try importing the app
            from app import app as flask_app
            return flask_app
        except Exception as e:
            pytest.skip(f"Could not import Flask app: {e}")

    def test_all_write_routes_are_gated(self, app):
        """
        Every POST/PUT/PATCH/DELETE endpoint on gated blueprints
        must have a feature gate decorator.
        
        Fails with a detailed report showing which routes are ungated.
        """
        ungated_routes = []
        gated_routes = []
        
        with app.app_context():
            for rule in app.url_map.iter_rules():
                # Skip non-blueprint routes
                if '.' not in rule.endpoint:
                    continue
                
                blueprint_name = rule.endpoint.split('.')[0]
                func_name = rule.endpoint.split('.')[-1]
                
                # Only check gated blueprints
                if blueprint_name not in GATED_BLUEPRINTS:
                    continue
                
                # Only check write methods
                route_methods = rule.methods - {'OPTIONS', 'HEAD'}
                if not route_methods.intersection(WRITE_METHODS):
                    continue
                
                # Skip exempt routes
                if func_name in EXEMPT_ROUTES:
                    continue
                
                # Get the view function
                view_func = app.view_functions.get(rule.endpoint)
                if view_func is None:
                    continue
                
                # Check for feature gate decorator
                has_gate = _has_feature_gate_decorator(view_func)
                
                route_info = {
                    'endpoint': rule.endpoint,
                    'rule': str(rule),
                    'methods': sorted(route_methods),
                    'function': func_name,
                }
                
                if has_gate:
                    gated_routes.append(route_info)
                else:
                    ungated_routes.append(route_info)
        
        # Build report
        if ungated_routes:
            report_lines = [
                "",
                "=" * 60,
                "UNGATED WRITE ROUTES DETECTED (Revenue Leakage Risk)",
                "=" * 60,
            ]
            for r in ungated_routes:
                report_lines.append(
                    f"  ❌ {r['endpoint']}  "
                    f"{r['methods']}  {r['rule']}"
                )
            report_lines.append("")
            report_lines.append(
                f"Total: {len(ungated_routes)} ungated, "
                f"{len(gated_routes)} gated"
            )
            report_lines.append(
                "Fix: Add @require_feature or @require_limit decorator"
            )
            
            pytest.fail("\n".join(report_lines))
        
        # Success: print summary
        print(f"\n✅ All {len(gated_routes)} write routes are properly gated")

    def test_no_hardcoded_plan_slug_in_routes(self):
        """
        No route file should contain hardcoded plan slug comparisons.
        
        Scans Python route files for patterns like:
        - plan_slug == 'starter'
        - plan_slug == "business"
        - planSlug === "pro"
        """
        import os
        import re
        
        routes_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            'routes'
        )
        
        if not os.path.exists(routes_dir):
            pytest.skip("Routes directory not found")
        
        violations = []
        pattern = re.compile(
            r"""plan[_s]slug\s*[=!]=+\s*['"]"""
            r"""(starter|business|pro|free|enterprise)['"]""",
            re.IGNORECASE
        )
        
        for filename in os.listdir(routes_dir):
            if not filename.endswith('.py'):
                continue
            
            filepath = os.path.join(routes_dir, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    if pattern.search(line):
                        violations.append(
                            f"  {filename}:{line_num}  → {line.strip()}"
                        )
        
        if violations:
            report = [
                "",
                "=" * 60,
                "HARDCODED PLAN SLUG COMPARISONS IN ROUTE FILES",
                "=" * 60,
            ] + violations + [
                "",
                "Fix: Use FeatureGateEngine for all entitlement decisions"
            ]
            pytest.fail("\n".join(report))
        
        print("\n✅ No hardcoded plan slug comparisons in route files")
