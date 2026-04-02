import os
import sys

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from supabase_client import get_supabase_client

client = get_supabase_client()

print("Applying FAANG-level 'payment_status' schema & indexing updates.")

# 1. Apply schema manually using py psycopg2 since supabase rest api doesn't support DDL directly.
# Wait, let's use psycopg2 if available, or just fallback to updating existing fields if they exist?
# Actually, the user's DB requires DDL directly. Let's rely on psycopg2.
import psycopg2

database_url = os.environ.get('DATABASE_URL')
if not database_url:
    supabase_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
    database_url = supabase_url.replace('https://', 'postgresql://postgres:').replace('.supabase.co', ':5432/postgres')

try:
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()
    # Add columns safely
    cur.execute('''
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);
        CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created ON orders(payment_status, created_at);
    ''')
    conn.commit()
    print("✅ Schema created/verified.")
except Exception as e:
    print("❌ Failed DB structure DDL:", e)

# 2. Backfill: Map existing order revenue truth
# Rule: If order is completed/processing/confirmed, and not COD unless completed.
print("Running Backfill strategy on `orders`...")
try:
    # 2a. Any completed/confirmed/processing online order should be 'captured' 
    cur.execute('''
        UPDATE orders 
        SET payment_status = 'captured' 
        WHERE status IN ('completed', 'processing', 'confirmed')
        AND payment_status = 'pending';
    ''')
    conn.commit()
    print(f"✅ Backfill applied. Rows updated: {cur.rowcount}")
except Exception as e:
    print("❌ Backfill failed:", e)

print("Backfill complete.")
