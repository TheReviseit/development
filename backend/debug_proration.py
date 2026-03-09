# Debug script - no external deps
import os, sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Manually load .env
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', '.env')
with open(env_path, encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

from supabase import create_client
url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
print(f"URL: {url}")

sb = create_client(url, key)

print("\n=== SUBSCRIPTIONS ===")
result = sb.table('subscriptions').select(
    'id, user_id, status, plan_name, current_period_start, current_period_end, product_domain, amount_paise'
).order('created_at', desc=True).limit(5).execute()

for s in result.data:
    print(f"\n  id: {s['id']}")
    print(f"  status: {s['status']}")
    print(f"  plan: {s['plan_name']}")
    print(f"  domain: {s['product_domain']}")
    print(f"  period_start: {s['current_period_start']}")
    print(f"  period_end: {s['current_period_end']}")
    print(f"  amount_paise: {s['amount_paise']}")

active = [s for s in result.data if s.get('status') == 'active']
print(f"\n=== Active count: {len(active)} ===")

if not active:
    print("NO ACTIVE SUBS - proration code won't execute!")
    print("Statuses found:", [s['status'] for s in result.data])
else:
    sub = active[0]
    from services.proration_calculator import ProrationCalculator
    calc = ProrationCalculator()
    try:
        r = calc.calculate_proration(
            old_amount_paise=sub['amount_paise'] or 199900,
            new_amount_paise=399900,
            period_start=sub['current_period_start'],
            period_end=sub['current_period_end'],
        )
        print(f"\nProration: Rs {r.proration_charge_paise/100:.0f}")
        print(f"Remaining: {r.remaining_seconds // 86400} days")
        print(f"Percentage: {r.proration_percentage}%")
    except Exception as e:
        print(f"ERROR: {e}")
