import os
import sys
import psycopg2

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv()

database_url = os.environ.get('DATABASE_URL')
if not database_url:
    supabase_url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
    database_url = supabase_url.replace('https://', 'postgresql://postgres:').replace('.supabase.co', ':5432/postgres')

migration_file = os.path.join(os.path.dirname(__file__), '../../supabase/migrations/20260418000001_atomic_outbox_rpc_v2.sql')

try:
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql = f.read()
except Exception as e:
    print(f"Failed to read migration file: {e}")
    sys.exit(1)

try:
    print(f"Connecting to database using URL derived from .env...")
    conn = psycopg2.connect(database_url)
    cur = conn.cursor()
    
    print("Applying migration 20260418000001_atomic_outbox_rpc_v2.sql...")
    cur.execute(sql)
    conn.commit()
    print("Migration applied successfully.")
    
except Exception as e:
    print(f"Migration failed: {e}")
    sys.exit(1)
