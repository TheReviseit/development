"""
PRODUCT REGISTRY — Backend Single Source of Truth
===================================================
Python mirror of frontend/lib/product/registry.ts

This ensures backend and frontend have same product definitions.
Keep in sync with frontend registry!
"""

import os
from dataclasses import dataclass
from typing import List, Literal, Optional

# =============================================================================
# TYPES
# =============================================================================

ProductDomain = Literal["shop", "dashboard", "marketing", "showcase", "api"]
PlanTier = Literal["starter", "business", "pro"]


@dataclass
class PricingLimits:
    ai_responses: int
    whatsapp_numbers: int
    faqs: Optional[int] = None
    products: Optional[int] = None
    orders: Optional[int] = None
    campaigns: Optional[int] = None
    campaign_recipients: Optional[int] = None
    showcase_items: Optional[int] = None
    api_calls: Optional[int] = None
    api_keys: Optional[int] = None


@dataclass
class PricingTier:
    # Identifiers
    id: PlanTier
    plan_id: str  # Unique: "shop_starter", "dashboard_business", etc.
    razorpay_plan_id_sandbox: str  # From RAZORPAY_PLAN_{DOMAIN}_{TIER} env var
    razorpay_plan_id_production: str  # From RAZORPAY_LIVE_PLAN_{DOMAIN}_{TIER} env var
    
    # Display
    name: str
    price: int  # In paise (₹3,999 = 399900)
    price_display: str
    currency: str
    interval: str
    
    # Marketing
    description: str
    tagline: Optional[str]
    popular: bool
    
    # Features & Limits
    features: List[str]
    limits: PricingLimits
    
    @property
    def razorpay_plan_id(self) -> str:
        """Backward-compat: resolve plan ID for current environment."""
        try:
            from services.environment import get_razorpay_environment
            env = get_razorpay_environment()
        except Exception:
            env = 'sandbox'  # Safe fallback during startup/import
        return getattr(self, f'razorpay_plan_id_{env}')


@dataclass
class ProductConfig:
    id: ProductDomain
    name: str
    domain: str
    description: str
    pricing: List[PricingTier]
    enabled_features: List[str]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def require_env(key: str, product_plan: str) -> str:
    """Get and validate required environment variable."""
    value = os.getenv(key)
    if not value:
        print(f"❌ Missing required env var: {key} for {product_plan}")
        print(f"   Add to .env: {key}=plan_xxxxx")
        return f"MISSING_{key}"
    return value


def optional_env(key: str) -> str:
    """Get optional environment variable (for production plan IDs not yet configured)."""
    return os.getenv(key, '')


# =============================================================================
# PRODUCT REGISTRY
# =============================================================================

PRODUCT_REGISTRY: dict[ProductDomain, ProductConfig] = {
    # =========================================================================
    # SHOP PRODUCT
    # =========================================================================
    "shop": ProductConfig(
        id="shop",
        name="Flowauxi Shop",
        domain="shop.flowauxi.com",
        description="WhatsApp Commerce Platform",
        pricing=[
            # STARTER
            PricingTier(
                id="starter",
                plan_id="shop_starter",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_SHOP_STARTER", "shop/starter"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_SHOP_STARTER"),
                name="Starter",
                price=199900,  # ₹1,999
                price_display="₹1,999",
                currency="INR",
                interval="monthly",
                description="Perfect for getting started with your online store",
                tagline=None,
                popular=False,
                features=[
                    "Domain: Random domain name (e.g. store/abc1234)",
                    "10 products (incl. variants)",
                    "Standard invoice",
                    "10 email invoices",
                    "Email support",
                ],
                limits=PricingLimits(
                    ai_responses=1000,
                    whatsapp_numbers=1,
                    faqs=30,
                    products=10,
                    orders=100,
                ),
            ),
            # BUSINESS
            PricingTier(
                id="business",
                plan_id="shop_business",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_SHOP_BUSINESS", "shop/business"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_SHOP_BUSINESS"),
                name="Business",
                price=399900,  # ₹3,999
                price_display="₹3,999",
                currency="INR",
                interval="monthly",
                description="For growing businesses",
                tagline=None,
                popular=True,
                features=[
                    "Custom domain name",
                    "50 products (incl. variants)",
                    "50 live order updates",
                    "Analytics dashboard",
                    "Priority support",
                ],
                limits=PricingLimits(
                    ai_responses=5000,
                    whatsapp_numbers=1,
                    faqs=100,
                    products=50,
                    orders=500,
                ),
            ),
            # PRO
            PricingTier(
                id="pro",
                plan_id="shop_pro",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_SHOP_PRO", "shop/pro"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_SHOP_PRO"),
                name="Pro",
                price=699900,  # ₹6,999
                price_display="₹6,999",
                currency="INR",
                interval="monthly",
                description="Advanced features + unlimited users",
                tagline=None,
                popular=False,
                features=[
                    "100 products",
                    "Unlimited orders",
                    "No limit message history",
                    "Priority support",
                ],
                limits=PricingLimits(
                    ai_responses=15000,
                    whatsapp_numbers=2,
                    faqs=-1,  # unlimited
                    products=100,
                    orders=-1,  # unlimited
                ),
            ),
        ],
        enabled_features=["orders", "products", "ai", "analytics", "messages"],
    ),
    
    # =========================================================================
    # DASHBOARD PRODUCT
    # =========================================================================
    "dashboard": ProductConfig(
        id="dashboard",
        name="WhatsApp AI Automation",
        domain="flowauxi.com",
        description="Full-featured WhatsApp automation platform",
        pricing=[
            # STARTER
            PricingTier(
                id="starter",
                plan_id="dashboard_starter",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_DASHBOARD_STARTER", "dashboard/starter"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_DASHBOARD_STARTER"),
                name="Starter",
                price=149900,  # ₹1,499
                price_display="₹1,499",
                currency="INR",
                interval="monthly",
                description="Perfect for solo entrepreneurs",
                tagline="Best for 80-100 queries/day",
                popular=False,
                features=[
                    "2,500 AI Responses / month",
                    "1 WhatsApp Number",
                    "Up to 50 FAQs Training",
                    "Basic Auto-Replies",
                    "Email Support",
                ],
                limits=PricingLimits(
                    ai_responses=2500,
                    whatsapp_numbers=1,
                    faqs=50,
                ),
            ),
            # BUSINESS
            PricingTier(
                id="business",
                plan_id="dashboard_business",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_DASHBOARD_BUSINESS", "dashboard/business"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_DASHBOARD_BUSINESS"),
                name="Business",
                price=399900,  # ₹3,999
                price_display="₹3,999",
                currency="INR",
                interval="monthly",
                description="For growing businesses",
                tagline="Best for 250-300 queries/day",
                popular=True,
                features=[
                    "8,000 AI Responses / month",
                    "Up to 2 WhatsApp Numbers",
                    "Broadcast Campaigns",
                    "Chat Support",
                ],
                limits=PricingLimits(
                    ai_responses=8000,
                    whatsapp_numbers=2,
                    faqs=200,
                ),
            ),
            # PRO
            PricingTier(
                id="pro",
                plan_id="dashboard_pro",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_DASHBOARD_PRO", "dashboard/pro"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_DASHBOARD_PRO"),
                name="Pro",
                price=899900,  # ₹8,999
                price_display="₹8,999",
                currency="INR",
                interval="monthly",
                description="Full automation power",
                tagline="Best for 650+ queries/day",
                popular=False,
                features=[
                    "25,000 AI Responses / month",
                    "Unlimited WhatsApp Numbers",
                    "API Access & Webhooks",
                    "Priority Support",
                ],
                limits=PricingLimits(
                    ai_responses=25000,
                    whatsapp_numbers=-1,  # unlimited
                    faqs=-1,  # unlimited
                ),
            ),
        ],
        enabled_features=[
            "ai",
            "analytics",
            "messages",
            "aiSettings",
            "orders",
            "products",
            "appointments",
            "services",
            "showcase",
        ],
    ),
    
    # =========================================================================
    # MARKETING PRODUCT (simplified)
    # =========================================================================
    "marketing": ProductConfig(
        id="marketing",
        name="WhatsApp Marketing Automation",
        domain="marketing.flowauxi.com",
        description="Campaign management and bulk messaging",
        pricing=[
            PricingTier(
                id="starter",
                plan_id="marketing_starter",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_MARKETING_STARTER", "marketing/starter"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_MARKETING_STARTER"),
                name="Starter",
                price=199900,
                price_display="₹1,999",
                currency="INR",
                interval="monthly",
                description="For small marketing campaigns",
                tagline=None,
                popular=False,
                features=["3,000 AI Responses", "5 Campaigns", "500 Recipients/Campaign"],
                limits=PricingLimits(ai_responses=3000, whatsapp_numbers=1, faqs=50, campaigns=5, campaign_recipients=500),
            ),
            PricingTier(
                id="business",
                plan_id="marketing_business",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_MARKETING_BUSINESS", "marketing/business"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_MARKETING_BUSINESS"),
                name="Business",
                price=499900,
                price_display="₹4,999",
                currency="INR",
                interval="monthly",
                description="For professional marketers",
                tagline=None,
                popular=True,
                features=["10,000 AI Responses", "Unlimited Campaigns", "5,000 Recipients/Campaign"],
                limits=PricingLimits(ai_responses=10000, whatsapp_numbers=2, faqs=150, campaigns=-1, campaign_recipients=5000),
            ),
            PricingTier(
                id="pro",
                plan_id="marketing_pro",
                razorpay_plan_id_sandbox=require_env("RAZORPAY_PLAN_MARKETING_PRO", "marketing/pro"),
                razorpay_plan_id_production=optional_env("RAZORPAY_LIVE_PLAN_MARKETING_PRO"),
                name="Pro",
                price=999900,
                price_display="₹9,999",
                currency="INR",
                interval="monthly",
                description="Enterprise marketing power",
                tagline=None,
                popular=False,
                features=["30,000 AI Responses", "Unlimited Everything"],
                limits=PricingLimits(ai_responses=30000, whatsapp_numbers=-1, faqs=-1, campaigns=-1, campaign_recipients=-1),
            ),
        ],
        enabled_features=["ai", "messages", "campaigns", "bulkMessages", "templates", "analytics"],
    ),
    
    # Additional products (showcase, api) can be added following the same pattern
    # For brevity, only showing main ones
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_plan_config(plan_id: str) -> tuple[ProductConfig, PricingTier] | None:
    """Get product and plan by unique plan ID (e.g., "shop_starter")."""
    for product in PRODUCT_REGISTRY.values():
        for plan in product.pricing:
            if plan.plan_id == plan_id:
                return (product, plan)
    return None


def validate_product_plan(product_id: ProductDomain, plan_id: str) -> bool:
    """Validate that plan belongs to product."""
    product = PRODUCT_REGISTRY.get(product_id)
    if not product:
        return False
    return any(p.plan_id == plan_id for p in product.pricing)


def get_product_by_id(product_id: ProductDomain) -> Optional[ProductConfig]:
    """Get product config by ID."""
    return PRODUCT_REGISTRY.get(product_id)


def get_all_product_ids() -> list[ProductDomain]:
    """Get list of all product IDs."""
    return list(PRODUCT_REGISTRY.keys())
