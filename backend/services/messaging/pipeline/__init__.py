"""
Message Processing Pipeline — FAANG-Grade Orchestration
========================================================

Modular pipeline stages for processing inbound messages through:
    1. Tenant Resolution → 2. Business Data Loading → 3. Context Building
    → 4. AI Generation → 5. Outbox Write

Each stage is independently testable and replaceable.

Author: FlowAuxi Engineering
"""

from .tenant_resolver import TenantResolverStage, TenantContext, get_tenant_resolver_stage
from .business_loader import BusinessLoaderStage, BusinessContext, get_business_loader_stage
from .context_builder import ContextBuilderStage, AIContext, get_context_builder_stage
from .outbox_writer import OutboxWriterStage, AIResult, OutboxResult, get_outbox_writer_stage

__all__ = [
    'TenantResolverStage',
    'TenantContext',
    'get_tenant_resolver_stage',
    'BusinessLoaderStage',
    'BusinessContext',
    'get_business_loader_stage',
    'ContextBuilderStage',
    'AIContext',
    'get_context_builder_stage',
    'OutboxWriterStage',
    'AIResult',
    'OutboxResult',
    'get_outbox_writer_stage',
]
