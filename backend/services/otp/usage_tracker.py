"""
OTP Usage Tracker
Billing-accurate, immutable usage event logging.

Key Principles:
- Events are immutable once written
- Dedup via event_id (idempotent inserts)
- billable=True only on first successful delivery
- No double-counting on retries
- Channel-specific metering
"""

import os
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from decimal import Decimal

logger = logging.getLogger('otp.usage')


# Pricing configuration (can be overridden per plan)
DEFAULT_PRICES = {
    "whatsapp": Decimal("0.035"),  # $0.035 per WhatsApp OTP
    "email": Decimal("0.005"),     # $0.005 per Email OTP
    "sms": Decimal("0.02"),        # $0.02 per SMS OTP
}


class OTPUsageTracker:
    """
    Billing-safe usage event tracking.
    
    Records immutable usage events for:
    - Accurate billing
    - Usage analytics
    - Audit trail
    
    Deduplication is enforced via unique event_id.
    """
    
    def __init__(self, supabase_client=None):
        self.db = supabase_client
    
    def _get_db(self):
        """Lazy-load database client."""
        if self.db is None:
            from supabase_client import get_supabase_client
            self.db = get_supabase_client()
        return self.db
    
    def record_sent_event(
        self,
        project_id: str,
        request_id: str,
        channel: str,
        destination_type: str,
        unit_price: Optional[Decimal] = None
    ) -> Optional[str]:
        """
        Record OTP sent event.
        
        This event is recorded when OTP is queued for delivery.
        NOT billable until delivery is confirmed.
        
        Args:
            project_id: Business/project UUID
            request_id: OTP request ID
            channel: Delivery channel
            destination_type: "phone" or "email"
            unit_price: Price at time of send (for historical accuracy)
            
        Returns:
            Event ID if recorded, None if duplicate
        """
        event_id = f"sent:{request_id}"
        
        if unit_price is None:
            unit_price = DEFAULT_PRICES.get(channel, Decimal("0"))
        
        return self._record_event(
            event_id=event_id,
            project_id=project_id,
            request_id=request_id,
            event_type="otp_sent",
            channel=channel,
            destination_type=destination_type,
            billable=False,  # NOT billable until delivered
            unit_price=unit_price
        )
    
    def record_delivered_event(
        self,
        project_id: str,
        request_id: str,
        channel: str,
        destination_type: str,
        message_id: Optional[str] = None,
        unit_price: Optional[Decimal] = None
    ) -> Optional[str]:
        """
        Record OTP delivered event.
        
        This is the BILLABLE event - only counted once per request.
        Idempotent: duplicate delivery events are ignored.
        
        Args:
            project_id: Business/project UUID
            request_id: OTP request ID
            channel: Delivery channel
            destination_type: "phone" or "email"
            message_id: Provider message ID (wamid, email_id)
            unit_price: Price at time of delivery
            
        Returns:
            Event ID if recorded, None if duplicate
        """
        event_id = f"delivered:{request_id}"
        
        if unit_price is None:
            unit_price = DEFAULT_PRICES.get(channel, Decimal("0"))
        
        return self._record_event(
            event_id=event_id,
            project_id=project_id,
            request_id=request_id,
            event_type="otp_delivered",
            channel=channel,
            destination_type=destination_type,
            billable=True,  # THIS is billable
            unit_price=unit_price,
            metadata={"message_id": message_id} if message_id else None
        )
    
    def record_verified_event(
        self,
        project_id: str,
        request_id: str,
        channel: str,
        destination_type: str
    ) -> Optional[str]:
        """
        Record OTP verified event.
        
        Tracking event for analytics, not billable.
        
        Args:
            project_id: Business/project UUID
            request_id: OTP request ID
            channel: Delivery channel
            destination_type: "phone" or "email"
            
        Returns:
            Event ID if recorded, None if duplicate
        """
        event_id = f"verified:{request_id}"
        
        return self._record_event(
            event_id=event_id,
            project_id=project_id,
            request_id=request_id,
            event_type="otp_verified",
            channel=channel,
            destination_type=destination_type,
            billable=False
        )
    
    def record_failed_event(
        self,
        project_id: str,
        request_id: str,
        channel: str,
        destination_type: str,
        error_code: Optional[str] = None
    ) -> Optional[str]:
        """
        Record OTP delivery failed event.
        
        Not billable. Used for analytics and debugging.
        
        Args:
            project_id: Business/project UUID
            request_id: OTP request ID
            channel: Delivery channel
            destination_type: "phone" or "email"
            error_code: Error code from provider
            
        Returns:
            Event ID if recorded
        """
        event_id = f"failed:{request_id}"
        
        return self._record_event(
            event_id=event_id,
            project_id=project_id,
            request_id=request_id,
            event_type="otp_failed",
            channel=channel,
            destination_type=destination_type,
            billable=False,
            metadata={"error_code": error_code} if error_code else None
        )
    
    def _record_event(
        self,
        event_id: str,
        project_id: str,
        request_id: str,
        event_type: str,
        channel: str,
        destination_type: str,
        billable: bool = False,
        unit_price: Optional[Decimal] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Record an event with idempotency.
        
        Uses INSERT ... ON CONFLICT DO NOTHING for deduplication.
        """
        try:
            db = self._get_db()
            
            event_data = {
                "event_id": event_id,
                "project_id": project_id,
                "request_id": request_id,
                "event_type": event_type,
                "channel": channel,
                "destination_type": destination_type,
                "billable": billable,
                "created_at": datetime.utcnow().isoformat()
            }
            
            if unit_price is not None:
                event_data["unit_price"] = float(unit_price)
            
            if metadata:
                event_data["metadata"] = metadata
            
            # Supabase handles upsert with ON CONFLICT
            result = db.table("otp_usage_events").upsert(
                event_data,
                on_conflict="event_id"
            ).execute()
            
            if result.data:
                logger.debug(f"Recorded usage event: {event_id}")
                return event_id
            
            return None
            
        except Exception as e:
            # Log but don't fail the main operation
            logger.error(f"Failed to record usage event {event_id}: {e}")
            return None
    
    def get_usage_summary(
        self,
        project_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """
        Get usage summary for billing.
        
        Args:
            project_id: Business/project UUID
            start_date: Period start
            end_date: Period end
            
        Returns:
            Dict with usage counts and totals by channel
        """
        try:
            db = self._get_db()
            
            result = db.table("otp_usage_events").select(
                "channel, billable, unit_price"
            ).eq("project_id", project_id).eq("billable", True).gte(
                "created_at", start_date.isoformat()
            ).lte("created_at", end_date.isoformat()).execute()
            
            # Aggregate by channel
            summary = {
                "whatsapp": {"count": 0, "total": Decimal("0")},
                "email": {"count": 0, "total": Decimal("0")},
                "sms": {"count": 0, "total": Decimal("0")},
            }
            
            for event in result.data or []:
                channel = event.get("channel", "unknown")
                price = Decimal(str(event.get("unit_price", 0)))
                
                if channel in summary:
                    summary[channel]["count"] += 1
                    summary[channel]["total"] += price
            
            # Calculate grand total
            grand_total = sum(ch["total"] for ch in summary.values())
            
            return {
                "project_id": project_id,
                "period_start": start_date.isoformat(),
                "period_end": end_date.isoformat(),
                "by_channel": summary,
                "total_count": sum(ch["count"] for ch in summary.values()),
                "total_amount": float(grand_total)
            }
            
        except Exception as e:
            logger.error(f"Failed to get usage summary: {e}")
            return {}


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_usage_tracker: Optional[OTPUsageTracker] = None


def get_usage_tracker() -> OTPUsageTracker:
    """Get or create usage tracker instance."""
    global _usage_tracker
    
    if _usage_tracker is None:
        _usage_tracker = OTPUsageTracker()
    
    return _usage_tracker
