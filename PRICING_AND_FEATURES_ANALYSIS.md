# ReviseIt — Features, Architecture, Market Research & Pricing Recommendations 📋

> **Short summary:** ReviseIt is an AI-powered WhatsApp automation platform targeted at SMBs (India-first). This document collects features, component locations in the codebase, market pricing research, recommended pricing tiers, and next steps.

---

## 1) Product & positioning

- **Product:** AI-powered WhatsApp automation for businesses (auto-replies, templates, broadcasts, booking/order flows, analytics, multi-agent inbox).
- **Target customers:** SMBs and local businesses (India-focused; INR pricing is used across the UI).
- **Primary value props:** Reduce support load with AI replies, run marketing broadcasts, automate bookings/orders, and provide analytics and team inbox for customer operations.

---

## 2) Feature map (what the product offers) 🔧

Each feature below includes example file locations where it's implemented in the repo.

- WhatsApp messaging (text, images, templates, multi-tenant): `backend/whatsapp_service.py`, `backend/app.py`, `frontend/lib/api/whatsapp.ts`
- AI reply generation, intent detection, multi-language & LLM orchestration: `backend/ai_brain/` (eg. `ai_brain.py`, `chatgpt_engine.py`, `intents.py`)
- Appointment booking & order booking flows: `backend/ai_brain/appointment_handler.py`, `conversation_manager.py`
- Broadcast campaigns & template builder: `frontend/lib/api/whatsapp.ts`, `frontend/types/facebook-whatsapp.types.ts`
- Contact management, live chat dashboard, multi-agent inbox: frontend components + `conversation_manager.py`
- Analytics, LLM usage tracking, rate limiting, cost optimizer: `ai_brain/analytics.py`, `llm_usage_tracker.py`, `cost_optimizer.py`
- Integrations & infra: Firebase, Supabase (`supabase_client.py`, `firebase_client.py`), Redis (session/flow store), Google Sheets (setup docs)
- Admin APIs, webhooks & background jobs (Celery): `backend/app.py`, `celery_app.py`, `tasks/`
- Training & customization (FAQ training, AI personalities, templates): `ai_brain/templates.py`, `ai_brain/schemas.py`

> Note: I can export this mapping into a CSV or table if you want.

---

## 3) Existing pricing UI

- File: `frontend/app/components/PricingCards/PricingCards.tsx`
- Current placeholder plans: **Starter, Business, Pro** (prices shown: ₹1,499, ₹3,999, ₹8,999). We'll update these based on the cost model.

---

## 4) Market research insights (competitor snapshot) 🌐

- WhatsApp platform pricing patterns:
  - Providers separate **platform subscription** and **channel costs** (Meta template/conversation fees + BSP fees). Examples: WATI, Twilio, MessageBird, Gupshup.
  - Pricing models: tiered monthly subscriptions with included message/AI allowances + per-message or per-response overages; pay-as-you-go credits; per-seat pricing for team access.
- Example anchors:
  - WATI: ₹999 one-time credit starter, ₹4,499+/mo for higher tiers (India-focused features and broadcast credits).
  - Twilio: pass-through Meta fees + Twilio's per-message fee (transparent per-message calculator).
  - respond.io: $79–$279/mo (team-oriented; per-active-contact models).
  - LLM-focused platforms (Jasper): seat-based pricing (~$59/mo pro plan).

**Key takeaways:** platform fees should cover variable channel costs (Meta + LLM tokens) and fixed costs (support, infra); bundling limited included responses with overage pricing is standard and profitable.

---

## 5) Pricing strategy recommendations (concise) 💡

Pick a primary approach: **Tiered monthly subscriptions** with included AI responses + WhatsApp credits, and **overage fees**; offer add-ons for extra numbers, seats, and dedicated onboarding.

Suggested tiers (India-focused):

- **Starter (solo / micro)**

  - Price suggestion: **₹1,199 – ₹1,799 /mo**
  - Includes: 2,500 AI responses / mo, 1 WhatsApp number, up to 50 FAQ training entries, Live Chat Dashboard, Email Support
  - Overage: ₹0.12–₹0.50 per AI response (or per message) depending on our exact LLM+Meta cost

- **Business (growing)**

  - Price suggestion: **₹3,499 – ₹4,999 /mo**
  - Includes: ~8,000–10,000 AI responses / mo, 1–2 WhatsApp numbers, Broadcasts & Template Builder, Basic Analytics
  - Overage: discounted per-response rate (e.g., ₹0.10 / response)

- **Pro (scale / advanced)**

  - Price suggestion: **₹8,999 – ₹14,999 /mo**
  - Includes: 25,000+ AI responses / mo, multiple numbers, Advanced Workflow Automation, Multi-Agent Inbox, Advanced Analytics, API Access
  - Overage: lower per-response / per-message rate

- **Enterprise / Custom**
  - Custom pricing (volume discounts, dedicated onboarding, SSO, SLA). Start quote threshold: ₹30k+/mo

Why this range?

- Aligns with local market leaders (WATI, Twilio-addition) and supports LLM overhead; leaves room for margins after channel & LLM costs.

Alternative models to consider:

- Per-active-contact (monthly active contacts) — helpful for team inbox scenarios.
- Per-conversation pricing (aligns closer to Meta's conversation-fee model).

---

## 6) Suggested billing & product rules (operational tips) ⚙️

- Separate **platform subscription** vs **WhatsApp credits** and show both on invoices.
- Pre-bundle monthly included AI responses and allow purchasing additional response packs or per-response billing.
- Offer annual billing discounts (~15–20%) and promotional credit onboarding (e.g., 14-day free trial or ₹999 startup credit).
- Provide transparent docs: link to a WhatsApp price calculator and clearly show what is charged by Meta vs what is ReviseIt platform fee.

---

## 7) Suggested content for `PricingCards` (short copy + CTA ideas)

- Header: **"Flexible pricing for WhatsApp automation — start free for 14 days"**
- CTA: **Get Started** (trial), **Contact Sales** for enterprise
- For each plan: list the included AI responses, WhatsApp numbers, broadcast capability, support level, and overage note.

---

## 8) Next steps (recommended priorities) ▶️

1. **Run a cost model** (I can do this): estimate per-AI-response LLM cost + per-WhatsApp-template/conversation cost + infra/support → compute break-even and recommended markup. (I suggest this as the immediate next task.)
2. Use the cost model to finalize the exact USD/INR prices and overage rates.
3. Draft the final pricing page text and update `frontend/app/components/PricingCards/PricingCards.tsx` with the agreed numbers and micro-FAQ.
4. Add a pricing calculator for customers to estimate monthly costs (optional but high-conversion).

---

## 9) Notes & references

- Pricing UI file: `frontend/app/components/PricingCards/PricingCards.tsx`
- AI & LLM orchestration: `backend/ai_brain/ai_brain.py`
- WhatsApp messaging engine: `backend/whatsapp_service.py`
- Competitor references: WATI, Twilio, respond.io, Jasper — see internal research notes.

---

If you'd like, I can now:

- Build the per-response cost model and return exact break-even prices and margin-minimums, or
- Draft final copy for `PricingCards` (ready to paste into the component), or
- Export the feature→file map to CSV.

Choose one and I'll proceed. ✅
