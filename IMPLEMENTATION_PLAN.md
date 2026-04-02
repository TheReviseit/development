# Implementation Plan

# Goal: Consolidate AI response handling for Instagram and WhatsApp channels into a single, production‑grade service, eliminate duplicated Celery task logic, and ensure FAANG‑level architecture, observability, and testing.

## 1. Problem Definition
- **Current State**: `messaging_tasks.py` defines `AIResponseService` protocol and a `GeminiAIResponseService` implementation used by Instagram processing. WhatsApp code (`backend/app.py` and `services/messaging/sdk.py`) invokes a separate AI pathway (via legacy `AIBrain` or direct calls) resulting in duplicated AI logic.
- **Desired State**: A unified AI response service that both Instagram and WhatsApp channels consume, reducing code duplication, simplifying maintenance, and guaranteeing consistent AI behavior across channels.
- **Functional Requirements**
  - All inbound messages (Instagram, WhatsApp) must pass through the same AI generation pipeline.
  - Preserve channel‑specific rate‑limits and token handling.
  - Maintain existing fallback to rule‑engine when AI is disabled.
- **Non‑Functional Requirements**
  - **Scalability**: Service must handle high QPS for both channels (Instagram ~200 msgs/recipient/24h, WhatsApp ~1600 chars per message).
  - **Observability**: Centralized metrics, tracing, and logging for AI calls.
  - **Security**: Validate and sanitize inputs, enforce per‑tenant isolation.
  - **Reliability**: Per‑tenant circuit breaker, idempotency, graceful degradation.

## 2. System Architecture
- **High‑Level Components**
  1. **UnifiedAIService** (new module `services/ai/unified_service.py`)
     - Implements `AIResponseService` protocol.
     - Wraps Gemini (or other LLM) calls.
  2. **Channel Normalizers** (`instagram_normalizer.py`, `whatsapp_normalizer.py`)
     - Convert raw webhook payloads to `NormalizedMessage`.
  3. **Messaging Pipeline** (existing Celery tasks in `messaging_tasks.py`)
     - Updated to invoke `UnifiedAIService` regardless of channel.
  4. **CircuitBreaker & Metrics** (reuse existing `_TenantCircuitBreaker` and `_PipelineMetrics`).
- **Data Flow**
  1. Webhook → Normalizer → Celery `process_inbound_message`.
  2. Tenant resolution → Idempotency guard.
  3. AI generation via `UnifiedAIService`.
  4. Dispatch via `MessageDispatcher` (unchanged).

## 3. API & Contract Design
- **`UnifiedAIService.generate(context: AIContext) -> AIResult`**
  - Input: `AIContext` (message text, tenant, channel, tokens, trace_id).
  - Output: `AIResult` (success, reply_text, intent, latency, error, was_cached).
- **Existing `AIResponseService` protocol** remains unchanged; `UnifiedAIService` will be the concrete implementation.
- **Configuration** via environment variables `UNIFIED_AI_PROVIDER=gemini|openai|claude`.

## 4. File & Module Structure
| Path | Responsibility |
|------|-----------------|
| `services/ai/unified_service.py` | New unified AI implementation (singleton). |
| `services/messaging/normalizers/instagram_normalizer.py` | Existing – no change. |
| `services/messaging/normalizers/whatsapp_normalizer.py` | Add (if missing) to produce `NormalizedMessage`. |
| `backend/tasks/messaging_tasks.py` | Update imports to use `UnifiedAIService`. Refactor AI fallback logic to call the unified service. |
| `backend/app.py` | Remove direct AI calls; route all inbound processing through Celery tasks. |
| `backend/tasks/notifications.py` (if any) | Ensure any notification generation uses unified AI for templating. |

## 5. Execution Plan (Atomic Steps)
1. **Create Unified AI Module**
   - Add `services/ai/unified_service.py` with class `UnifiedAIService` implementing `AIResponseService`.
   - Include provider selection logic, caching layer, and error handling.
2. **Expose Singleton Getter**
   - Add `_get_unified_ai_service()` similar to existing `_get_ai_service` pattern.
3. **Add WhatsApp Normalizer** (if not present)
   - Implement `WhatsAppNormalizer` converting webhook JSON to `NormalizedMessage`.
4. **Update `messaging_tasks.process_inbound_message`**
   - Replace channel‑specific AI calls with `UnifiedAIService.generate`.
   - Pass `channel` in `AIContext` for provider‑specific token handling.
5. **Refactor `backend/app.py`**
   - Ensure inbound routes only enqueue Celery tasks; remove any direct AI invocation.
6. **Update Dependency Injection**
   - In `celery_app.py`, register the unified AI service as a shared resource.
7. **Metrics & Tracing Enhancements**
   - Add new metric `ai_calls_total` and `ai_latency` in `_PipelineMetrics`.
   - Ensure trace_id propagates to AI calls.
8. **Security Checks**
   - Validate `message_text` length (max 1600 for WhatsApp, 2000 for Instagram) before AI call.
   - Sanitize any user‑provided data used in prompts.
9. **Testing**
   - Unit tests for `UnifiedAIService` covering provider selection, error paths.
   - Integration test: simulate Instagram and WhatsApp webhook payloads, verify same AI response flow.
   - Load test: mock high QPS to ensure circuit breaker triggers per tenant.
10. **Observability**
    - Add structured logs for AI request/response with tenant and channel tags.
    - Export metrics to Prometheus endpoint (if existing).
11. **Rollback Strategy**
    - Feature flag `USE_UNIFIED_AI` (default false). Deploy with flag off; enable after validation.
    - If failures detected, toggle flag off to revert to legacy paths.
12. **Documentation**
    - Update README and architecture diagram to reflect unified AI service.
    - Add API docs for `UnifiedAIService`.

## 6. Edge Cases & Failure Modes
- **Provider Unavailable**: Fallback to cached response or rule‑engine only.
- **Tenant Circuit Breaker Open**: Skip AI call, log and proceed with rule fallback.
- **Message Exceeds Channel Limits**: Split long messages before AI call (reuse existing split logic).
- **Missing Tokens**: Return explicit error and abort processing; metrics `ai_missing_token` incremented.

## 7. Performance & Scalability
- **Caching**: In‑process LRU cache for recent prompts per tenant (max 500 entries).
- **Connection Pooling**: Reuse HTTP client sessions for LLM API.
- **Rate‑Limit Awareness**: `UnifiedAIService` checks per‑tenant quota before call.

## 8. Security Model
- Input sanitization using `bleach` for any HTML content.
- Ensure AI prompts do not expose internal identifiers.
- Use per‑tenant API keys; never log raw tokens.

## 9. Observability Plan
- **Logging**: JSON‑structured logs with fields `tenant_id`, `channel`, `trace_id`, `ai_provider`.
- **Metrics**: `ai_calls_total`, `ai_success_total`, `ai_failure_total`, `ai_latency_ms`.
- **Tracing**: Propagate `trace_id` to external LLM request headers.

## 10. Testing Strategy
- **Unit Tests**: `tests/services/ai/test_unified_service.py` covering success, provider errors, circuit breaker.
- **Integration Tests**: End‑to‑end test simulating both Instagram and WhatsApp inbound flows.
- **Load Tests**: Use Locust script to generate 500 msgs/sec across multiple tenants.
- **Security Tests**: Fuzz inputs to ensure sanitization.

## 11. Rollback Strategy
- Deploy with `USE_UNIFIED_AI=False`.
- Enable flag after smoke tests.
- Monitor `ai_failure_total`; if >5% revert flag.
- Database migrations (if any) are additive and reversible.

---
**User Review Required**
> Please confirm that the above plan aligns with your expectations. Specifically:
> - Do you want the unified AI service to replace all existing AI calls for both Instagram and WhatsApp?
> - Should the feature flag `USE_UNIFIED_AI` be introduced for gradual rollout?
> - Are there any additional channels or providers you anticipate supporting in the future?

[!IMPORTANT] The implementation will not proceed until you approve this plan.

---
**Verification Plan**
- Automated test suite execution (`pytest -q`).
- Manual verification of a sample Instagram and WhatsApp conversation via the UI.
- Prometheus metrics inspection for `ai_calls_total`.

---
**Artifact Metadata**
- Artifact Type: implementation_plan
- Request Feedback: true
- Summary: Consolidate AI handling for Instagram and WhatsApp into a unified service.
