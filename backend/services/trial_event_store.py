"""
Trial Event Store — Versioned, Durable Event System
================================================

Event Sourcing with:
- Schema versioning
- Exactly-once guarantees
- Full replay capability
- Event transformation between versions

This is the FOUNDATION for Stripe-level event reliability.
"""

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Dict, Any, List, Callable

logger = logging.getLogger('reviseit.trial_event_store')


# =============================================================================
# EVENT SCHEMA VERSIONS
# =============================================================================

CURRENT_EVENT_VERSION = 1
SUPPORTED_VERSIONS = {1}  # Can upgrade from these versions


# =============================================================================
# EVENT TYPES
# =============================================================================

class TrialEventType(str, Enum):
    """All trial lifecycle event types with versioning."""
    TRIAL_STARTED_V1 = 'trial.started.v1'
    TRIAL_EXTENDED_V1 = 'trial.extended.v1'
    TRIAL_EXPIRING_SOON_V1 = 'trial.expiring_soon.v1'
    TRIAL_EXPIRED_V1 = 'trial.expired.v1'
    TRIAL_CONVERTED_V1 = 'trial.converted.v1'
    TRIAL_CANCELLED_V1 = 'trial.cancelled.v1'
    TRIAL_ABUSE_DETECTED_V1 = 'trial.abuse_detected.v1'


# =============================================================================
# EVENT PAYLOAD (Versioned Schema)
# =============================================================================

@dataclass(frozen=True)
class TrialEvent:
    """
    Immutable, versioned trial event.

    Schema:
    - event_id: Global unique ID
    - event_type: Versioned type (e.g., trial.started.v1)
    - event_version: Schema version (1, 2, 3...)
    - aggregate_id: Trial ID
    - aggregate_type: 'trial'
    - timestamp: When event occurred
    - sequence: Monotonic sequence number
    - idempotency_key: Prevents duplicates
    - causation_id: What triggered this event
    - correlation_id: Groups related events
    - payload: Versioned event data
    - metadata: Processing metadata
    """
    event_id: str
    event_type: str
    event_version: int
    aggregate_id: str
    aggregate_type: str = 'trial'

    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    sequence: int = 0

    idempotency_key: Optional[str] = None
    causation_id: Optional[str] = None
    correlation_id: Optional[str] = None

    payload: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'event_id': self.event_id,
            'event_type': self.event_type,
            'event_version': self.event_version,
            'aggregate_id': self.aggregate_id,
            'aggregate_type': self.aggregate_type,
            'timestamp': self.timestamp.isoformat(),
            'sequence': self.sequence,
            'idempotency_key': self.idempotency_key,
            'causation_id': self.causation_id,
            'correlation_id': self.correlation_id,
            'payload': self.payload,
            'metadata': self.metadata,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True)

    @property
    def checksum(self) -> str:
        """SHA256 checksum for integrity verification."""
        return hashlib.sha256(self.to_json().encode()).hexdigest()


# =============================================================================
# EVENT UPGRADERS (Schema Migration)
# =============================================================================

class EventUpgrader:
    """
    Upgrades events from older schemas to newer versions.

    Usage:
        upgrader = EventUpgrader()
        upgraded = upgrader.upgrade(event_v1, target_version=2)
    """

    UPGRADE_PATHWAYS: Dict[str, Callable[[Dict], Dict]] = {
        # V1 → V2 would go here when needed
        # 'trial.started.v1': upgrade_started_v1_to_v2,
    }

    def __init__(self):
        self._upgraders = self.UPGRADE_PATHWAYS

    def can_upgrade(self, event: TrialEvent, target_version: int) -> bool:
        """Check if event can be upgraded."""
        if target_version not in SUPPORTED_VERSIONS:
            return False
        if event.event_version > target_version:
            return False  # Can't downgrade
        return True

    def upgrade(self, event: TrialEvent, target_version: int = CURRENT_EVENT_VERSION) -> TrialEvent:
        """
        Upgrade event to target schema version.

        Uses chain of upgraders to reach target version.
        """
        if event.event_version == target_version:
            return event

        if not self.can_upgrade(event, target_version):
            raise ValueError(
                f"Cannot upgrade {event.event_type} from v{event.event_version} to v{target_version}"
            )

        current_event = event
        current_version = event.event_version

        # Apply upgraders in sequence
        while current_version < target_version:
            next_version = current_version + 1
            upgrader_key = f"{current_event.event_type.split('.v')[0]}.v{current_version}"

            if upgrader_key not in self._upgraders:
                raise ValueError(f"No upgrader found for {upgrader_key}")

            # Apply upgrade
            upgraded_payload = self._upgraders[upgrader_key](current_event.payload)
            current_event = TrialEvent(
                event_id=current_event.event_id,
                event_type=current_event.event_type.replace(f'.v{current_version}', f'.v{next_version}'),
                event_version=next_version,
                aggregate_id=current_event.aggregate_id,
                aggregate_type=current_event.aggregate_type,
                timestamp=current_event.timestamp,
                sequence=current_event.sequence,
                idempotency_key=current_event.idempotency_key,
                causation_id=current_event.causation_id,
                correlation_id=current_event.correlation_id,
                payload=upgraded_payload,
                metadata={
                    **current_event.metadata,
                    f'upgraded_from_v{current_version}': True,
                },
            )
            current_version = next_version

        return current_event


# =============================================================================
# EVENT STORE (Durable Persistence)
# =============================================================================

class TrialEventStore:
    """
    Durable event store with replay capability.

    Features:
    - Append-only event log
    - Idempotency (exactly-once)
    - Sequence numbering (ordering)
    - Causation tracking
    - Correlation grouping
    - Full replay capability
    """

    def __init__(self, supabase_client):
        self._db = supabase_client
        self._upgrader = EventUpgrader()
        self._logger = logger

    def append(
        self,
        event: TrialEvent,
    ) -> TrialEvent:
        """
        Append event to store (idempotent).

        If idempotency_key exists, returns existing event.
        """
        # Check idempotency
        if event.idempotency_key:
            existing = self._get_by_idempotency_key(event.idempotency_key)
            if existing:
                self._logger.info(f"event_already_exists idempotency_key={event.idempotency_key}")
                return existing

        # Get next sequence
        sequence = self._get_next_sequence(event.aggregate_id)

        # Create event with sequence
        event_with_sequence = TrialEvent(
            event_id=event.event_id,
            event_type=event.event_type,
            event_version=event.event_version,
            aggregate_id=event.aggregate_id,
            aggregate_type=event.aggregate_type,
            timestamp=event.timestamp,
            sequence=sequence,
            idempotency_key=event.idempotency_key,
            causation_id=event.causation_id,
            correlation_id=event.correlation_id,
            payload=event.payload,
            metadata=event.metadata,
        )

        # Persist
        self._db.table('trial_events').insert(event_with_sequence.to_dict()).execute()

        self._logger.info(
            f"event_appended event_id={event.event_id} "
            f"type={event.event_type} sequence={sequence}"
        )

        return event_with_sequence

    def get_by_id(
        self,
        event_id: str,
    ) -> Optional[TrialEvent]:
        """Get event by ID."""
        result = self._db.table('trial_events').select('*').eq(
            'event_id', event_id
        ).execute()

        if not result.data:
            return None

        return self._dict_to_event(result.data[0])

    def get_events_for_aggregate(
        self,
        aggregate_id: str,
        from_sequence: int = 0,
    ) -> List[TrialEvent]:
        """Get all events for an aggregate (in order)."""
        result = self._db.table('trial_events').select('*').eq(
            'aggregate_id', aggregate_id
        ).gte('sequence', from_sequence).order('sequence').execute()

        return [self._dict_to_event(r) for r in result.data]

    def replay(
        self,
        aggregate_id: str,
        from_sequence: int = 0,
    ) -> List[TrialEvent]:
        """
        Replay events for an aggregate from a given sequence.

        Used for:
        - Rebuilding aggregate state
        - Event processor recovery
        - Debugging
        """
        return self.get_events_for_aggregate(aggregate_id, from_sequence)

    def replay_all(
        self,
        from_timestamp: Optional[datetime] = None,
        event_types: Optional[List[str]] = None,
    ) -> List[TrialEvent]:
        """
        Replay ALL events matching criteria.

        Used for:
        - Building read models
        - Analytics
        - Event processor recovery
        """
        query = self._db.table('trial_events').select('*')

        if from_timestamp:
            query = query.gte('timestamp', from_timestamp.isoformat())

        if event_types:
            query = query.in_('event_type', event_types)

        query = query.order('timestamp')

        result = query.execute()
        return [self._dict_to_event(r) for r in result.data]

    def get_last_event(self, aggregate_id: str) -> Optional[TrialEvent]:
        """Get the last event for an aggregate."""
        result = self._db.table('trial_events').select('*').eq(
            'aggregate_id', aggregate_id
        ).order('sequence', desc=True).limit(1).execute()

        if not result.data:
            return None

        return self._dict_to_event(result.data[0])

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================

    def _get_by_idempotency_key(self, key: str) -> Optional[TrialEvent]:
        """Check if event with idempotency key exists."""
        result = self._db.table('trial_events').select('*').eq(
            'idempotency_key', key
        ).limit(1).execute()

        if not result.data:
            return None

        return self._dict_to_event(result.data[0])

    def _get_next_sequence(self, aggregate_id: str) -> int:
        """Get next sequence number for aggregate."""
        result = self._db.table('trial_events').select('sequence').eq(
            'aggregate_id', aggregate_id
        ).order('sequence', desc=True).limit(1).execute()

        if not result.data:
            return 1

        return result.data[0]['sequence'] + 1

    def _dict_to_event(self, data: Dict[str, Any]) -> TrialEvent:
        """Convert database row to TrialEvent."""
        return TrialEvent(
            event_id=data['event_id'],
            event_type=data['event_type'],
            event_version=data['event_version'],
            aggregate_id=data['aggregate_id'],
            aggregate_type=data.get('aggregate_type', 'trial'),
            timestamp=datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00')),
            sequence=data['sequence'],
            idempotency_key=data.get('idempotency_key'),
            causation_id=data.get('causation_id'),
            correlation_id=data.get('correlation_id'),
            payload=data.get('payload', {}),
            metadata=data.get('metadata', {}),
        )


# =============================================================================
# EVENT PROJECTION (Build Read Models)
# =============================================================================

class TrialProjection:
    """
    Projects events into read models.

    Usage:
        projection = TrialProjection(event_store)
        state = projection.project('trial-uuid')
    """

    def __init__(self, event_store: TrialEventStore):
        self._event_store = event_store

    def project(self, trial_id: str) -> Dict[str, Any]:
        """
        Project trial from event stream.

        Returns current state as dict.
        """
        events = self._event_store.get_events_for_aggregate(trial_id)

        if not events:
            return {}

        # Apply events in order
        state = {}
        for event in events:
            state = self._apply_event(state, event)

        return state

    def _apply_event(self, state: Dict[str, Any], event: TrialEvent) -> Dict[str, Any]:
        """Apply single event to state."""
        event_type_base = event.event_type.split('.v')[0]

        if event_type_base == 'trial.started':
            return {
                **state,
                'id': event.aggregate_id,
                'status': 'active',
                'started_at': event.timestamp.isoformat(),
                'payload': event.payload,
            }

        if event_type_base == 'trial.extended':
            return {
                **state,
                'payload': event.payload,
                'extended_at': event.timestamp.isoformat(),
            }

        if event_type_base == 'trial.expiring_soon':
            return {**state, 'status': 'expiring_soon'}

        if event_type_base == 'trial.expired':
            return {**state, 'status': 'expired', 'expired_at': event.timestamp.isoformat()}

        if event_type_base == 'trial.converted':
            return {
                **state,
                'status': 'converted',
                'converted_at': event.timestamp.isoformat(),
                'converted_to_plan': event.payload.get('to_plan_slug'),
            }

        return state


# =============================================================================
# GLOBAL INSTANCE
# =============================================================================

_trial_event_store: Optional[TrialEventStore] = None


def get_trial_event_store() -> TrialEventStore:
    """Get singleton TrialEventStore instance."""
    global _trial_event_store

    if _trial_event_store is None:
        from supabase_client import get_supabase_client
        db = get_supabase_client()
        _trial_event_store = TrialEventStore(supabase_client=db)

    return _trial_event_store
