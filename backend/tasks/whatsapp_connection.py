"""
Celery tasks for WhatsApp connection engine v2.
"""

from __future__ import annotations

import logging

from celery_app import celery_app
from supabase_client import get_supabase_client
from services.whatsapp_connection.cleanup_worker import cleanup_whatsapp_connection_state
from services.whatsapp_connection.meta_sync_worker import sync_account_from_meta

logger = logging.getLogger("flowauxi.tasks.whatsapp_connection")


@celery_app.task(name="whatsapp_connection.cleanup", queue="low")
def cleanup_connection_state():
    client = get_supabase_client()
    if not client:
        logger.warning("whatsapp_connection_cleanup_no_supabase")
        return {"skipped": True}
    return cleanup_whatsapp_connection_state(client)


@celery_app.task(name="whatsapp_connection.sync_account", queue="default")
def sync_connection_account(account_id: str):
    client = get_supabase_client()
    if not client:
        logger.warning("whatsapp_connection_sync_no_supabase account_id=%s", account_id)
        return {"skipped": True, "account_id": account_id}
    return sync_account_from_meta(client, account_id)
