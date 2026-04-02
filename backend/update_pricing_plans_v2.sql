-- ALIGNED PRICING PLANS MIGRATION (V2)
-- =====================================
-- Syncs database pricing_plans table with the high-quality frontend/backend config.
-- Run this in Supabase SQL Editor.

-- 1. Ensure BOOKING plans exist and are updated
INSERT INTO public.pricing_plans (
    plan_slug, 
    display_name, 
    description, 
    amount_paise, 
    currency, 
    interval, 
    product_domain,
    razorpay_plan_id_sandbox,
    features,
    limits
) VALUES 
(
    'booking_starter', 
    'Starter', 
    'For individuals ready to automate and grow consistently.', 
    150000, 
    'INR', 
    'monthly', 
    'booking',
    'plan_SX6OUEn5dDc6nR',
    '["20 Bookings per month", "20 Automated Reminders (Email + WhatsApp)", "20 Feedback Forms", "Google & Apple Calendar Sync", "Basic Analytics Dashboard", "Custom Booking Link"]',
    '{"ai_responses": 1000, "whatsapp_numbers": 1, "faqs": 50, "services": 50, "appointments": 20}'
),
(
    'booking_pro', 
    'Professional', 
    'Built for serious businesses that want to scale revenue.', 
    320000, 
    'INR', 
    'monthly', 
    'booking',
    'plan_SX6RTanWZWxx7y',
    '["Unlimited Bookings", "Unlimited Reminders (Email + WhatsApp)", "Unlimited Feedback Forms", "Stripe Payment Integration", "Advanced Revenue Analytics", "Automated Feedback Collection", "Remove Flowauxi Branding", "Priority Support", "Everything in Starter"]',
    '{"ai_responses": 10000, "whatsapp_numbers": 3, "faqs": -1, "services": -1, "appointments": -1}'
)
ON CONFLICT (plan_slug) DO UPDATE SET 
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    amount_paise = EXCLUDED.amount_paise,
    features = EXCLUDED.features,
    limits = EXCLUDED.limits,
    razorpay_plan_id_sandbox = EXCLUDED.razorpay_plan_id_sandbox;

-- 2. Standardize SHOP plan labels
UPDATE public.pricing_plans SET display_name = 'Starter' WHERE plan_slug = 'shop_starter';
UPDATE public.pricing_plans SET display_name = 'Business' WHERE plan_slug = 'shop_business';
UPDATE public.pricing_plans SET display_name = 'Pro' WHERE plan_slug = 'shop_pro';

-- 3. Standardize DASHBOARD plan labels (for consistency)
UPDATE public.pricing_plans SET display_name = 'Starter' WHERE plan_slug = 'dashboard_starter';
UPDATE public.pricing_plans SET display_name = 'Business' WHERE plan_slug = 'dashboard_business';
UPDATE public.pricing_plans SET display_name = 'Pro' WHERE plan_slug = 'dashboard_pro';

-- VERIFICATION
SELECT plan_slug, display_name, amount_paise, product_domain FROM public.pricing_plans 
WHERE product_domain IN ('booking', 'shop', 'dashboard')
ORDER BY product_domain, amount_paise;
