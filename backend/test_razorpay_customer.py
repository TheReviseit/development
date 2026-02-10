import os
from dotenv import load_dotenv
import razorpay

load_dotenv()

# Initialize Razorpay client
client = razorpay.Client(auth=(
    os.getenv('RAZORPAY_KEY_ID'),
    os.getenv('RAZORPAY_KEY_SECRET')
))

print("Testing Razorpay Customer Creation...")
print(f"Key ID: {os.getenv('RAZORPAY_KEY_ID')[:15]}...")
print()

# Test 1: Try to create customer
print("Test 1: Creating customer with rajaraman5262@gmail.com...")
try:
    test_customer = client.customer.create(data={
        'name': 'Test User',
        'email': 'rajaraman5262@gmail.com',
        'contact': ''
    })
    print(f"SUCCESS: Created customer {test_customer['id']}")
    print(f"Customer details: {test_customer}")
except razorpay.errors.BadRequestError as e:
    print(f"BadRequest Error: {str(e)}")
    print("This usually means the customer already exists or invalid data")
except razorpay.errors.ServerError as e:
    print(f"ServerError (This is the 503 error): {str(e)}")
    print("This is a Razorpay server issue")
except Exception as e:
    print(f"Unexpected Error ({type(e).__name__}): {str(e)}")

print()
print("Test 2: Listing existing customers...")
try:
    customers = client.customer.all({'count': 10})
    print(f"Total customers found: {len(customers['items'])}")
    for c in customers['items']:
        print(f"  - {c['id']}: {c.get('email', 'No email')}, {c.get('name', 'No name')}")
except Exception as e:
    print(f"Error listing customers: {e}")

print()
print("Test 3: Searching for rajaraman5262@gmail.com...")
try:
    all_customers = client.customer.all({'count': 100})
    found = [c for c in all_customers['items'] if c.get('email') == 'rajaraman5262@gmail.com']
    print(f"Found {len(found)} customers with that email")
    for c in found:
        print(f"  Customer ID: {c['id']}")
        print(f"  Created: {c.get('created_at')}")
        print(f"  Name: {c.get('name')}")
except Exception as e:
    print(f"Error searching: {e}")
