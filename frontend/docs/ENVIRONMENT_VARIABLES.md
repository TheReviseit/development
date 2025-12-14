# Environment Variables Setup for Facebook + WhatsApp Integration

## 📋 Required Environment Variables

### Meta (Facebook) Configuration

```bash
# Facebook App ID (Public - safe to expose)
NEXT_PUBLIC_FACEBOOK_APP_ID=your_app_id_here

# Facebook App Secret (Secret - keep private!)
FACEBOOK_APP_SECRET=your_app_secret_here

# Facebook API Version
NEXT_PUBLIC_FACEBOOK_API_VERSION=v21.0
```

### WhatsApp Webhook Configuration

```bash
# Webhook Verify Token (Secret - generate random)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_random_token_here

# Your Site URL
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in
```

### Encryption

```bash
# Encryption Key (Secret - 64 hex characters)
ENCRYPTION_KEY=your_64_char_hex_key_here
```

### Supabase

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 🔧 How to Generate Required Values

### 1. Facebook App Credentials

Get from: https://developers.facebook.com/apps

1. Go to your app → Settings → Basic
2. Copy **App ID**
3. Click "Show" for **App Secret**

### 2. Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Output will be 64 hex characters like:
```
a3f5b9c2e8d4f1a6b7c3e9d5f2a8b4c6e1d7f3a9b5c2e8d4f1a6b7c3e9d5f2a8
```

### 3. Webhook Verify Token

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📝 Example .env.local File

Create `frontend/.env.local`:

```bash
# Meta Configuration
NEXT_PUBLIC_FACEBOOK_APP_ID=123456789012345
FACEBOOK_APP_SECRET=abc123def456ghi789jkl012mno345pqr
NEXT_PUBLIC_FACEBOOK_API_VERSION=v21.0

# WhatsApp
WHATSAPP_WEBHOOK_VERIFY_TOKEN=a3f5b9c2e8d4f1a6b7c3e9d5f2a8b4c6
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in

# Encryption
ENCRYPTION_KEY=a3f5b9c2e8d4f1a6b7c3e9d5f2a8b4c6e1d7f3a9b5c2e8d4f1a6b7c3e9d5f2a8

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Firebase (Existing)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=yourapp.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=yourapp-12345
# ... (other Firebase variables)
```

---

## 🚀 Deployment to Vercel

### Add Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add each variable:
   - **Name**: `NEXT_PUBLIC_FACEBOOK_APP_ID`
   - **Value**: (your app ID)
   - **Environment**: Production, Preview, Development
3. Click "Save"

### Important Notes

- Variables starting with `NEXT_PUBLIC_` are exposed to browser
- Other variables are server-side only
- Never commit `.env.local` to git
- Redeploy after adding new variables

---

## 🔐 Security Best Practices

### ✅ DO:
- Use different keys for dev/staging/production
- Rotate encryption keys periodically
- Store secrets in secure password manager
- Use environment variables on hosting platform
- Never log secret values

### ❌ DON'T:
- Commit `.env.local` to git
- Share secrets in chat/email
- Use same keys across environments
- Hardcode secrets in code
- Expose server-side variables to frontend

---

## ✅ Verification Checklist

After setting up, verify:

- [ ] `.env.local` exists in `frontend/` directory
- [ ] All required variables are set
- [ ] Encryption key is 64 hex characters
- [ ] Firebase variables (existing) are present
- [ ] Supabase variables are correct
- [ ] `.env.local` is in `.gitignore`
- [ ] Production variables set on hosting platform
- [ ] App can connect to Facebook (test login)
- [ ] Webhook verification works

---

## 🧪 Testing Configuration

```bash
# In your frontend directory
cd frontend

# Start dev server
npm run dev

# Test Facebook SDK loads
# Open browser console, should see no errors

# Test API connection
curl http://localhost:3000/api/facebook/login
# Should return: {"connected":false,...}
```

---

## 🐛 Troubleshooting

### Issue: "Facebook SDK not loaded"

**Check:**
- `NEXT_PUBLIC_FACEBOOK_APP_ID` is set
- Value doesn't have extra spaces
- Server was restarted after adding variable

**Fix:**
```bash
# Stop server (Ctrl+C)
# Restart
npm run dev
```

### Issue: "Encryption error"

**Check:**
- `ENCRYPTION_KEY` is exactly 64 hex characters
- No spaces or newlines
- Uses only 0-9, a-f characters

**Fix:**
```bash
# Generate new key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Issue: Variables not loading

**Check:**
- File is named `.env.local` (not `.env`)
- File is in `frontend/` directory
- Server was restarted

---

*Last Updated: December 2024*

