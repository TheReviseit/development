"""
Forms API — Flask Blueprint

Enterprise-grade REST API for form builder operations.
Follows the existing Blueprint pattern (see routes/products_api.py, routes/orders.py).

Routes:
    POST   /api/forms                       Create form
    GET    /api/forms                       List user's forms
    GET    /api/forms/<id>                  Get form
    PUT    /api/forms/<id>                  Update form
    DELETE /api/forms/<id>                  Soft-delete form
    POST   /api/forms/<id>/publish          Publish form
    POST   /api/forms/<id>/unpublish        Unpublish form
    PUT    /api/forms/<id>/fields           Bulk update fields
    GET    /api/forms/<id>/fields           Get form fields
    GET    /api/forms/<id>/responses        Get responses (paginated)
    GET    /api/forms/public/<slug>         Public form for rendering
    POST   /api/forms/public/<slug>/submit  Public form submission
"""

import logging
from flask import Blueprint, request, jsonify

logger = logging.getLogger("reviseit.forms_api")

forms_bp = Blueprint("forms", __name__, url_prefix="/api/forms")


def _get_user_id():
    """Extract user ID from request headers (Firebase UID)."""
    user_id = request.headers.get("X-User-Id")
    if not user_id:
        return None
    # Resolve to Supabase UUID
    try:
        from supabase_client import resolve_user_id
        resolved = resolve_user_id(user_id, allow_firebase_fallback=True)
        return resolved
    except ImportError:
        return user_id


def _require_auth():
    """Require authentication; returns (user_id, error_response)."""
    user_id = _get_user_id()
    if not user_id:
        return None, (jsonify({"success": False, "error": "Authentication required"}), 401)
    return user_id, None


# =============================================================================
# FORM CRUD
# =============================================================================

@forms_bp.route("", methods=["POST"])
def create_form():
    """Create a new form."""
    user_id, err = _require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    title = data.get("title", "Untitled Form")
    description = data.get("description")

    try:
        from services.form_service import create_form as svc_create
        form = svc_create(user_id=user_id, title=title, description=description)
        return jsonify({"success": True, "form": form}), 201
    except Exception as e:
        logger.error(f"Error creating form: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("", methods=["GET"])
def list_forms():
    """List user's forms."""
    user_id, err = _require_auth()
    if err:
        return err

    status = request.args.get("status")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))

    try:
        from services.form_service import list_forms as svc_list
        result = svc_list(user_id=user_id, status=status, page=page, per_page=per_page)
        return jsonify({"success": True, **result}), 200
    except Exception as e:
        logger.error(f"Error listing forms: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("/<form_id>", methods=["GET"])
def get_form(form_id):
    """Get a specific form with its fields."""
    user_id, err = _require_auth()
    if err:
        return err

    try:
        from services.form_service import get_form as svc_get, get_fields as svc_fields
        form = svc_get(form_id=form_id, user_id=user_id)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404
        form["fields"] = svc_fields(form_id)
        return jsonify({"success": True, "form": form}), 200
    except Exception as e:
        logger.error(f"Error getting form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("/<form_id>", methods=["PUT"])
def update_form(form_id):
    """Update form metadata."""
    user_id, err = _require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}

    try:
        from services.form_service import update_form as svc_update
        form = svc_update(form_id=form_id, user_id=user_id, updates=data)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404
        return jsonify({"success": True, "form": form}), 200
    except Exception as e:
        logger.error(f"Error updating form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("/<form_id>", methods=["DELETE"])
def delete_form(form_id):
    """Soft-delete a form."""
    user_id, err = _require_auth()
    if err:
        return err

    try:
        from services.form_service import delete_form as svc_delete
        success = svc_delete(form_id=form_id, user_id=user_id)
        if not success:
            return jsonify({"success": False, "error": "Form not found"}), 404
        return jsonify({"success": True, "message": "Form deleted"}), 200
    except Exception as e:
        logger.error(f"Error deleting form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# PUBLISH / UNPUBLISH
# =============================================================================

@forms_bp.route("/<form_id>/publish", methods=["POST"])
def publish_form(form_id):
    """Publish a form."""
    user_id, err = _require_auth()
    if err:
        return err

    try:
        from services.form_service import publish_form as svc_publish
        form = svc_publish(form_id=form_id, user_id=user_id)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404
        return jsonify({"success": True, "form": form}), 200
    except Exception as e:
        logger.error(f"Error publishing form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("/<form_id>/unpublish", methods=["POST"])
def unpublish_form(form_id):
    """Unpublish a form (revert to draft)."""
    user_id, err = _require_auth()
    if err:
        return err

    try:
        from services.form_service import unpublish_form as svc_unpublish
        form = svc_unpublish(form_id=form_id, user_id=user_id)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404
        return jsonify({"success": True, "form": form}), 200
    except Exception as e:
        logger.error(f"Error unpublishing form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("/<form_id>/regenerate-slug", methods=["POST"])
def regenerate_slug(form_id):
    """Explicitly regenerate the form slug based on current title."""
    user_id, err = _require_auth()
    if err:
        return err

    try:
        from services.form_service import regenerate_slug as svc_regen
        form = svc_regen(form_id=form_id, user_id=user_id)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404
        return jsonify({"success": True, "form": form}), 200
    except Exception as e:
        logger.error(f"Error regenerating slug for form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("/<form_id>/restore", methods=["POST"])
def restore_form(form_id):
    """
    Restore a soft-deleted form within the 24-hour grace period.

    Only callable while the form is in soft-deleted state (deleted_at IS NOT NULL).
    Once the purge job has hard-deleted the form this endpoint returns 404.
    """
    user_id, err = _require_auth()
    if err:
        return err

    try:
        from services.form_service import restore_form as svc_restore
        form = svc_restore(form_id=form_id, user_id=user_id)
        if not form:
            return jsonify({
                "success": False,
                "error": "Form not found or already permanently deleted (grace period expired)",
            }), 404
        logger.info(f"♻️  Form restored via API: {form_id[:8]}... by user {user_id[:8]}...")
        return jsonify({"success": True, "form": form}), 200
    except Exception as e:
        logger.error(f"Error restoring form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# ADMIN — INTERNAL ENDPOINTS
# NOTE: In production, protect this route with middleware that verifies the
#       caller is an internal Celery task or an admin user.
#       Never expose this to regular users via the frontend.
# =============================================================================

@forms_bp.route("/admin/purge", methods=["POST"])
def admin_purge_deleted_forms():
    """
    Trigger the Phase 2 hard-delete purge manually.

    Deletes all soft-deleted forms older than `grace_hours` (default 24).
    Because the DB schema has ON DELETE CASCADE on all FK constraints,
    a single DELETE on forms automatically cleans form_fields, form_responses,
    and response_values — the application layer does zero child-table deletions.

    Request body (optional JSON):
      { "grace_hours": 24 }

    Returns a structured purge report:
      {
        "success": true,
        "report": {
          "purged": 3,
          "skipped": 0,
          "error_count": 0,
          "errors": [],
          "grace_period_hours": 24,
          "cutoff_iso": "2026-03-14T...",
          "purge_timestamp": "2026-03-15T..."
        }
      }
    """
    # Optional: verify internal caller (add your auth middleware here)
    data = request.get_json(silent=True) or {}
    grace_hours = int(data.get("grace_hours", 24))

    if grace_hours < 1:
        return jsonify({"success": False, "error": "grace_hours must be >= 1"}), 400

    try:
        from services.form_service import purge_deleted_forms as svc_purge
        report = svc_purge(older_than_hours=grace_hours)
        logger.info(
            f"🧹 Admin purge triggered: {report['purged']} forms hard-deleted "
            f"({report['error_count']} errors)"
        )
        return jsonify({"success": True, "report": report}), 200
    except Exception as e:
        logger.error(f"Error in admin purge: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# FIELD MANAGEMENT
# =============================================================================

@forms_bp.route("/<form_id>/fields", methods=["GET"])
def get_fields(form_id):
    """Get all fields for a form."""
    user_id, err = _require_auth()
    if err:
        return err

    try:
        from services.form_service import get_fields as svc_fields, get_form as svc_get
        form = svc_get(form_id=form_id, user_id=user_id)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404
        fields = svc_fields(form_id)
        return jsonify({"success": True, "fields": fields}), 200
    except Exception as e:
        logger.error(f"Error getting fields for form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@forms_bp.route("/<form_id>/fields", methods=["PUT"])
def bulk_update_fields(form_id):
    """Bulk update fields (add, remove, reorder)."""
    user_id, err = _require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    fields = data.get("fields", [])

    try:
        from services.form_service import bulk_update_fields as svc_bulk
        result = svc_bulk(form_id=form_id, user_id=user_id, fields=fields)
        return jsonify({"success": True, "fields": result}), 200
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 404
    except Exception as e:
        logger.error(f"Error updating fields for form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# RESPONSES
# =============================================================================

@forms_bp.route("/<form_id>/responses", methods=["GET"])
def get_responses(form_id):
    """Get paginated responses for a form."""
    user_id, err = _require_auth()
    if err:
        return err

    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 50))

    try:
        from services.form_service import get_responses as svc_responses
        result = svc_responses(form_id=form_id, user_id=user_id, page=page, per_page=per_page)
        return jsonify({"success": True, **result}), 200
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 404
    except Exception as e:
        logger.error(f"Error getting responses for form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# INTEGRATIONS (Google Sheets)
# =============================================================================

@forms_bp.route("/<form_id>/sheet", methods=["POST"])
def connect_google_sheet(form_id):
    """Test and connect a Google Sheet."""
    user_id, err = _require_auth()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    url = data.get("url")
    if not url:
        return jsonify({"success": False, "error": "URL is required"}), 400

    try:
        from services.form_service import get_form as svc_get, get_fields as svc_fields, update_form as svc_update
        from services.google_sheets_service import test_sheet_connection, init_sheet_headers

        form = svc_get(form_id=form_id, user_id=user_id)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404

        # 1. Test connection
        if not test_sheet_connection(url):
            return jsonify({"success": False, "error": "Could not access sheet. Did you share it with the service account?"}), 400

        # 2. Init headers
        fields = svc_fields(form_id)
        # We need: Submitted At, Field Labels..., IP Address, UTM Source, Medium, Campaign
        headers = ["Submitted At"] + [f.get("label", "Untitled Field") for f in fields] + ["IP Address", "UTM Source", "UTM Medium", "UTM Campaign"]
        init_sheet_headers(url, headers)

        # 3. Save URL to form settings
        settings = form.get("settings") or {}
        settings["google_sheet_url"] = url
        svc_update(form_id, user_id, {"settings": settings})

        return jsonify({"success": True, "message": "Sheet connected successfully"}), 200
    except Exception as e:
        logger.error(f"Error connecting sheet for form {form_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# =============================================================================
# PUBLIC ENDPOINTS (No Auth Required)
#
# SECURITY INVARIANTS:
# 1. Only published, non-deleted forms are ever returned
# 2. Sensitive fields (user_id, webhooks, google_sheet_url, utm_tracking,
#    created_at, updated_at, published_at, deleted_at) are NEVER exposed
# 3. Settings are reduced to the minimal set needed for form rendering
# 4. Input is sanitized (slug length, character whitelist)
# =============================================================================

# Allowlisted keys returned to public callers — everything else is stripped
_PUBLIC_FORM_FIELDS = frozenset([
    "id", "title", "description", "slug", "short_id",
    "theme", "cover_image_url", "settings", "fields",
])

# Allowlisted settings keys — prevents leaking internal config like
# google_sheet_url, webhook URLs, or internal feature flags
_PUBLIC_SAFE_SETTINGS = frozenset([
    "submitButtonText", "successMessage", "successRedirectUrl", "captchaEnabled",
])

# Input validation constants
_MAX_SLUG_LENGTH = 128
_SLUG_PATTERN = __import__("re").compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")


def _sanitize_form_for_public(form: dict, *, include_username: bool = False) -> dict:
    """
    Strip a raw form dict down to the minimal public-safe representation.

    This is the SINGLE PLACE where public data shaping happens.
    If a new field is added to the forms table, it is blocked by default
    unless explicitly added to _PUBLIC_FORM_FIELDS.

    Security model: allowlist-only (deny by default).
    """
    public_form = {k: form[k] for k in _PUBLIC_FORM_FIELDS if k in form}

    # Reduce settings to the rendering-safe subset
    raw_settings = public_form.get("settings") or {}
    public_form["settings"] = {
        k: raw_settings.get(k)
        for k in _PUBLIC_SAFE_SETTINGS
        if raw_settings.get(k) is not None
    }
    # Ensure submitButtonText always has a default
    public_form["settings"].setdefault("submitButtonText", "Submit")

    if include_username and "_username" in form:
        public_form["_username"] = form["_username"]

    return public_form


def _validate_slug(slug: str) -> bool:
    """Validate a slug/username input to prevent injection or abuse."""
    if not slug or len(slug) > _MAX_SLUG_LENGTH:
        return False
    return bool(_SLUG_PATTERN.match(slug))


@forms_bp.route("/public/<slug>", methods=["GET"])
def get_public_form(slug):
    """
    Get a published form for public rendering (by slug or short_id).

    Security: No auth required. Only published, non-deleted forms are returned.
    Response is stripped to the minimal public-safe field set.

    Returns:
        200 — form found and published
        404 — form does not exist, is draft, or is deleted (intentionally
              identical to prevent enumeration of unpublished forms)
    """
    # Input validation — reject malformed slugs early (before hitting DB)
    if not _validate_slug(slug):
        return jsonify({"success": False, "error": "Form not found"}), 404

    try:
        from services.form_service import get_public_form as svc_public
        form = svc_public(slug=slug)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404

        return jsonify({"success": True, "form": _sanitize_form_for_public(form)}), 200
    except Exception as e:
        logger.error(f"Error getting public form {slug}: {e}")
        # Always return 404 to prevent information leakage on errors
        return jsonify({"success": False, "error": "Form not found"}), 404


@forms_bp.route("/public/<username>/<form_slug>", methods=["GET"])
def get_public_form_by_username(username, form_slug):
    """
    Get a published form via workspace-scoped URL.

    Resolves: /{username}/forms/{form_slug}
    Example:  /tesla/forms/customer-feedback

    Security: No auth required. Only published, non-deleted forms are returned.
    Both username and form_slug are validated before any DB query.

    Returns:
        200 — form found and published
        404 — workspace or form not found / unpublished / deleted
    """
    # Input validation — reject malformed inputs early
    if not _validate_slug(username) or not _validate_slug(form_slug):
        return jsonify({"success": False, "error": "Form not found"}), 404

    try:
        from services.form_service import get_public_form_by_username as svc_public_by_user
        form = svc_public_by_user(username=username, form_slug=form_slug)
        if not form:
            return jsonify({"success": False, "error": "Form not found"}), 404

        return jsonify({
            "success": True,
            "form": _sanitize_form_for_public(form, include_username=True),
        }), 200
    except Exception as e:
        logger.error(f"Error getting public form /{username}/{form_slug}: {e}")
        return jsonify({"success": False, "error": "Form not found"}), 404


@forms_bp.route("/public/<slug>/submit", methods=["POST"])
def submit_form(slug):
    """Handle public form submission."""
    data = request.get_json(silent=True) or {}
    values = data.get("values", {})

    if not values:
        return jsonify({"success": False, "error": "No values provided"}), 400

    # Extract metadata
    ip_address = request.headers.get("X-Forwarded-For", request.remote_addr)
    user_agent = request.headers.get("User-Agent")
    referrer = request.headers.get("Referer")

    utm_params = {
        "utm_source": data.get("utm_source") or request.args.get("utm_source"),
        "utm_medium": data.get("utm_medium") or request.args.get("utm_medium"),
        "utm_campaign": data.get("utm_campaign") or request.args.get("utm_campaign"),
        "utm_term": data.get("utm_term") or request.args.get("utm_term"),
        "utm_content": data.get("utm_content") or request.args.get("utm_content"),
    }

    try:
        from services.form_service import submit_form as svc_submit
        result = svc_submit(
            slug=slug,
            values=values,
            ip_address=ip_address,
            user_agent=user_agent,
            referrer=referrer,
            utm_params=utm_params,
        )
        return jsonify(result), 201
    except ValueError as e:
        error_val = e.args[0] if e.args else str(e)
        if isinstance(error_val, dict) and "validation_errors" in error_val:
            return jsonify({"success": False, "errors": error_val["validation_errors"]}), 422
        return jsonify({"success": False, "error": str(error_val)}), 400
    except Exception as e:
        logger.error(f"Error submitting form {slug}: {e}")
        return jsonify({"success": False, "error": "Submission failed"}), 500
