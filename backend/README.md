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
