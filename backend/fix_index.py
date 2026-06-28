import os
import psycopg2
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()

db_url = os.environ.get('SUPABASE_DB_URL') or 'postgresql://postgres.npxcyndnklvtyyewjxyy:Gokul223@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'

print(f"Connecting to database...")
conn = psycopg2.connect(db_url)
cur = conn.cursor()

try:
    print("Dropping existing index...")
    cur.execute("DROP INDEX IF EXISTS idx_subscriptions_one_active_per_user_domain;")
    print("Creating new index...")
    cur.execute('''
        CREATE UNIQUE INDEX idx_subscriptions_one_active_per_user_domain 
        ON subscriptions(user_id, product_domain) 
        WHERE status IN ('active', 'past_due', 'trialing');
    ''')
    conn.commit()
    print("Index updated successfully.")
except Exception as e:
    conn.rollback()
    print(f"Error: {e}")
finally:
    cur.close()
    conn.close()
