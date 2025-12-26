# Backend Environment Variables Setup

## Required Environment Variables for FCM Push Notifications

Add these variables to your `backend/.env` file:

```bash
# ============================================
# Firebase Cloud Messaging (FCM) Configuration
# ============================================

# Path to Firebase service account key JSON file
# Download from: Firebase Console → Project Settings → Service accounts → Generate new private key
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=/absolute/path/to/your/serviceAccountKey.json

# Example for local development:
# FIREBASE_SERVICE_ACCOUNT_KEY_PATH=C:\Users\Sugan001\Desktop\reviseit\backend\credentials\serviceAccountKey.json
```

## How to Get Firebase Service Account Key

1. **Go to Firebase Console**: https://console.firebase.google.com
2. Select your project
3. Click the gear icon ⚙️ → Project Settings
4. Navigate to **Service accounts** tab
5. Click **Generate new private key**
6. Save the downloaded JSON file to `backend/credentials/serviceAccountKey.json`
7. Update the `.env` file with the absolute path to this file

## Directory Structure

```
backend/
├── credentials/              # Create this directory
│   └── serviceAccountKey.json  # Place your Firebase key here
├── .env                     # Add FIREBASE_SERVICE_ACCOUNT_KEY_PATH here
└── push_notification.py     # ✅ Already uses this env var
```

## Verification

After adding the environment variable, restart your backend server and check the logs:

✅ Should see: `✅ Firebase Admin SDK initialized for FCM`
❌ If you see: `⚠️ FIREBASE_SERVICE_ACCOUNT_KEY_PATH not set or file missing`

Then the path is incorrect or the file doesn't exist.

## Security Notes

⚠️ **NEVER commit the service account key to version control!**

Add to `.gitignore`:

```
credentials/
*.json
serviceAccountKey.json
```
