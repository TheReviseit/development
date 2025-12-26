# FCM "Failed to fetch" Error - Troubleshooting Guide

## 🔍 Error Analysis

**Error**: `Messaging: A problem occurred while subscribing the user to FCM: TypeError: Failed to fetch`

**Cause**: Firebase can't connect to Firebase Cloud Messaging servers.

---

## ✅ Step-by-Step Checks

### 1. Verify Firebase Cloud Messaging is Enabled

Go to [Firebase Console](https://console.firebase.google.com):

1. Select your project: **reviseit-def4c**
2. Click **Build** → **Cloud Messaging**
3. Check if it says "Cloud Messaging API (Legacy)" is enabled
4. **CRITICAL**: You need to enable **Cloud Messaging API (V1)** in Google Cloud Console

**How to enable:**

- Open Google Cloud Console: https://console.cloud.google.com
- Select project: **reviseit-def4c**
- Go to **APIs & Services** → **Library**
- Search for: **Firebase Cloud Messaging API**
- Click **Enable**

---

### 2. Check Browser Network Connectivity

Open browser DevTools → Network tab:

1. Filter by "firebase" or "fcm"
2. Try enabling notifications again
3. Look for failed requests (red)
4. Check the error details

---

### 3. Verify Service Worker

Open DevTools → Application → Service Workers:

- Check if `/sw.js` is **activated**
- If it shows error, click **Unregister**
- Refresh page
- Try again

---

### 4. Check Firebase Configuration

Verify all Firebase env vars are correct:

**In frontend/.env:**

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=reviseit-def4c.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=reviseit-def4c
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=reviseit-def4c.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BDAk1lL78LO99BKPTSz833hKtYoxkql8p2SGEx6mUJKI6O0x-kIZ-hERcvqfl6d5bkVQlGMCFeTCFFDneWC_GHI
```

---

### 5. Test Internet Connection to Firebase

Open browser console and run:

```javascript
fetch(
  "https://fcmregistrations.googleapis.com/v1/projects/reviseit-def4c/registrations"
)
  .then((r) => console.log("✅ Can reach FCM:", r.status))
  .catch((e) => console.error("❌ Cannot reach FCM:", e));
```

---

## 🎯 Most Likely Issue

**Cloud Messaging API not enabled** in Google Cloud Console.

### Quick Fix:

1. Go to: https://console.cloud.google.com/apis/library/fcm.googleapis.com
2. Select project: **reviseit-def4c**
3. Click **Enable**
4. Wait 1-2 minutes for propagation
5. Try getting FCM token again

---

## 🔄 Alternative: Use Legacy FCM (Temporary)

If the issue persists, we can temporarily use the legacy FCM endpoint while debugging.

Let me know if you want to try that approach!
