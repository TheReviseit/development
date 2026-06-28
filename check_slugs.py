import sys, os
from dotenv import load_dotenv
load_dotenv('C:\\Users\\Sugan001\\Desktop\\Flowauxi\\backend\\.env')

url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

import requests
headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}"
}
res = requests.get(f"{url}/rest/v1/businesses?select=url_slug,user_id&limit=50", headers=headers)
import json
with open('C:\\Users\\Sugan001\\Desktop\\Flowauxi\\check_slugs.json', 'w') as f:
    json.dump(res.json(), f, indent=2)
