import requests

try:
    res = requests.get('http://localhost:3001/store', allow_redirects=False)
    print(f"Status: {res.status_code}")
    print("Headers:", res.headers)
    if 'Location' in res.headers:
        print("Redirect Location:", res.headers['Location'])
except Exception as e:
    print("Error:", e)
