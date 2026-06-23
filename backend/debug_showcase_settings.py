import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from supabase import create_client
c = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
r = c.table('showcase_settings').select('*').limit(20).execute()
if r.data:
    print(f'rows: {len(r.data)}')
    for row in r.data:
        for k,v in row.items():
            if v is not None and str(v).strip():
                s = str(v)
                if any(x in k.lower() for x in ['logo','image','photo','icon','banner','avatar']):
                    print(f'  {k}={s[:120]}')
                elif k in ('id','user_id','business_name','slug'):
                    print(f'  {k}={s[:60]}')
    print('---all keys---')
    print(list(r.data[0].keys()))
else:
    print('no rows')
