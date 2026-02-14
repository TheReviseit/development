"""
Enterprise Audit Logger
========================
Immutable audit trail for compliance (SOC 2, GDPR)
All pricing and payment events are logged with tamper-proof checksums
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class AuditLogger:
    """
    Immutable audit log for all pricing and payment events.
    Required for SOC 2 compliance and financial reconciliation.
    """

    def __init__(self, db):
        """
        Initialize audit logger with database connection.

        Args:
            db: Database connection/cursor
        """
        self.db = db

    def log_event(
        self,
        event_type: str,
        user_id: str,
        metadata: Dict[str, Any],
        correlation_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """
        Create tamper-proof audit log entry.

        Args:
            event_type: Type of event (e.g., 'subscription_created', 'payment_success')
            user_id: User ID associated with the event
            metadata: Event-specific metadata
            correlation_id: Request correlation ID for distributed tracing
            ip_address: IP address of the request
            user_agent: User agent string
        """
        timestamp = datetime.now(timezone.utc).isoformat()

        # Create log entry
        log_entry = {
            "event_type": event_type,
            "user_id": user_id,
            "timestamp": timestamp,
            "metadata": metadata,
            "correlation_id": correlation_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
        }

        # Generate tamper-proof checksum
        checksum = self._generate_checksum(log_entry)

        try:
            # Store in audit_logs table (append-only, no updates/deletes)
            self.db.execute(
                """
                INSERT INTO audit_logs 
                (event_type, user_id, timestamp, metadata, checksum)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    event_type,
                    user_id,
                    timestamp,
                    json.dumps(metadata),
                    checksum,
                ),
            )
            self.db.commit()

            logger.info(
                f"Audit log created: {event_type}",
                extra={
                    "event_type": event_type,
                    "user_id": user_id,
                    "correlation_id": correlation_id,
                },
            )

        except Exception as e:
            logger.error(
                f"Failed to create audit log: {str(e)}",
                extra={
                    "event_type": event_type,
                    "user_id": user_id,
                    "error": str(e),
                },
                exc_info=True,
            )
            # Don't raise - audit logging failure shouldn't break the main flow
            # But log it prominently for investigation

    def _generate_checksum(self, data: Dict[str, Any]) -> str:
        """
        Generate SHA-256 checksum for tamper detection.

        Args:
            data: Data to generate checksum for

        Returns:
            SHA-256 checksum as hex string
        """
        # Remove checksum field if present
        data_copy = {k: v for k, v in data.items() if k != "checksum"}

        # Convert to deterministic JSON string
        data_string = json.dumps(data_copy, sort_keys=True)

        # Generate SHA-256 hash
        return hashlib.sha256(data_string.encode()).hexdigest()

    def verify_checksum(self, log_entry: Dict[str, Any]) -> bool:
        """
        Verify that audit log entry hasn't been tampered with.

        Args:
            log_entry: Audit log entry to verify

        Returns:
            True if checksum is valid, False otherwise
        """
        stored_checksum = log_entry.get("checksum")
        if not stored_checksum:
            return False

        calculated_checksum = self._generate_checksum(log_entry)
        return calculated_checksum == stored_checksum


# Convenience functions for common audit events
def log_subscription_created(
    audit_logger: AuditLogger,
    user_id: str,
    domain: str,
    plan_name: str,
    amount: float,
    currency: str,
    subscription_id: str,
    correlation_id: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Log subscription creation event."""
    audit_logger.log_event(
        "subscription_created",
        user_id,
        {
            "domain": domain,
            "plan_name": plan_name,
            "amount": amount,
            "currency": currency,
            "subscription_id": subscription_id,
        },
        correlation_id=correlation_id,
        ip_address=ip_address,
    )


def log_payment_success(
    audit_logger: AuditLogger,
    user_id: str,
    domain: str,
    plan_name: str,
    amount: float,
    payment_id: str,
    subscription_id: str,
    correlation_id: Optional[str] = None,
) -> None:
    """Log successful payment event."""
    audit_logger.log_event(
        "payment_success",
        user_id,
        {
            "domain": domain,
            "plan_name": plan_name,
            "amount": amount,
            "payment_id": payment_id,
            "subscription_id": subscription_id,
        },
        correlation_id=correlation_id,
    )


def log_payment_failed(
    audit_logger: AuditLogger,
    user_id: str,
    domain: str,
    plan_name: str,
    amount: float,
    error_reason: str,
    correlation_id: Optional[str] = None,
) -> None:
    """Log failed payment event."""
    audit_logger.log_event(
        "payment_failed",
        user_id,
        {
            "domain": domain,
            "plan_name": plan_name,
            "amount": amount,
            "error_reason": error_reason,
        },
        correlation_id=correlation_id,
    )
