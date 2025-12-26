# FCM Push Notifications - Complete Setup Guide

## 🎯 Overview

This guide will walk you through setting up Firebase Cloud Messaging (FCM) push notifications for the ReviseIt platform.

**Estimated Time**: 20-30 minutes

---

## ✅ Prerequisites

- Firebase project created
- Access to Firebase Console
- Access to Supabase dashboard
- Backend and frontend running locally

---

## 📋 Step-by-Step Setup

### Step 1: Database Setup (5 minutes)

1. **Open Supabase Dashboard**

   - Go to your project: https://app.supabase.com
   - Navigate to SQL Editor

2. **Run Migration**

   - Open the file: `backend/migrations/create_push_subscriptions.sql`
   - Copy all contents
   - Paste into Supabase SQL Editor
   - Click **Run**

3. **Verify Table Created**
   ```sql
   SELECT * FROM push_subscriptions LIMIT 1;
   ```
   Should return empty result (no error).

---

### Step 2: Firebase Backend Setup (10 minutes)

1. **Download Service Account Key**

   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Click ⚙️ → **Project Settings**
   - Go to **Service accounts** tab
   - Click **Generate new private key**
   - Save as `serviceAccountKey.json`

2. **Create Credentials Directory**

   ```bash
   cd backend
   mkdir credentials
   ```

3. **Move Service Account Key**

   ```bash
   # Windows
   move C:\Users\YourName\Downloads\serviceAccountKey.json credentials\

   # Mac/Linux
   mv ~/Downloads/serviceAccountKey.json credentials/
   ```

4. **Update Backend .env**
   Add to `backend/.env`:

   ```bash
   FIREBASE_SERVICE_ACCOUNT_KEY_PATH=C:\Users\Sugan001\Desktop\reviseit\backend\credentials\serviceAccountKey.json
   ```

   ⚠️ Use absolute path!

5. **Verify Backend Setup**
   - Restart your backend server
   - Check logs for: `✅ Firebase Admin SDK initialized for FCM`

---

### Step 3: Firebase Frontend Setup (5 minutes)

1. **Get VAPID Key**

   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Click ⚙️ → **Project Settings**
   - Go to **Cloud Messaging** tab
   - Scroll to **Web Push certificates**
   - Click **Generate key pair** (if needed)
   - Copy the key

2. **Update Frontend .env.local**
   Add to `frontend/.env.local`:

   ```bash
   NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNxK7z8...your-key-here...xyz123
   ```

3. **Verify Frontend Setup**
   - Restart: `npm run dev`
   - Open browser console
   - Should see: `✅ Service Worker registered`

---

### Step 4: End-to-End Testing (10 minutes)

1. **Test Permission Request**

   - Open dashboard: http://localhost:3000/dashboard
   - Look for notification banner or bell icon
   - Click "Enable notifications"
   - Grant permission when browser prompts

2. **Verify Token Saved**

   - Open DevTools → Application → Local Storage
   - Should see `fcm_token` with long string value
   - Open DevTools → Network → Filter by "subscribe"
   - Should see successful POST to `/api/notifications/subscribe`

3. **Check Database**

   ```sql
   SELECT * FROM push_subscriptions;
   ```

   Should show your user_id and fcm_token.

4. **Test Push Notification**
   - Send a WhatsApp message to your connected number
   - Backend logs should show: `📬 Push notification triggered for conversation: [uuid]`
   - Browser notification should appear (if tab is not focused)
   - Click notification → Should open correct conversation

---

## 🔍 Troubleshooting

### Issue: "VAPID key not configured"

- Check `.env.local` has `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- Restart Next.js dev server
- Hard refresh browser (Ctrl+Shift+R)

### Issue: "Firebase Admin SDK failed to initialize"

- Check `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` is absolute path
- Verify `serviceAccountKey.json` exists at that path
- Check file permissions (should be readable)

### Issue: "Service Worker not registered"

- Check browser supports service workers (not IE)
- Open DevTools → Application → Service Workers
- Click "Unregister" and refresh page
- Check for errors in console

### Issue: "Permission denied"

- User may have previously blocked notifications
- Clear site data: DevTools → Application → Clear storage
- Or manually enable in browser settings

### Issue: "Notification doesn't appear"

- Check browser notification settings (not blocked)
- Ensure tab is NOT focused (notifications only show when backgrounded)
- Check FCM delivery in Firebase Console → Cloud Messaging → Reports

### Issue: "Notification click doesn't open conversation"

- Check backend logs for conversation ID in push data
- Should be UUID, not phone number
- Verify `get_or_create_conversation` is working

---

## 📊 Monitoring

After setup, monitor these:

1. **Supabase**

   ```sql
   -- Check subscriptions
   SELECT COUNT(*) FROM push_subscriptions;

   -- Check recent subscriptions
   SELECT * FROM push_subscriptions
   ORDER BY created_at DESC LIMIT 10;
   ```

2. **Firebase Console**

   - Go to Cloud Messaging → Reports
   - Check delivery success rate
   - Monitor errors

3. **Backend Logs**
   - Watch for: `🔔 Sending push to X tokens`
   - Watch for errors: `❌ Failed to send`

---

## 🎉 Success Checklist

- [ ] Database table `push_subscriptions` created
- [ ] Backend shows "Firebase Admin SDK initialized"
- [ ] Frontend shows "Service Worker registered"
- [ ] Can click "Enable notifications" and grant permission
- [ ] FCM token appears in localStorage
- [ ] Token saved to database
- [ ] Test message triggers push notification
- [ ] Notification appears in browser
- [ ] Clicking notification opens correct conversation

---

## 📚 Additional Resources

- [FCM Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Protocol](https://developers.google.com/web/fundamentals/push-notifications)
- [Service Workers Guide](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

---

## 🔐 Security Checklist

- [ ] `serviceAccountKey.json` in `.gitignore`
- [ ] `credentials/` directory in `.gitignore`
- [ ] Service account key has minimal required permissions
- [ ] Only FCM messaging scope enabled
- [ ] Regular key rotation schedule planned

---

**Setup Complete!** 🎊

Your FCM push notifications should now be working. Users will receive real-time notifications for new WhatsApp messages.
