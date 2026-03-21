"""
Form Service — Business Logic Layer

Handles all form CRUD, field management, publishing, public submissions,
and response retrieval. Uses Supabase client for database operations.
"""

import logging
import re
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

from domain.form_entities import (
    Form, FormField, FormResponse, ResponseValue,
    FormStatus, FieldType, ResponseStatus,
    generate_slug, generate_short_id, generate_unique_slug_candidate,
)

logger = logging.getLogger("reviseit.forms")


def _get_client():
    """Get the Supabase client (lazy import to avoid circular deps)."""
    from supabase_client import get_supabase_client
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Supabase client not available")
    return client


# =============================================================================
# FORM CRUD
# =============================================================================

def create_form(user_id: str, title: str = "Untitled Form", description: str = None) -> Dict[str, Any]:
    """Create a new form for a user."""
    client = _get_client()

    form = Form.create(user_id=user_id, title=title, description=description)

    # Ensure slug uniqueness with deterministic collision resolution
    # e.g. customer-feedback → customer-feedback-1 → customer-feedback-2
    base_slug = generate_slug(title)
    for attempt in range(20):
        candidate = generate_unique_slug_candidate(base_slug, attempt)
        existing = client.table("forms").select("id").eq("slug", candidate).execute()
        if not existing.data:
            form.slug = candidate
            break
    else:
        # Extremely unlikely fallback — append UUID fragment
        form.slug = f"{base_slug}-{form.id[:8]}"

    # Ensure short_id uniqueness
    short_id = form.short_id
    for attempt in range(10):
        existing = client.table("forms").select("id").eq("short_id", short_id).execute()
        if not existing.data:
            break
        short_id = generate_short_id()
    form.short_id = short_id

    data = form.to_dict()
    # Remove None timestamps that Supabase will auto-fill
    for key in ["published_at", "deleted_at"]:
        if data.get(key) is None:
            data.pop(key, None)

    result = client.table("forms").insert(data).execute()
    logger.info(f"📋 Form created: {form.id[:8]}... slug='{form.slug}' by user {user_id[:8]}...")
    return result.data[0] if result.data else data


def get_form(form_id: str, user_id: str = None) -> Optional[Dict[str, Any]]:
    """Get a form by ID. Optionally verify ownership."""
    client = _get_client()
    try:
        query = client.table("forms").select("*").eq("id", form_id).is_("deleted_at", "null")
        if user_id:
            query = query.eq("user_id", user_id)
        result = query.single().execute()
        return result.data
    except Exception as e:
        if "PGRST116" in str(e):
            return None
        logger.error(f"Error fetching form {form_id}: {e}")
        return None


def list_forms(user_id: str, status: str = None, page: int = 1, per_page: int = 20) -> Dict[str, Any]:
    """List forms for a user with pagination."""
    client = _get_client()

    query = client.table("forms").select("*", count="exact").eq("user_id", user_id).is_("deleted_at", "null")

    if status:
        query = query.eq("status", status)

    offset = (page - 1) * per_page
    query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)

    result = query.execute()
    return {
        "forms": result.data or [],
        "total": result.count or 0,
        "page": page,
        "per_page": per_page,
    }


def update_form(form_id: str, user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update form metadata (title, description, settings, theme, etc.).

    CRITICAL: Never modifies slug or form_id.
    Slug is immutable once created — use regenerate_slug() for explicit changes.
    """
    client = _get_client()

    # Fields that can be updated — slug is explicitly excluded
    allowed = {"title", "description", "settings", "theme", "cover_image_url", "utm_tracking", "webhooks"}
    safe_updates = {k: v for k, v in updates.items() if k in allowed}

    if not safe_updates:
        return get_form(form_id, user_id)

    # Auto-update slug if title changes
    if "title" in safe_updates:
        current_form = get_form(form_id, user_id)
        if current_form and current_form.get("title") != safe_updates["title"]:
            base_slug = generate_slug(safe_updates["title"])
            for attempt in range(20):
                candidate = generate_unique_slug_candidate(base_slug, attempt)
                existing = client.table("forms").select("id").eq("slug", candidate).neq("id", form_id).execute()
                if not existing.data:
                    safe_updates["slug"] = candidate
                    break
            else:
                safe_updates["slug"] = f"{base_slug}-{form_id[:8]}"

    try:
        result = client.table("forms").update(safe_updates).eq("id", form_id).eq("user_id", user_id).execute()
        if result.data:
            logger.info(f"📋 Form updated: {form_id[:8]}... (slug unchanged)")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Error updating form {form_id}: {e}")
        return None


def regenerate_slug(form_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """
    Explicitly regenerate the slug for a form based on its current title.

    This is the ONLY way a slug should change after creation.
    Uses deterministic collision resolution (customer-feedback-1, -2, etc.).
    """
    client = _get_client()

    form = get_form(form_id, user_id)
    if not form:
        return None

    title = form.get("title", "Untitled Form")
    base_slug = generate_slug(title)

    for attempt in range(20):
        candidate = generate_unique_slug_candidate(base_slug, attempt)
        existing = client.table("forms").select("id").eq("slug", candidate).neq("id", form_id).execute()
        if not existing.data:
            new_slug = candidate
            break
    else:
        new_slug = f"{base_slug}-{form_id[:8]}"

    try:
        result = client.table("forms").update({"slug": new_slug}).eq("id", form_id).eq("user_id", user_id).execute()
        if result.data:
            logger.info(f"🔄 Slug regenerated for form {form_id[:8]}...: '{form.get('slug')}' → '{new_slug}'")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Error regenerating slug for form {form_id}: {e}")
        return None


def delete_form(form_id: str, user_id: str) -> bool:
    """
    Phase 1 of two-phase delete: soft-delete a form.

    Sets deleted_at + status='archived' so the form is hidden from the user's
    UI immediately. Writes an immutable audit record to form_deletions.
    The form data (fields, responses, values) is still intact in the DB.

    Phase 2 (hard-delete + cascade) is handled by purge_deleted_forms(),
    called by the Celery beat task 24 hours later.
    """
    client = _get_client()
    try:
        now_iso = datetime.utcnow().isoformat()

        # Fetch form metadata for the audit snapshot (before soft-delete)
        form = get_form(form_id, user_id)
        if not form:
            logger.warning(f"delete_form: form {form_id[:8]}... not found for user {user_id[:8]}...")
            return False

        # Phase 1: Soft-delete
        result = client.table("forms").update({
            "deleted_at": now_iso,
            "status": "archived",
        }).eq("id", form_id).eq("user_id", user_id).is_("deleted_at", "null").execute()

        if not result.data:
            logger.warning(f"delete_form: no rows updated for form {form_id[:8]}... (already deleted?)")
            return False

        # Write immutable audit record — survives the eventual hard-delete
        try:
            client.table("form_deletions").insert({
                "form_id": form_id,
                "user_id": user_id,
                "form_title": form.get("title"),
                "form_slug": form.get("slug"),
                "response_count": form.get("response_count", 0),
                "soft_deleted_at": now_iso,
                "reason": "user_initiated",
                "metadata": {
                    "status_before_delete": form.get("status"),
                    "published_at": form.get("published_at"),
                },
            }).execute()
        except Exception as audit_err:
            # Non-fatal: soft-delete succeeded; audit failure is logged but not raised
            logger.error(f"⚠️ Audit log write failed for form {form_id[:8]}...: {audit_err}")

        logger.info(f"🗑️  Form soft-deleted: {form_id[:8]}... title='{form.get('title')}'")
        return True

    except Exception as e:
        logger.error(f"Error soft-deleting form {form_id}: {e}")
        return False


def purge_deleted_forms(older_than_hours: int = 24) -> Dict[str, Any]:
    """
    Phase 2 of two-phase delete: hard-delete soft-deleted forms after grace period.

    Design:
    - Fetches all forms where deleted_at < (now - grace_period)
    - Per-row hard-delete with `deleted_at IS NOT NULL` safety guard
      (prevents accidental deletion of live forms even if a bug passes wrong IDs)
    - Database ON DELETE CASCADE handles form_fields, form_responses, response_values
      automatically — no manual child-table deletions needed
    - Stamps hard_purged_at on the form_deletions audit record

    Returns a structured purge report dict.

    Called by: Celery beat task `purge_deleted_forms_task` (daily at 3 AM UTC)
               Admin endpoint POST /api/forms/admin/purge (manual trigger)
    """
    client = _get_client()
    from datetime import timedelta

    cutoff = (datetime.utcnow() - timedelta(hours=older_than_hours)).isoformat()

    # Fetch all soft-deleted forms past the grace period
    try:
        candidates = client.table("forms") \
            .select("id, title, user_id, deleted_at, response_count") \
            .not_.is_("deleted_at", "null") \
            .lt("deleted_at", cutoff) \
            .execute()
    except Exception as e:
        logger.error(f"purge_deleted_forms: failed to fetch candidates: {e}")
        return {"purged": 0, "errors": [str(e)], "cutoff": cutoff}

    purged = 0
    errors = []
    purge_timestamp = datetime.utcnow().isoformat()

    for form in (candidates.data or []):
        form_id = form["id"]
        try:
            # SAFETY GUARD: re-assert deleted_at IS NOT NULL on the DELETE itself.
            # If somehow a live form ID ends up here, this prevents accidental data loss.
            result = client.table("forms") \
                .delete() \
                .eq("id", form_id) \
                .not_.is_("deleted_at", "null") \
                .execute()

            if result.data:
                # DB CASCADE auto-deletes: form_fields, form_responses, response_values
                purged += 1
                logger.info(
                    f"🧹 Hard-purged form {form_id[:8]}... title='{form.get('title')}' "
                    f"(cascade: fields+responses+values deleted by DB)"
                )

                # Stamp audit record — find the matching soft-delete entry
                try:
                    client.table("form_deletions") \
                        .update({
                            "hard_purged_at": purge_timestamp,
                            "metadata": {
                                "purge_run_cutoff": cutoff,
                                "grace_period_hours": older_than_hours,
                            }
                        }) \
                        .eq("form_id", form_id) \
                        .is_("hard_purged_at", "null") \
                        .execute()
                except Exception as stamp_err:
                    # Non-fatal: the hard-delete succeeded even if audit stamp fails
                    logger.error(f"⚠️ Failed to stamp hard_purged_at for {form_id[:8]}...: {stamp_err}")

            else:
                # Row was already hard-deleted by a concurrent process — safe to skip
                logger.info(f"purge: form {form_id[:8]}... already gone (concurrent purge?), skipping")

        except Exception as e:
            error_msg = f"Failed to hard-delete form {form_id[:8]}...: {e}"
            logger.error(f"🔴 {error_msg}")
            errors.append({"form_id": form_id, "error": str(e)})

    report = {
        "purged": purged,
        "skipped": len(candidates.data or []) - purged - len(errors),
        "errors": errors,
        "error_count": len(errors),
        "cutoff_iso": cutoff,
        "grace_period_hours": older_than_hours,
        "purge_timestamp": purge_timestamp,
    }
    logger.info(
        f"🧹 Purge complete: {purged} hard-deleted, "
        f"{len(errors)} errors, cutoff={cutoff}"
    )
    return report


def restore_form(form_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """
    Restore a soft-deleted form within the grace period.

    Only works while deleted_at IS NOT NULL (i.e., before the purge job hard-deletes it).
    Sets status back to 'draft' and clears deleted_at. If the form has already been
    hard-purged, this returns None.
    """
    client = _get_client()
    try:
        result = client.table("forms") \
            .update({
                "deleted_at": None,
                "status": "draft",
            }) \
            .eq("id", form_id) \
            .eq("user_id", user_id) \
            .not_.is_("deleted_at", "null") \
            .execute()

        if result.data:
            restored = result.data[0]
            logger.info(f"♻️  Form restored: {form_id[:8]}... title='{restored.get('title')}'")
            # Clear hard_purged_at from audit log (restore happened before purge)
            try:
                client.table("form_deletions") \
                    .update({"metadata": {"restored_at": datetime.utcnow().isoformat()}}) \
                    .eq("form_id", form_id) \
                    .is_("hard_purged_at", "null") \
                    .execute()
            except Exception:
                pass  # Non-fatal
            return restored
        return None  # Already hard-purged or not found
    except Exception as e:
        logger.error(f"Error restoring form {form_id}: {e}")
        return None


def get_deleted_forms(user_id: str, page: int = 1, per_page: int = 20) -> Dict[str, Any]:
    """
    List soft-deleted forms for a user (within the grace period, restorable).

    Excludes forms that have already been hard-purged (they no longer exist in forms table).
    Used for a future "Trash" / restore UI.
    """
    client = _get_client()

    offset = (page - 1) * per_page
    result = client.table("forms") \
        .select("*", count="exact") \
        .eq("user_id", user_id) \
        .not_.is_("deleted_at", "null") \
        .order("deleted_at", desc=True) \
        .range(offset, offset + per_page - 1) \
        .execute()

    return {
        "forms": result.data or [],
        "total": result.count or 0,
        "page": page,
        "per_page": per_page,
    }


# =============================================================================
# PUBLISH / UNPUBLISH
# =============================================================================

def publish_form(form_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Publish a form (make it publicly accessible)."""
    client = _get_client()
    try:
        result = client.table("forms").update({
            "status": "published",
            "published_at": datetime.utcnow().isoformat(),
        }).eq("id", form_id).eq("user_id", user_id).is_("deleted_at", "null").execute()
        if result.data:
            logger.info(f"🚀 Form published: {form_id[:8]}...")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Error publishing form {form_id}: {e}")
        return None


def unpublish_form(form_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Revert form to draft status."""
    client = _get_client()
    try:
        result = client.table("forms").update({
            "status": "draft",
        }).eq("id", form_id).eq("user_id", user_id).execute()
        if result.data:
            logger.info(f"📝 Form unpublished: {form_id[:8]}...")
            return result.data[0]
        return None
    except Exception as e:
        logger.error(f"Error unpublishing form {form_id}: {e}")
        return None


# =============================================================================
# FIELD MANAGEMENT
# =============================================================================

def get_fields(form_id: str) -> List[Dict[str, Any]]:
    """Get all fields for a form, ordered by position."""
    client = _get_client()
    result = client.table("form_fields").select("*").eq("form_id", form_id).order("position").execute()
    return result.data or []


def _is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID v4."""
    import uuid as _uuid
    try:
        _uuid.UUID(value, version=4)
        return True
    except (ValueError, AttributeError):
        return False


def bulk_update_fields(form_id: str, user_id: str, fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Atomic bulk update of all fields for a form.

    Enterprise pattern: delete-all + insert-all.
    - Server owns `form_id` — client value is ignored (prevents FK mismatch).
    - Invalid/non-UUID `id` values are replaced with server-generated UUIDs.
    - If any insert fails, previously inserted fields in this batch are
      rolled back (best-effort) to prevent partial-save corruption.

    Each field dict should have: field_type, label, and optionally position.
    """
    import uuid as _uuid

    client = _get_client()

    # ── 1. Verify ownership ──────────────────────────────────────────────
    form = get_form(form_id, user_id)
    if not form:
        raise ValueError("Form not found or access denied")

    # ── 2. Snapshot existing fields (for rollback) ───────────────────────
    existing_fields = get_fields(form_id)

    # ── 3. Delete ALL existing fields (atomic: start fresh) ──────────────
    try:
        client.table("form_fields").delete().eq("form_id", form_id).execute()
    except Exception as e:
        logger.error(f"bulk_update_fields: failed to delete existing fields for {form_id[:8]}...: {e}")
        raise RuntimeError("Failed to clear existing fields. Save aborted.")

    # ── 4. Insert all incoming fields with server-enforced form_id ───────
    inserted_fields = []
    try:
        for idx, f in enumerate(fields):
            # Server generates valid UUID if client sent invalid ID (e.g. fld_xxx)
            field_id = f.get("id", "")
            if not _is_valid_uuid(field_id):
                field_id = str(_uuid.uuid4())

            field_data = {
                "id": field_id,
                "form_id": form_id,  # SERVER owns this — never trust client
                "field_type": f.get("field_type", "text"),
                "label": f.get("label", "Untitled Field"),
                "placeholder": f.get("placeholder"),
                "help_text": f.get("help_text"),
                "default_value": f.get("default_value"),
                "position": idx,
                "section": f.get("section"),
                "required": f.get("required", False),
                "validation": f.get("validation", {}),
                "options": f.get("options", []),
                "conditional": f.get("conditional"),
                "settings": f.get("settings", {}),
            }

            res = client.table("form_fields").insert(field_data).execute()

            if res.data:
                inserted_fields.append(res.data[0])
            else:
                logger.warning(f"bulk_update_fields: insert returned no data for field #{idx}")

    except Exception as e:
        # ── ROLLBACK: re-insert the old fields to prevent data loss ───────
        logger.error(f"bulk_update_fields: insert failed at field #{len(inserted_fields)}: {e}")
        logger.info(f"⏪ Rolling back: restoring {len(existing_fields)} previous fields...")
        try:
            # Clean up partially inserted fields
            client.table("form_fields").delete().eq("form_id", form_id).execute()
            # Re-insert the original snapshot
            for old_field in existing_fields:
                client.table("form_fields").insert(old_field).execute()
            logger.info(f"✅ Rollback complete for form {form_id[:8]}...")
        except Exception as rollback_err:
            logger.error(f"🔴 CRITICAL: rollback also failed for form {form_id[:8]}...: {rollback_err}")
        raise RuntimeError(f"Failed to save fields. Previous state restored. Error: {e}")

    logger.info(f"📋 Fields saved for form {form_id[:8]}...: {len(inserted_fields)} fields (atomic)")
    return inserted_fields


# =============================================================================
# PUBLIC FORM ACCESS
# =============================================================================

def get_public_form(slug: str) -> Optional[Dict[str, Any]]:
    """Get a published form by slug for public rendering."""
    client = _get_client()

    try:
        # Try slug first
        result = client.table("forms").select("*").eq("slug", slug).eq(
            "status", "published"
        ).is_("deleted_at", "null").single().execute()

        if result.data:
            form_data = result.data
            # Attach fields
            fields = get_fields(form_data["id"])
            form_data["fields"] = fields
            return form_data
    except Exception:
        pass

    # Try short_id fallback
    try:
        result = client.table("forms").select("*").eq("short_id", slug).eq(
            "status", "published"
        ).is_("deleted_at", "null").single().execute()

        if result.data:
            form_data = result.data
            fields = get_fields(form_data["id"])
            form_data["fields"] = fields
            return form_data
    except Exception:
        pass

    return None


def get_public_form_by_username(username: str, form_slug: str) -> Optional[Dict[str, Any]]:
    """
    Get a published form by workspace username + form slug.

    Resolves: /{username}/forms/{form_slug}
    Example:  /tesla/forms/customer-feedback

    Resolution chain (tries each until a match is found):
    1. username → businesses.url_slug_lower → user_id
    2. username → users.username → firebase_uid (user_id)
    3. username → slugified business_name match → user_id (fuzzy fallback)
    """
    client = _get_client()

    try:
        # Step 1: Resolve username to user_id via businesses table
        normalized = username.lower().strip()
        user_id = None

        # Strategy A: Match by url_slug_lower (primary, canonical)
        biz_result = client.table("businesses").select("user_id").eq(
            "url_slug_lower", normalized
        ).limit(1).execute()

        if biz_result.data and biz_result.data[0].get("user_id"):
            user_id = biz_result.data[0]["user_id"]
            logger.info(f"📋 Resolved workspace '{normalized}' via url_slug_lower → {user_id[:8]}...")

        # Strategy B: Match by users.username
        if not user_id:
            user_result = client.table("users").select("firebase_uid").eq(
                "username", normalized
            ).eq("username_status", "active").limit(1).execute()
            if user_result.data and user_result.data[0].get("firebase_uid"):
                user_id = user_result.data[0]["firebase_uid"]
                logger.info(f"📋 Resolved workspace '{normalized}' via users.username → {user_id[:8]}...")

        # Strategy C: Fuzzy match by slugified business_name
        # This handles the case where: business_name="Sales" → frontend shows /sales/forms/...
        # but url_slug might still be a UID fallback like "b5ad54bb"
        if not user_id:
            import re
            all_businesses = client.table("businesses").select(
                "user_id, business_name"
            ).not_.is_("business_name", "null").execute()

            for biz in (all_businesses.data or []):
                biz_name = biz.get("business_name", "")
                if biz_name:
                    # Slugify the business name the same way as the frontend
                    slugified = re.sub(r'[^a-z0-9]+', '-', biz_name.lower().strip())
                    slugified = re.sub(r'^-+|-+$', '', slugified)
                    if slugified == normalized:
                        user_id = biz.get("user_id")
                        logger.info(f"📋 Resolved workspace '{normalized}' via business_name '{biz_name}' → {user_id[:8]}...")

                        # Auto-fix: Update url_slug to match business_name for future lookups
                        try:
                            client.table("businesses").update({
                                "url_slug": slugified,
                                "url_slug_lower": slugified,
                            }).eq("user_id", user_id).execute()
                            logger.info(f"🔧 Auto-synced url_slug to '{slugified}' for user {user_id[:8]}...")
                        except Exception as sync_err:
                            logger.warning(f"⚠️ Auto-sync url_slug failed (non-critical): {sync_err}")
                        break

        if not user_id:
            logger.info(f"📋 Workspace '{normalized}' not found for form resolution")
            return None

        # Step 2: Look up form by slug + user_id (must be published)
        from supabase_client import resolve_user_id
        try:
            resolved_user_id = resolve_user_id(user_id, allow_firebase_fallback=True)
        except Exception:
            resolved_user_id = user_id

        result = client.table("forms").select("*").eq("slug", form_slug).eq(
            "user_id", resolved_user_id
        ).eq("status", "published").is_("deleted_at", "null").single().execute()

        if result.data:
            form_data = result.data
            fields = get_fields(form_data["id"])
            form_data["fields"] = fields
            # Attach username for URL construction
            form_data["_username"] = normalized
            return form_data

    except Exception as e:
        if "PGRST116" not in str(e):
            logger.error(f"Error resolving form /{username}/forms/{form_slug}: {e}")

    return None


# =============================================================================
# FORM SUBMISSION
# =============================================================================

def submit_form(
    slug: str,
    values: Dict[str, str],
    ip_address: str = None,
    user_agent: str = None,
    referrer: str = None,
    utm_params: Dict[str, str] = None,
) -> Dict[str, Any]:
    """
    Process a public form submission.

    Args:
        slug: Form slug or short_id
        values: Dict mapping field_id → value
        ip_address: Submitter's IP
        user_agent: Submitter's User-Agent
        referrer: HTTP Referer header
        utm_params: Dict with utm_source, utm_medium, etc.

    Returns:
        Submission result dict with response_id

    Raises:
        ValueError: If form not found, closed, or validation fails
    """
    client = _get_client()

    # Fetch form
    form_data = get_public_form(slug)
    if not form_data:
        raise ValueError("Form not found")

    # Check if accepting responses
    form = Form.from_dict(form_data)
    if not form.is_accepting_responses():
        closed_msg = form.settings.get("closedMessage", "This form is no longer accepting responses.")
        raise ValueError(closed_msg)

    fields = form_data.get("fields", [])
    field_map = {f["id"]: f for f in fields}

    # ── Validate submission using the schema-driven engine ──────────────
    # This replaces scattered hardcoded checks with a single pipeline
    # that mirrors the frontend validator exactly.
    from services.form_validator import validate_submission
    errors = validate_submission(fields, values)

    if errors:
        raise ValueError({"validation_errors": errors})

    # Create response
    utm = utm_params or {}
    response = FormResponse.create(
        form_id=form.id,
        ip_address=ip_address,
        user_agent=user_agent,
        referrer=referrer,
        utm_source=utm.get("utm_source"),
        utm_medium=utm.get("utm_medium"),
        utm_campaign=utm.get("utm_campaign"),
        utm_term=utm.get("utm_term"),
        utm_content=utm.get("utm_content"),
    )

    response_data = response.to_dict()
    # Remove None for cleaner insert
    response_data = {k: v for k, v in response_data.items() if v is not None}

    client.table("form_responses").insert(response_data).execute()

    # Insert response values
    for field_id, value in values.items():
        if field_id in field_map:
            rv = ResponseValue.create(
                response_id=response.id,
                field_id=field_id,
                value=str(value) if value is not None else None,
            )
            rv_data = rv.to_dict()
            rv_data = {k: v for k, v in rv_data.items() if v is not None}
            client.table("response_values").insert(rv_data).execute()

    logger.info(f"📨 Form submission received: form={form.id[:8]}... response={response.id[:8]}...")

    # ==== GOOGLE SHEETS INTEGRATION ====
    sheet_url = form.settings.get("google_sheet_url")
    if sheet_url:
        try:
            from services.google_sheets_service import append_row
            import datetime
            # Build the row matching headers: Submitted At, Fields..., IP, UTM x3
            valid_fields = [f for f in fields if f.get("field_type") not in ("heading", "divider", "hidden", "description", "spacer")]
            now_str = datetime.datetime.utcnow().strftime("%b %d, %Y, %I:%M %p")
            row = [now_str]
            for f in valid_fields:
                row.append(values.get(f["id"], ""))
            # Append metadata
            row.extend([
                ip_address or "", 
                utm.get("utm_source") or "", 
                utm.get("utm_medium") or "", 
                utm.get("utm_campaign") or ""
            ])
            # Fire and forget (ideally should be a Celery task but doing synchronously for now)
            append_row(sheet_url, row)
            logger.info(f"📊 Row appended to Google Sheet for form {form.id[:8]}")
        except Exception as e:
            logger.error(f"Failed to push to Google Sheet for form {form.id}: {e}")

    return {
        "success": True,
        "response_id": response.id,
        "message": form.settings.get("successMessage", "Thank you! Your response has been recorded."),
        "redirect_url": form.settings.get("successRedirectUrl"),
    }


# =============================================================================
# RESPONSE RETRIEVAL
# =============================================================================

def get_responses(
    form_id: str,
    user_id: str,
    page: int = 1,
    per_page: int = 50,
) -> Dict[str, Any]:
    """Get paginated responses for a form (owner only)."""
    client = _get_client()

    # Verify ownership
    form = get_form(form_id, user_id)
    if not form:
        raise ValueError("Form not found or access denied")

    # Fetch responses
    offset = (page - 1) * per_page
    resp_result = client.table("form_responses").select(
        "*", count="exact"
    ).eq("form_id", form_id).order(
        "submitted_at", desc=True
    ).range(offset, offset + per_page - 1).execute()

    responses = resp_result.data or []

    # Fetch fields for column headers
    fields = get_fields(form_id)

    # Fetch values for each response
    for resp in responses:
        values_result = client.table("response_values").select("*").eq("response_id", resp["id"]).execute()
        val_map = {}
        for v in (values_result.data or []):
            val_map[v["field_id"]] = v.get("value") or v.get("file_url")
        resp["values"] = val_map

    return {
        "responses": responses,
        "fields": fields,
        "total": resp_result.count or 0,
        "page": page,
        "per_page": per_page,
    }
