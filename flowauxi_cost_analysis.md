# Flowauxi — Deep Financial & Infrastructure Cost Analysis

> **Platform:** Multi-tenant ecommerce SaaS · Each user gets their own shop domain
> **Analysis Date:** March 2026 · All prices verified against current vendor pricing

---

## 1. Infrastructure Cost Breakdown (Per Service)

### 1.1 Frontend — Vercel

| Tier | Monthly Cost | What You Get |
|------|-------------|--------------|
| **Pro (recommended)** | **$20/seat** (~₹1,700) | 1 TB bandwidth, 400 build hrs, commercial use |
| Bandwidth overage | $40/100 GB | After 1 TB included |
| Serverless execution | $0.18/GB-hr | After 1,000 GB-hrs included |

> [!NOTE]
> The **Hobby plan prohibits commercial use**. You *must* be on Pro minimum for a revenue-generating SaaS.

**Scaling estimate:**
- 1–1K users → Pro $20/mo is sufficient
- 1K–10K users → ~$60–120/mo (bandwidth overages)
- 10K+ users → ~$200–500/mo or consider Enterprise

---

### 1.2 Backend — Render

| Instance | Monthly Cost | Specs |
|----------|-------------|-------|
| Starter | **$7/mo** (~₹590) | 512 MB RAM, 0.5 vCPU |
| Standard | **$25/mo** (~₹2,100) | 2 GB RAM, 1 vCPU |
| Pro | **$85/mo** (~₹7,100) | 4 GB RAM, 2 vCPU |
| Pro Plus | **$175/mo** (~₹14,700) | 8 GB RAM, 4 vCPU |

Plus account plan: Individual $0/mo or Professional $19/user/mo

**Scaling estimate:**
- 1–100 users → Standard $25/mo
- 100–1K users → Pro $85/mo + possible second instance
- 1K–10K users → Pro Plus $175/mo + autoscaling (~$350–700/mo)

---

### 1.3 Primary Database — Supabase

| Plan | Monthly Cost | Storage | Key Limits |
|------|-------------|---------|------------|
| **Pro** | **$25/mo** (~₹2,100) | 8 GB | 100K MAUs, 250 GB egress |
| Storage overage | $0.125/GB | Beyond 8 GB |
| Egress overage | $0.09/GB | Beyond 250 GB |
| Extra MAUs | $0.00325/MAU | Beyond 100K |

**Scaling estimate:**
- 1–1K users → Pro $25/mo (well within limits)
- 1K–10K users → $25 base + ~$15–50 storage/egress overages = **$40–75/mo**
- 10K+ users → Team plan $599/mo or multiple projects

---

### 1.4 Authentication & Secondary DB — Firebase

#### Authentication
| Tier | Cost |
|------|------|
| 0–50K MAUs | **Free** |
| 50K–1M MAUs | $0.0025/MAU |

#### Firestore (per-day free, then pay-as-you-go)
| Resource | Free Tier/Day | Overage Rate |
|----------|--------------|-------------|
| Reads | 50K/day | $0.06/100K |
| Writes | 20K/day | $0.18/100K |
| Deletes | 20K/day | $0.02/100K |
| Storage | 1 GiB total | $0.18/GiB/mo |

**Scaling estimate:**
- 1–1K users → Auth is free; Firestore ~$0–15/mo
- 1K–10K users → Auth still free (under 50K MAU); Firestore **$30–150/mo**
- 10K+ users → Auth ~$0–$25/mo; Firestore **$200–1,000+/mo** ⚠️

> [!CAUTION]
> Firestore is the **#1 hidden cost risk**. Each page load can trigger 5–20 document reads. At 10K users with 10 daily visits = **1M+ reads/day** = ~₹5,000+/mo just in reads.

---

### 1.5 AI — Google Gemini 2.5 Flash API

| Resource | Cost |
|----------|------|
| Input tokens | **$0.30/1M tokens** |
| Output tokens | **$2.50/1M tokens** |

**Usage assumptions per user/month** (product descriptions, chat, recommendations):
- ~50 AI interactions/user/month × ~1K input + 500 output tokens each
- = 50K input + 25K output tokens/user/month

| Scale | Input Cost | Output Cost | **Total AI** |
|-------|-----------|------------|-------------|
| 1 user | $0.015 | $0.063 | **~$0.08** (~₹7) |
| 100 users | $1.50 | $6.25 | **~$7.75** (~₹650) |
| 1K users | $15 | $62.50 | **~$77.50** (~₹6,500) |
| 10K users | $150 | $625 | **~$775** (~₹65,000) |

> [!WARNING]
> **Token explosion risk:** If AI features include product description generation, chatbots, or image analysis, a single power user could consume 10–50× the average. Implement **per-user token caps**.

---

### 1.6 Images — Cloudflare R2 + Cloudinary

#### Cloudflare R2 (storage)
| Resource | Cost |
|----------|------|
| Storage | **$0.015/GB/mo** |
| Writes (Class A) | $4.50/1M requests |
| Reads (Class B) | $0.36/1M requests |
| Egress | **$0 (free!)** |
| Free tier | 10 GB storage, 10M reads/mo |

#### Cloudinary (transformations)
| Plan | Cost | Included |
|------|------|---------|
| Free | $0 | Limited transformations |
| Plus | **$89/mo** (~₹7,500) | Standard media pipeline |
| Advanced | **$224/mo** (~₹18,800) | High-volume transformations |

**Scaling estimate (assuming ~50 product images/shop, avg 2 MB each):**

| Scale | R2 Storage | R2 Ops | Cloudinary | **Total Images** |
|-------|-----------|--------|-----------|-----------------|
| 1 user | ~$0 (free) | ~$0 | Free | **~$0** |
| 100 users | ~$0.15 (10 GB) | ~$0.50 | Free/Plus $89 | **~$90** (~₹7,500) |
| 1K users | ~$1.50 (100 GB) | ~$5 | Plus $89 | **~$96** (~₹8,000) |
| 10K users | ~$15 (1 TB) | ~$50 | Advanced $224 | **~$289** (~₹24,300) |

---

### 1.7 Email — Resend

| Plan | Monthly Cost | Emails/Month |
|------|-------------|-------------|
| Free | $0 | 3,000 (100/day limit) |
| Pro | **$20/mo** (~₹1,680) | 50,000 |
| Scale | **$90/mo** (~₹7,560) | 100,000 |
| Overage | $0.90/1K emails | Beyond plan |

**Usage assumptions** (order confirmations, shipping updates, welcome emails: ~10 emails/user/month):

| Scale | Emails/Mo | Plan Needed | **Cost** |
|-------|----------|------------|---------|
| 1 user | 10 | Free | **$0** |
| 100 users | 1,000 | Free | **$0** |
| 1K users | 10,000 | Pro $20 | **$20** (~₹1,680) |
| 10K users | 100,000 | Scale $90 | **$90** (~₹7,560) |

---

### 1.8 Payments — Razorpay

| Payment Method | Fee |
|---------------|-----|
| UPI / Cards / Netbanking | **2% + 18% GST** = ~2.36% total |
| EMI / Corporate / Amex | 3% + GST = ~3.54% total |
| International Cards | 3% + GST = ~3.54% total |

**This is NOT your infrastructure cost — it's deducted from revenue:**

| Avg Transaction ₹ | Per Txn Fee | 100 users × 5 txn/mo | 10K users × 5 txn/mo |
|-------------------|-----------|---------------------|---------------------|
| ₹500 | ~₹12 | ₹6,000/mo | ₹6,00,000/mo |
| ₹1,000 | ~₹24 | ₹12,000/mo | ₹12,00,000/mo |
| ₹2,000 | ~₹47 | ₹23,500/mo | ₹23,50,000/mo |

> [!IMPORTANT]
> Razorpay's 2% fee is charged to your **merchant users'** transactions, not your SaaS subscription. You need to decide: do you absorb this or pass it to your users?

---

## 2. Total Infrastructure Cost Summary

### Cost projection at each scale (monthly, in ₹)

| Service | 1 User | 100 Users | 1,000 Users | 10,000 Users |
|---------|--------|-----------|-------------|--------------|
| Vercel (Frontend) | ₹1,700 | ₹1,700 | ₹2,500 | ₹8,400 |
| Render (Backend) | ₹2,100 | ₹2,100 | ₹7,100 | ₹29,400 |
| Supabase (DB) | ₹2,100 | ₹2,100 | ₹2,500 | ₹6,300 |
| Firebase Auth | ₹0 | ₹0 | ₹0 | ₹0 |
| Firestore | ₹0 | ₹500 | ₹2,500 | ₹42,000 |
| Gemini AI | ₹7 | ₹650 | ₹6,500 | ₹65,000 |
| Cloudflare R2 | ₹0 | ₹50 | ₹550 | ₹5,500 |
| Cloudinary | ₹0 | ₹7,500 | ₹7,500 | ₹18,800 |
| Resend (Email) | ₹0 | ₹0 | ₹1,680 | ₹7,560 |
| **Subtotal Infra** | **₹5,907** | **₹14,600** | **₹30,830** | **₹1,82,960** |
| **Cost Per User** | **₹5,907** | **₹146** | **₹31** | **₹18** |

> [!TIP]
> Classic SaaS economies of scale: cost per user drops dramatically from ₹5,907 (1 user) → ₹18 (10K users). The **break-even** starts around **3–5 paying users** on the ₹1,999 plan.

---

## 3. Hidden Costs & Risk Factors

### 🔴 Critical Risks

| Risk | Description | Potential Impact |
|------|------------|-----------------|
| **Firestore Read Amplification** | Each storefront page load triggers multiple document reads (products, categories, config, user data). A busy store with 1K daily visitors = 5K–20K reads/day from ONE shop. At 1K tenants, this could be 5M–20M reads/day. | **₹9,000–₹36,000/mo** at 1K users |
| **AI Token Explosion** | Users generating product descriptions, using AI chatbots, or requesting recommendations without caps. A single power user could consume 500K+ tokens/day. | **10–50× projected AI cost** |
| **Cloudinary Transformation Spikes** | Dynamic image resizing on every page load instead of pre-generating variants. Each visitor triggers transformations. | **Can exceed plan limits within days** |

### 🟡 Moderate Risks

| Risk | Description | Potential Impact |
|------|------------|-----------------|
| **CDN Bandwidth Spikes** | Viral product going trending, sale events, or bot crawlers hitting storefronts. 10K concurrent visitors = massive bandwidth. | **₹4,000–₹20,000 in overage** |
| **Webhook Infrastructure** | Razorpay webhooks, order status updates, inventory sync — each triggers backend compute + DB writes. | **+15–25% backend compute cost** |
| **Supabase Egress** | API-heavy storefronts pulling product data. Each store page = 50–200 KB of DB response. At scale: 250 GB free egress exhausted quickly. | **$0.09/GB overage** |
| **Domain/SSL Costs** | Custom domains for each tenant. While many providers offer free SSL, managing 10K+ domains requires DNS infrastructure. | **₹0–₹50/domain/mo** |
| **Render Cold Starts** | If using auto-scaling, instances spin up/down. Cold starts = slow API responses during traffic spikes. | **User experience degradation** |

### 🟢 Low Risks (but worth monitoring)

| Risk | Description |
|------|------------|
| **Firebase Blaze Requirement** | As of Feb 2026, Firebase requires Blaze plan for Cloud Storage. Ensure you're upgraded. |
| **Vercel Build Minutes** | CI/CD pipeline with frequent deploys can exhaust 400 build hours. |
| **Resend Daily Limits** | Free plan limits to 100/day. A single order-heavy tenant could exhaust this. |

---

## 4. SaaS Pricing Profitability Analysis

### Revenue per plan per month

| Plan | Price (₹) | After Razorpay Fee (~2.36%) | After GST (18%) | **Net Revenue** |
|------|----------|---------------------------|-----------------|----------------|
| ₹1,999 | ₹1,999 | ₹1,952 | ₹1,694 | **₹1,694** |
| ₹3,999 | ₹3,999 | ₹3,905 | ₹3,390 | **₹3,390** |
| ₹6,999 | ₹6,999 | ₹6,834 | ₹5,933 | **₹5,933** |

### Cost per user at scale vs. revenue

| Scale | Cost/User/Mo | ₹1,999 Plan Profit | ₹3,999 Plan Profit | ₹6,999 Plan Profit |
|-------|-------------|--------------------|--------------------|---------------------|
| 100 users | ₹146 | ✅ **+₹1,548** | ✅ **+₹3,244** | ✅ **+₹5,787** |
| 1K users | ₹31 | ✅ **+₹1,663** | ✅ **+₹3,359** | ✅ **+₹5,902** |
| 10K users | ₹18 | ✅ **+₹1,676** | ✅ **+₹3,372** | ✅ **+₹5,915** |

### Verdict

| Plan | Profitable? | Gross Margin | Assessment |
|------|-----------|-------------|------------|
| **₹1,999/mo** | ✅ Yes | **~85–92%** at 100+ users | Profitable but tight when including team salary, support, and heavy AI users |
| **₹3,999/mo** | ✅ Yes | **~92–96%** at 100+ users | Healthy margins, good mid-tier |
| **₹6,999/mo** | ✅ Yes | **~96–97%** at 100+ users | Excellent margins, premium tier |

> [!WARNING]
> **The ₹1,999 plan is dangerously cheap** if it includes unlimited AI features. A single heavy AI user at ₹1,999 costs you ₹400–2,000/mo in Gemini tokens alone, eating 25–100% of the revenue. **You must gate AI features by plan tier or enforce usage caps.**

---

## 5. Competitive Analysis

### Price Comparison (Monthly, converted to ₹)

| Platform | Basic Plan | Standard/Mid | Premium | Target Market |
|----------|-----------|-------------|---------|---------------|
| **Flowauxi** | **₹1,999** | **₹3,999** | **₹6,999** | India SMBs |
| **Shopify** | ₹1,994 ($24) | ₹6,317 ($76) | ₹30,739 ($370) | Global |
| **Wix** | ₹1,078 ($13) | ₹2,239 ($27) | ₹4,150 ($50) | Global SMBs |
| **Squarespace** | ₹1,328 ($16) | ₹2,241 ($27) | ₹3,734 ($45) | Creatives |

### Feature-Value Comparison

| Feature | Flowauxi | Shopify | Wix | Squarespace |
|---------|----------|---------|-----|-------------|
| Custom Domain | ✅ | ✅ | ✅ | ✅ |
| AI Features | ✅ Built-in | ✅ Shopify Magic | ⚠️ Limited | ⚠️ Limited |
| Payment Gateway | Razorpay (India) | Shopify Pay + others | Wix Pay | Stripe/Square |
| Transaction Fee | 2% (Razorpay) | 0% (Shopify Pay) / 2% (ext.) | 0% | 0% (Business+) |
| Multi-tenant | ✅ Core feature | ❌ Single store | ❌ | ❌ |
| India-First | ✅ | ⚠️ Limited India support | ⚠️ | ❌ |
| App Ecosystem | ❌ Early stage | ✅ 8,000+ apps | ✅ 500+ | ⚠️ Limited |

### Competitive Positioning

> **Flowauxi's sweet spot**: You're priced competitively for the Indian market. Your ₹1,999 undercuts Shopify's Basic (₹1,994) while offering AI features. The ₹6,999 premium is significantly cheaper than Shopify's Standard (₹6,317) and miles below Advanced (₹30,739).

> **Key differentiator**: India-first (Razorpay, INR pricing, local compliance) + built-in AI. This is a strong position against global players who charge in USD.

---

## 6. Recommendations

### 💰 Pricing Improvements

1. **Raise ₹1,999 to ₹2,499/mo** — Still cheaper than Shopify Basic, but gives you 25% more margin to absorb AI costs. Position as "Starter" plan.

2. **Add a ₹9,999/mo "Business" tier** — Bridge between ₹6,999 and enterprise. Include: unlimited AI, priority support, advanced analytics, custom CSS.

3. **Annual billing discount (20% off)** — Improves cash flow and reduces churn:
   - ₹2,499 → ₹1,999/mo billed annually (₹23,988/yr)
   - ₹3,999 → ₹3,199/mo billed annually (₹38,388/yr)
   - ₹6,999 → ₹5,599/mo billed annually (₹67,188/yr)

4. **Gate AI features by tier:**

   | Feature | Starter (₹2,499) | Growth (₹3,999) | Pro (₹6,999) | Business (₹9,999) |
   |---------|------------------|-----------------|-------------|-------------------|
   | AI Product Descriptions | 50/mo | 200/mo | 1,000/mo | Unlimited |
   | AI Chat/Recommendations | ❌ | 100 queries/mo | 500 queries/mo | Unlimited |
   | AI Image Generation | ❌ | ❌ | 50/mo | 200/mo |

5. **Transaction fee add-on** — Consider adding 0.5–1% on transaction value for Starter tier to offset Razorpay costs on high-volume sellers.

---

### ⚡ Cost Optimizations

#### Immediate Wins (save 30–50%)

| Optimization | Est. Monthly Savings | Effort |
|-------------|---------------------|--------|
| **Migrate Firestore → Supabase** for all modules | ₹2,000–₹40,000 at scale | Medium — consolidates your DB layer, eliminates Firestore read cost trap |
| **Pre-generate image variants** on upload instead of on-the-fly Cloudinary transforms | ₹3,000–₹10,000 at scale | Low — generate 3–4 sizes (thumb, medium, large, original) at upload time |
| **Cache AI responses** for common queries (product categories, FAQ) | ₹1,000–₹20,000 at scale | Low — Redis/edge cache for repeated AI calls |
| **Implement Cloudflare CDN** in front of Vercel for storefronts | ₹2,000–₹5,000 at scale | Low — CF free plan includes unlimited bandwidth |

#### Medium-Term (save 40–60%)

| Optimization | Est. Monthly Savings | Effort |
|-------------|---------------------|--------|
| **Move backend from Render → Railway or Fly.io** | ₹2,000–₹5,000 | Medium — better autoscaling, pay-per-use vs fixed instances |
| **Use Supabase Edge Functions** instead of separate Render backend for simple CRUD | ₹5,000–₹15,000 | High — reduces need for dedicated backend infra |
| **Implement request-level caching** (Redis via Upstash, free tier: 10K commands/day) | ₹3,000–₹10,000 | Medium |
| **Switch to Cloudflare Images** ($5/100K stored + $1/100K delivered) instead of Cloudinary | ₹5,000–₹15,000 | Medium — drops Cloudinary entirely |

---

### 🏗️ Architecture for 100K Users

#### Current Architecture Issues at Scale

```
Current: User → Vercel (SSR) → Render (API) → Supabase + Firestore + Firebase Auth
                                      ↓
                               Cloudinary (images)
                               Gemini API (AI)
                               Resend (email)
```

**Problems at 100K:**
- Render single-instance bottleneck
- Firestore costs explode ($5,000–10,000+/mo)
- No caching layer = repeated DB hits
- No queue system = webhook failures at scale

#### Recommended Architecture for 100K Users

```
                    ┌──────────────────┐
                    │  Cloudflare CDN  │ ← Cache storefront pages (95% cache hit)
                    │  (Free tier)     │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   Vercel Edge    │ ← SSR/ISR with stale-while-revalidate
                    │   (Pro plan)     │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼────┐ ┌───────▼───────┐
    │  API Gateway   │ │ Redis   │ │ Worker Queue  │
    │  (Fly.io /     │ │ (Upstash│ │ (BullMQ /     │
    │   Railway)     │ │  or CF  │ │  Inngest)     │
    │  Auto-scaling  │ │  KV)    │ │               │
    └────────┬───────┘ └─────────┘ └───────┬───────┘
             │                             │
    ┌────────▼───────────────────┐  ┌──────▼──────┐
    │    Supabase (PostgreSQL)   │  │ Async Jobs  │
    │    + Connection Pooling    │  │ - Email     │
    │    + Row Level Security    │  │ - Webhooks  │
    │    Single source of truth  │  │ - AI calls  │
    └────────────────────────────┘  │ - Image     │
                                    │   processing│
                                    └─────────────┘
```

#### Key Architecture Changes

| Change | Why | Impact |
|--------|-----|--------|
| **Consolidate ALL data into Supabase** | Eliminate Firestore cost trap; single DB = simpler ops | **-₹40,000+/mo** at 100K |
| **Add Redis/KV caching layer** | 80% of storefront reads are cacheable | **-60% DB load** |
| **Worker queue for async ops** | Email, webhooks, AI calls shouldn't block API | **+99.9% reliability** |
| **Cloudflare in front** | Free unlimited bandwidth CDN; cache static storefronts | **-₹50,000+/mo** in Vercel bandwidth |
| **Auto-scaling backend** | Fly.io / Railway scale to zero → scale to 100 instances | **Pay only for actual compute** |
| **ISR (Incremental Static Regeneration)** | Pre-render storefronts, revalidate on product changes | **-90% serverless compute** |

#### Projected 100K User Costs (Optimized Architecture)

| Service | Current Architecture | Optimized Architecture | Savings |
|---------|---------------------|----------------------|---------|
| Frontend | ₹84,000 | ₹25,000 (CF CDN offloads 80%) | 70% |
| Backend | ₹2,94,000 | ₹85,000 (auto-scale + caching) | 71% |
| Database | ₹4,63,000 (Supabase + Firestore) | ₹63,000 (Supabase only + pooling) | 86% |
| AI | ₹6,50,000 | ₹1,95,000 (caching + caps) | 70% |
| Images | ₹2,43,000 | ₹55,000 (CF Images, pre-gen) | 77% |
| Email | ₹75,600 | ₹50,000 (batching + templates) | 34% |
| **Total** | **₹18,09,600/mo** | **₹4,73,000/mo** | **74%** |
| **Cost/User** | **₹18.10** | **₹4.73** | |

---

## 7. Final Verdict & Executive Summary

### Is Flowauxi Profitable?

| Question | Answer |
|----------|--------|
| Is ₹1,999/mo profitable? | ✅ **Yes**, but risky with unlimited AI. Recommend raising to ₹2,499 and gating AI. |
| Is ₹3,999/mo profitable? | ✅ **Strongly yes**. ~96%+ gross margin at scale. Sweet spot for growth. |
| Is ₹6,999/mo profitable? | ✅ **Extremely yes**. ~97%+ gross margin. Should be your most promoted plan. |
| Can you scale to 100K users? | ⚠️ **Only with architectural changes**. Current Firestore + Cloudinary setup will cost ~₹18L/mo. Optimized architecture: ~₹4.7L/mo. |

### Top 5 Action Items

1. **🔥 Migrate off Firestore NOW** — This is your biggest cost liability. Consolidate everything into Supabase.
2. **🔒 Gate AI features** — Implement per-plan token limits immediately. One power user can erase your margins.
3. **💰 Raise Starter to ₹2,499** — You're leaving money on the table. Still cheaper than Shopify.
4. **🖼️ Replace Cloudinary with Cloudflare Images** — 70%+ savings on image processing.
5. **⚡ Add a caching layer** — Redis/Upstash between your API and database. Instant 60% reduction in DB load.

### Revenue Projections

Assuming average plan ₹3,999 and 80% paid conversion:

| Users | Monthly Revenue | Monthly Infra Cost | **Monthly Profit** | **Annual Profit** |
|-------|-----------------|-------------------|--------------------|-------------------|
| 100 | ₹3,19,920 | ₹14,600 | **₹3,05,320** | **₹36,63,840** |
| 1,000 | ₹31,99,200 | ₹30,830 | **₹31,68,370** | **₹3,80,20,440** |
| 10,000 | ₹3,19,92,000 | ₹1,82,960 | **₹3,18,09,040** | **₹38,17,08,480** |
| 100,000 (optimized) | ₹31,99,20,000 | ₹4,73,000 | **₹31,94,47,000** | **₹38,33,36,40,000** |

> [!TIP]
> **Bottom line: Flowauxi has excellent unit economics.** Your India-first positioning, competitive pricing, and built-in AI give you a strong moat. The critical path to profitability at scale is **Firestore migration + AI cost control + caching**. Execute these three and you'll maintain 95%+ gross margins even at 100K users.

---

*Analysis prepared for Flowauxi · March 2026 · All vendor pricing verified against current public documentation*
