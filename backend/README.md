# WhatsApp Admin Backend

Flask backend API for sending WhatsApp messages via the WhatsApp Cloud API.

## Setup

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure WhatsApp Credentials

Edit the `.env` file and add your WhatsApp Cloud API credentials:

```env
WHATSAPP_PHONE_NUMBER_ID=your_actual_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_actual_business_account_id
WHATSAPP_ACCESS_TOKEN=your_actual_access_token
```

#### How to get WhatsApp Cloud API credentials:

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create or select an app with WhatsApp product
3. Navigate to **WhatsApp > Getting Started**
4. Copy your:
   - **Phone Number ID** (from the "From" section)
   - **Access Token** (temporary, then generate a permanent one)
   - **Business Account ID** (from Settings)

### 3. Run the Backend Server

```bash
python app.py
```

Server will start on `http://localhost:5000`

## API Endpoints

### Health Check

```
GET /api/health
```

Response:

```json
{
  "status": "ok",
  "message": "WhatsApp Admin API is running"
}
```

### Check Status

```
GET /api/whatsapp/status
```

Response:

```json
{
  "configured": true,
  "message": "WhatsApp credentials are configured"
}
```

### Send Message

```
POST /api/whatsapp/send
Content-Type: application/json

{
  "to": "919876543210",
  "message": "Hello from ReviseIt!"
}
```

Response (Success):

```json
{
  "success": true,
  "message_id": "wamid.xxx",
  "data": {...}
}
```

Response (Error):

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Phone Number Format

- Include country code (e.g., 91 for India)
- No + sign, spaces, or dashes
- Example: `919876543210` for +91 98765 43210

## Testing

For testing, you can only send messages to:

- Your own verified WhatsApp number
- Phone numbers added as test numbers in your Meta Business account
- Approved template messages for other numbers

## Troubleshooting

**Error: "Please configure real WhatsApp API credentials"**

- Replace placeholder credentials in `.env` with actual values

**Error: "Recipient phone number not found"**

- Ensure the phone number is verified in your WhatsApp Business account
- Check that the number format is correct (no + sign)

**CORS Errors**

- Check that `FRONTEND_URL` in `.env` matches your frontend URL
- Ensure the frontend is running on the configured port

---

## 🧠 AI Brain Module

The AI Brain provides intelligent, context-aware response generation for WhatsApp business chatbots.

### Setup AI Brain

1. **Install AI dependencies:**

   ```bash
   pip install -r requirements_ai.txt
   ```

2. **Configure OpenAI API key** in `.env`:

   ```env
   OPENAI_API_KEY=your_openai_api_key
   ```

3. **Restart the server.** You should see:
   ```
   🧠 AI Brain: Ready ✅
   ```

### AI Endpoints

#### Check AI Status

```
GET /api/ai/status
```

#### Generate AI Reply

```
POST /api/ai/generate-reply
Content-Type: application/json

{
    "business_data": {
        "business_id": "salon_001",
        "business_name": "Style Studio",
        "industry": "salon",
        "products_services": [{"name": "Haircut", "price": 300}],
        "timings": {"monday": {"open": "10:00", "close": "20:00"}},
        "location": {"address": "123 Main St", "city": "Mumbai"}
    },
    "user_message": "What is the price for haircut?",
    "history": []
}
```

Response:

```json
{
  "success": true,
  "reply": "Haircut at Style Studio costs ₹300. Would you like to book an appointment? 💇",
  "intent": "pricing",
  "confidence": 0.85,
  "needs_human": false,
  "suggested_actions": ["Book now", "View all services", "Our location"]
}
```

#### Detect Intent

```
POST /api/ai/detect-intent
Content-Type: application/json

{
    "message": "What are your timings?",
    "history": []
}
```

### Supported Intents

| Intent      | Example Triggers              |
| ----------- | ----------------------------- |
| `greeting`  | "hi", "hello", "namaste"      |
| `pricing`   | "price", "cost", "kitna"      |
| `booking`   | "book", "appointment", "slot" |
| `hours`     | "timing", "open", "close"     |
| `location`  | "address", "where", "kahan"   |
| `complaint` | "problem", "issue"            |

### Business Data Schema

See `ai_brain/schemas.py` for the complete schema. Key fields:

- `business_name`, `industry`, `description`
- `contact` (phone, email, whatsapp)
- `location` (address, city, google_maps_link)
- `timings` (per-day open/close hours)
- `products_services` (name, price, category)
- `policies` (refund, cancellation)
- `faqs` (question/answer pairs)

### Running Tests

```bash
# Unit tests
python -m pytest tests/test_ai_brain.py -v

# Integration tests
python -m pytest tests/test_api_integration.py -v

# Run example
python example_usage.py
```

### Extending the AI Brain

**Add new intents:**

1. Add to `IntentType` enum in `ai_brain/intents.py`
2. Add keywords to `INTENT_KEYWORDS`
3. Add template in `ai_brain/templates.py`

**Add new industries:**

1. Add template in `INDUSTRY_TEMPLATES` in `ai_brain/templates.py`

**Custom data loaders:**

```python
from ai_brain import AIBrain
from ai_brain.data_loader import MongoDataLoader

loader = MongoDataLoader("mongodb://localhost", "mydb")
brain = AIBrain(data_loader=loader)
```
