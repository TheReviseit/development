#!/usr/bin/env python3
"""
Route Coverage Audit Script
============================
Enterprise-grade CI script that verifies ALL write endpoints (POST/PUT/PATCH/DELETE)
are gated by @require_feature, @require_limit, or explicitly marked public.

Run:
    python scripts/audit_route_coverage.py

CI:
    python scripts/audit_route_coverage.py --strict
    (Exits with code 1 if any ungated write endpoint is found)

Output:
    - List of all registered routes with their HTTP methods
    - Gating status for each write endpoint
    - Summary of coverage percentage
"""

import ast
import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass, field


# =============================================================================
# CONFIGURATION
# =============================================================================

# Decorators that constitute a valid gate
GATE_DECORATORS = frozenset({
    'require_feature',
    'require_limit',
    'require_live_entitlement',
    'require_any_subscription',
    'require_console_auth',
})

# Write HTTP methods that MUST be gated
WRITE_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})

# Routes explicitly marked as public (no gate needed)
# Format: (blueprint_prefix, endpoint_path, method)
# Routes explicitly marked as public (no feature-gate needed)
# Format: (full_url_path, method)
# These routes are gated at a different layer (API key, HMAC, Firebase auth) or are genuinely public.
PUBLIC_ROUTES: frozenset = frozenset({
    # Billing plans — public pricing page
    ('/console/billing/plans', 'GET'),
    # Webhooks — externally authenticated via HMAC signature
    ('/console/billing/webhook', 'POST'),
    ('/api/payments/webhook', 'POST'),
    # Auth routes — public by design
    ('/api/auth/login', 'POST'),
    ('/api/auth/register', 'POST'),
    ('/api/auth/verify-otp', 'POST'),
    ('/api/auth/refresh', 'POST'),
    # Console auth — public by design (session management)
    ('/console/auth/signup', 'POST'),
    ('/console/auth/send-otp', 'POST'),
    ('/console/auth/verify-otp', 'POST'),
    ('/console/auth/login', 'POST'),
    ('/console/auth/logout', 'POST'),
    ('/console/auth/refresh', 'POST'),
    # Features check — any authenticated user
    ('/api/features/check', 'GET'),
    ('/api/features/usage', 'GET'),
    ('/api/features/batch', 'POST'),
    ('/api/features/flags', 'POST'),
    # OTP routes — gated by API key auth at middleware layer
    ('/otp/send', 'POST'),
    ('/otp/verify', 'POST'),
    ('/otp/resend', 'POST'),
    # Subscription management — gated by Firebase auth middleware
    ('/api/subscriptions/create', 'POST'),
    ('/api/subscriptions/verify', 'POST'),
    ('/api/subscriptions/cancel', 'POST'),
    ('/api/subscriptions/change-plan', 'POST'),
    ('/api/subscriptions/cancel-change', 'POST'),
    # Pricing admin — internal use
    ('/api/pricing/cache/invalidate', 'POST'),
    # Slug cache — internal use
    ('/api/invalidate-slug-cache', 'POST'),
    # Username — public endpoints for claim flow
    ('/api/username/check', 'POST'),
    ('/api/username/suggest', 'POST'),
    ('/api/username/claim', 'POST'),
    ('/api/username/confirm', 'POST'),
    # Test endpoint — dev only
    ('/api/test-push', 'POST'),
    # Appointments — AI brain internal calls (gated by INTERNAL_API_KEY)
    ('/api/appointments/check-availability', 'POST'),
    ('/api/appointments/book', 'POST'),
    ('/api/appointments/cancel/<appointment_id>', 'POST'),
    # Analytics aggregation — cron job endpoint (gated by ANALYTICS_API_KEY)
    ('/api/analytics/aggregate', 'POST'),
})


@dataclass
class RouteInfo:
    """Parsed information about a Flask route."""
    file_path: str
    function_name: str
    url_rule: str
    methods: Set[str]
    decorators: List[str]
    line_number: int
    blueprint_prefix: str = ''

    @property
    def is_write(self) -> bool:
        return bool(self.methods & WRITE_METHODS)

    @property
    def is_gated(self) -> bool:
        return bool(set(self.decorators) & GATE_DECORATORS)

    @property
    def is_public(self) -> bool:
        full_path = self.blueprint_prefix + self.url_rule
        return any((full_path, method) in PUBLIC_ROUTES for method in self.methods)

    @property
    def status(self) -> str:
        if self.is_gated:
            return '✅ GATED'
        if self.is_public:
            return '📌 PUBLIC'
        if self.is_write:
            return '❌ UNGATED WRITE'
        return '📖 READ-ONLY'


@dataclass
class AuditResult:
    """Complete audit results."""
    routes: List[RouteInfo] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def write_routes(self) -> List[RouteInfo]:
        return [r for r in self.routes if r.is_write]

    @property
    def ungated_writes(self) -> List[RouteInfo]:
        return [r for r in self.write_routes if not r.is_gated and not r.is_public]

    @property
    def gated_writes(self) -> List[RouteInfo]:
        return [r for r in self.write_routes if r.is_gated]

    @property
    def public_writes(self) -> List[RouteInfo]:
        return [r for r in self.write_routes if r.is_public]

    @property
    def coverage_pct(self) -> float:
        total = len(self.write_routes)
        if total == 0:
            return 100.0
        covered = len(self.gated_writes) + len(self.public_writes)
        return round(covered / total * 100, 1)


# =============================================================================
# AST PARSER
# =============================================================================

class RouteVisitor(ast.NodeVisitor):
    """AST visitor that extracts Flask route information."""

    def __init__(self, file_path: str, blueprint_prefix: str = ''):
        self.file_path = file_path
        self.blueprint_prefix = blueprint_prefix
        self.routes: List[RouteInfo] = []

    def visit_FunctionDef(self, node: ast.FunctionDef):
        """Visit function definitions and extract route info."""
        route_info = self._extract_route_info(node)
        if route_info:
            self.routes.append(route_info)
        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def _extract_route_info(self, node: ast.FunctionDef) -> Optional[RouteInfo]:
        """Extract route information from decorators."""
        url_rule = None
        methods = set()
        decorator_names = []

        for decorator in node.decorator_list:
            name = self._get_decorator_name(decorator)
            if name:
                decorator_names.append(name)

            # Check for @bp.route() or @app.route()
            if isinstance(decorator, ast.Call):
                func = decorator.func
                attr_name = None
                if isinstance(func, ast.Attribute):
                    attr_name = func.attr
                elif isinstance(func, ast.Name):
                    attr_name = func.id

                if attr_name == 'route':
                    # Extract URL rule
                    if decorator.args:
                        arg = decorator.args[0]
                        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                            url_rule = arg.value

                    # Extract methods
                    for kw in decorator.keywords:
                        if kw.arg == 'methods':
                            if isinstance(kw.value, ast.List):
                                for elt in kw.value.elts:
                                    if isinstance(elt, ast.Constant):
                                        methods.add(elt.value.upper())

        if url_rule is None:
            return None

        if not methods:
            methods = {'GET'}  # Flask default

        return RouteInfo(
            file_path=self.file_path,
            function_name=node.name,
            url_rule=url_rule,
            methods=methods,
            decorators=decorator_names,
            line_number=node.lineno,
            blueprint_prefix=self.blueprint_prefix,
        )

    def _get_decorator_name(self, decorator: ast.expr) -> Optional[str]:
        """Get the base name of a decorator."""
        if isinstance(decorator, ast.Name):
            return decorator.id
        elif isinstance(decorator, ast.Call):
            return self._get_decorator_name(decorator.func)
        elif isinstance(decorator, ast.Attribute):
            return decorator.attr
        return None


def _extract_blueprint_prefix(source: str) -> str:
    """Extract blueprint url_prefix from source code."""
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == 'Blueprint':
                for kw in node.keywords:
                    if kw.arg == 'url_prefix':
                        if isinstance(kw.value, ast.Constant):
                            return kw.value.value
    return ''


def scan_file(file_path: str) -> Tuple[List[RouteInfo], List[str]]:
    """Scan a single Python file for routes."""
    errors = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            source = f.read()

        blueprint_prefix = _extract_blueprint_prefix(source)
        tree = ast.parse(source, filename=file_path)
        visitor = RouteVisitor(file_path, blueprint_prefix)
        visitor.visit(tree)
        return visitor.routes, errors

    except SyntaxError as e:
        errors.append(f"Syntax error in {file_path}: {e}")
        return [], errors
    except Exception as e:
        errors.append(f"Error scanning {file_path}: {e}")
        return [], errors


def audit_routes(routes_dir: str) -> AuditResult:
    """Audit all route files in the given directory."""
    result = AuditResult()

    routes_path = Path(routes_dir)
    if not routes_path.exists():
        result.errors.append(f"Routes directory not found: {routes_dir}")
        return result

    for py_file in sorted(routes_path.glob('*.py')):
        if py_file.name.startswith('__'):
            continue
        routes, errors = scan_file(str(py_file))
        result.routes.extend(routes)
        result.errors.extend(errors)

    return result


# =============================================================================
# REPORTERS
# =============================================================================

def print_report(result: AuditResult) -> None:
    """Print a human-readable audit report."""
    print("=" * 72)
    print("ROUTE COVERAGE AUDIT REPORT")
    print("=" * 72)
    print()

    # Group by file
    by_file: Dict[str, List[RouteInfo]] = {}
    for route in result.routes:
        fname = os.path.basename(route.file_path)
        by_file.setdefault(fname, []).append(route)

    for fname, routes in sorted(by_file.items()):
        print(f"📁 {fname}")
        for r in routes:
            methods_str = ','.join(sorted(r.methods))
            full_path = r.blueprint_prefix + r.url_rule
            gates = ', '.join(r.decorators) if r.decorators else 'NONE'
            status = r.status
            print(f"  {status}  [{methods_str:20s}] {full_path:45s} → {r.function_name}")
            if not r.is_gated and r.is_write and not r.is_public:
                print(f"          ⚠️  DECORATORS: {gates}")
        print()

    # Summary
    print("-" * 72)
    total = len(result.routes)
    writes = len(result.write_routes)
    gated = len(result.gated_writes)
    public = len(result.public_writes)
    ungated = len(result.ungated_writes)

    print(f"Total routes:         {total}")
    print(f"Write endpoints:      {writes}")
    print(f"  ✅ Gated:           {gated}")
    print(f"  📌 Public:          {public}")
    print(f"  ❌ Ungated:         {ungated}")
    print(f"Coverage:             {result.coverage_pct}%")
    print("-" * 72)

    if ungated > 0:
        print()
        print("🚨 UNGATED WRITE ENDPOINTS:")
        for r in result.ungated_writes:
            full_path = r.blueprint_prefix + r.url_rule
            print(f"  ❌ [{','.join(sorted(r.methods))}] {full_path}")
            print(f"     File: {r.file_path}:{r.line_number}")
            print(f"     Fix: Add @require_feature('feature_key') or @require_limit('feature_key', 1)")
        print()

    if result.errors:
        print()
        print("⚠️  SCAN ERRORS:")
        for err in result.errors:
            print(f"  {err}")


def json_report(result: AuditResult) -> str:
    """Generate JSON audit report."""
    return json.dumps({
        'total_routes': len(result.routes),
        'write_endpoints': len(result.write_routes),
        'gated_writes': len(result.gated_writes),
        'public_writes': len(result.public_writes),
        'ungated_writes': len(result.ungated_writes),
        'coverage_pct': result.coverage_pct,
        'ungated': [{
            'path': r.blueprint_prefix + r.url_rule,
            'methods': sorted(r.methods),
            'file': r.file_path,
            'line': r.line_number,
            'function': r.function_name,
        } for r in result.ungated_writes],
        'errors': result.errors,
    }, indent=2)


# =============================================================================
# MAIN
# =============================================================================

def main():
    strict = '--strict' in sys.argv
    json_output = '--json' in sys.argv

    # Find routes directory relative to this script
    script_dir = Path(__file__).parent.parent
    routes_dir = script_dir / 'routes'

    if not routes_dir.exists():
        # Try relative to cwd
        routes_dir = Path('routes')

    if not routes_dir.exists():
        print(f"❌ Routes directory not found. Run from backend/ or pass path.", file=sys.stderr)
        sys.exit(1)

    result = audit_routes(str(routes_dir))

    if json_output:
        print(json_report(result))
    else:
        print_report(result)

    if strict and result.ungated_writes:
        print(f"\n🚨 STRICT MODE: {len(result.ungated_writes)} ungated write endpoint(s) found. Failing CI.")
        sys.exit(1)

    if strict and result.errors:
        print(f"\n⚠️  STRICT MODE: {len(result.errors)} scan error(s). Failing CI.")
        sys.exit(1)

    sys.exit(0)


if __name__ == '__main__':
    main()
