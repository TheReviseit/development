# Frontend Environment Variables Setup

## Required Environment Variables for FCM Push Notifications

Add this variable to your `frontend/.env.local` file:

```bash
# ============================================
# Firebase Cloud Messaging (FCM) Configuration
# ============================================

# VAPID Key for Web Push Notifications
# This is required for the frontend to get FCM tokens
NEXT_PUBLIC_FIREBASE_VAPID_KEY=your-vapid-key-here
```

## How to Get VAPID Key

1. **Go to Firebase Console**: https://console.firebase.google.com
2. Select your project
3. Click the gear icon ⚙️ → Project Settings
4. Navigate to **Cloud Messaging** tab
5. Scroll down to **Web Push certificates** section
6. Click **Generate key pair** (if you don't have one yet)
7. Copy the **Key pair** value
8. Paste it as the value for `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

## Example

```bash
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNxK7z8...long-key-value...xyz123
```

## Verification

After adding the environment variable:

1. Restart your Next.js dev server: `npm run dev`
2. Open browser console
3. Go to dashboard and click "Enable notifications"
4. Check console for FCM token message

✅ Should see: `FCM Token obtained: [token]...`
❌ If you see: `VAPID key not configured`

Then the environment variable is not set correctly.

## Complete Frontend .env.local Template

```bash
# ============================================
# Firebase Configuration (existing)
# ============================================
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# ============================================
# Firebase Cloud Messaging (NEW - Required for Push Notifications)
# ============================================
NEXT_PUBLIC_FIREBASE_VAPID_KEY=your-vapid-key-from-console

# ============================================
# Supabase Configuration (existing)
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Security Notes

- The `NEXT_PUBLIC_` prefix makes this variable available in the browser
- This is safe because VAPID keys are meant to be public
- Never share your Firebase API key or Supabase keys publicly
