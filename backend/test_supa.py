from supabase_client import get_supabase_client
import os
from dotenv import load_dotenv

load_dotenv()

supabase = get_supabase_client()

try:
    print("Dropping index via rpc or SQL?")
    # Supabase Data API doesn't allow arbitrary SQL execution by default unless we use a defined RPC.
    # We should just use the actual database connection url directly.
except Exception as e:
    print(e)
