# 🚀 Quick Start: Fix the 500 Error

## The Problem
Your signup is failing with a **500 Internal Server Error** because of missing Supabase environment variables.

## The Solution (3 Steps)

### Step 1: Create `.env.local` file

In the **root directory** of your project (where `package.json` is), create a file called `.env.local`:

```env
# Supabase Configuration (REQUIRED!)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Firebase Configuration (if you have it)
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Step 2: Get Your Supabase Credentials

1. Go to https://app.supabase.com/
2. Open your project
3. Click **Settings** (gear icon) → **API**
4. Copy these values:
   - **Project URL** → paste as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → paste as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → paste as `SUPABASE_SERVICE_ROLE_KEY`

### Step 3: Restart Your Server

```bash
# Stop your dev server (Ctrl+C or Cmd+C)
npm run dev
```

## ✅ Verify It Works

1. **Check environment variables**: Visit http://localhost:3000/api/test-env
   - Should show: "✅ All environment variables are set"

2. **Test signup**: Go to `/signup` and create an account
   - Should work without errors!

## What Changed?

I fixed the code to properly use the Supabase admin client (which has the right permissions) instead of the regular client. But you still need to add your environment variables!

**Files Modified:**
- ✅ `lib/supabase/queries.ts` - Now uses admin client for user creation
- ✅ `lib/supabase/server.ts` - Better error messages
- ✅ `app/api/auth/create-user/route.ts` - More detailed logging
- ✅ `app/api/test-env/route.ts` - New endpoint to check env vars

## Need Help?

- **Detailed guide**: See `docs/FIX_SUMMARY.md`
- **Environment setup**: See `docs/ENV_SETUP_QUICK_GUIDE.md`
- **Still stuck?**: Check the server console for error messages

---

**⚠️ Security Note**: Never commit the `.env.local` file to Git! It contains secrets.

