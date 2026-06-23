import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from supabase import create_client

c = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

for table in ['showcase_items', 'showcase_settings', 'products']:
    try:
        r = c.table(table).select('*').limit(3).execute()
        if r.data:
            print(f'\n=== {table} ({len(r.data)} rows) ===')
            keys = list(r.data[0].keys())
            img_keys = [k for k in keys if any(x in k.lower() for x in ['img','photo','logo','icon','avatar','pic','url','cdn'])]
            print(f'  image-related columns: {img_keys}')
            for row in r.data:
                for k in img_keys:
                    v = row.get(k)
                    if v:
                        print(f'  {k}={str(v)[:100]}')
                if not any(row.get(k) for k in img_keys):
                    nam = str(row.get(keys[1], '?'))[:30] if len(keys) > 1 else '?'
                    print(f'  row id={str(row.get("id","?"))[:12]} name={nam} — NO image data')
        else:
            print(f'\n=== {table}: 0 rows ===')
    except Exception as e:
        print(f'\n=== {table}: ERROR {e} ===')
