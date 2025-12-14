# 🔐 Environment Variables for SEO - Setup Instructions

## Overview

Your site is configured to use environment variables for SEO verification codes. This file explains how to set them up.

---

## 📋 Required Environment Variables

Add these to your `.env.local` file (create it if it doesn't exist):

```bash
# ========================================
# SEO & Analytics Configuration
# ========================================

# Google Search Console Verification
# Where to get: https://search.google.com/search-console
# After adding your property, choose "HTML tag" method
# Copy only the content value (not the full meta tag)
NEXT_PUBLIC_GOOGLE_VERIFICATION=

# Example:
# NEXT_PUBLIC_GOOGLE_VERIFICATION=abc123xyz456

# Bing Webmaster Tools Verification
# Where to get: https://www.bing.com/webmasters
NEXT_PUBLIC_BING_VERIFICATION=

# Yandex Webmaster (only if targeting Russia)
# Where to get: https://webmaster.yandex.com
NEXT_PUBLIC_YANDEX_VERIFICATION=

# Google Analytics 4 Measurement ID
# Where to get: https://analytics.google.com
# Format: G-XXXXXXXXXX
NEXT_PUBLIC_GA_MEASUREMENT_ID=

# Google Tag Manager (optional)
# Format: GTM-XXXXXXX
NEXT_PUBLIC_GTM_ID=

# Your production site URL
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in
```

---

## 🚀 Step-by-Step Setup

### Step 1: Create .env.local File

```bash
# In your frontend directory
cd frontend
touch .env.local
```

### Step 2: Add Base Configuration

Copy this into your `.env.local`:

```bash
# Site Configuration
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in

# Will add verification codes after setup
NEXT_PUBLIC_GOOGLE_VERIFICATION=
NEXT_PUBLIC_BING_VERIFICATION=
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

### Step 3: Get Google Search Console Verification Code

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Click **"Add Property"**
3. Enter: `https://www.reviseit.in`
4. Choose **"HTML tag"** method
5. You'll see something like:
   ```html
   <meta name="google-site-verification" content="abc123xyz456" />
   ```
6. Copy **ONLY** the content value: `abc123xyz456`
7. Add to `.env.local`:
   ```bash
   NEXT_PUBLIC_GOOGLE_VERIFICATION=abc123xyz456
   ```

### Step 4: Get Google Analytics Measurement ID

1. Go to [Google Analytics](https://analytics.google.com)
2. Create a new property for your website
3. Choose **"Web"** as the platform
4. You'll get a Measurement ID like: `G-ABC123XYZ`
5. Add to `.env.local`:
   ```bash
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-ABC123XYZ
   ```

### Step 5: Deploy and Verify

1. **Commit your changes** (but NOT .env.local - it should be in .gitignore)
2. **Deploy your site**
3. **Add env vars to your hosting platform:**

   **For Vercel:**
   ```bash
   # In Vercel Dashboard:
   Project Settings → Environment Variables
   # Add each variable
   ```

   **For Netlify:**
   ```bash
   # In Netlify Dashboard:
   Site settings → Environment variables
   # Add each variable
   ```

   **For other platforms:**
   - Check their docs for environment variable setup

4. **Verify in Google Search Console:**
   - Go back to Search Console
   - Click "Verify"
   - If successful, you'll see a green checkmark ✅

---

## 🧪 Testing Locally

After adding env vars, test locally:

```bash
# Make sure you're in the frontend directory
cd frontend

# Start the dev server
npm run dev

# Open browser and inspect the page source
# Look for the verification meta tag in <head>
# Should see: <meta name="google-site-verification" content="your-code" />
```

---

## ⚠️ Important Notes

### Security:
- ✅ **DO** commit `.env.example` (template)
- ❌ **DON'T** commit `.env.local` (contains secrets)
- ✅ **DO** add env vars to your hosting platform
- ❌ **DON'T** share verification codes publicly

### Variable Naming:
- `NEXT_PUBLIC_*` variables are exposed to the browser
- This is okay for verification codes (they're public anyway)
- Never use `NEXT_PUBLIC_*` for actual secrets (API keys, passwords)

### Multiple Environments:
```bash
# Development (.env.local)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Staging (.env.staging)
NEXT_PUBLIC_SITE_URL=https://staging.reviseit.in

# Production (hosting platform env vars)
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in
```

---

## 📝 .env.local Template

Complete template you can copy:

```bash
# ========================================
# ReviseIt - Environment Variables
# ========================================

# Site Configuration
NEXT_PUBLIC_SITE_URL=https://www.reviseit.in

# ========================================
# SEO Verification Codes
# ========================================

# Google Search Console
# Get from: https://search.google.com/search-console
NEXT_PUBLIC_GOOGLE_VERIFICATION=

# Bing Webmaster Tools
# Get from: https://www.bing.com/webmasters
NEXT_PUBLIC_BING_VERIFICATION=

# Yandex (optional - only if targeting Russia)
# Get from: https://webmaster.yandex.com
NEXT_PUBLIC_YANDEX_VERIFICATION=

# ========================================
# Analytics & Tracking
# ========================================

# Google Analytics 4
# Get from: https://analytics.google.com
# Format: G-XXXXXXXXXX
NEXT_PUBLIC_GA_MEASUREMENT_ID=

# Google Tag Manager (optional)
# Get from: https://tagmanager.google.com
# Format: GTM-XXXXXXX
NEXT_PUBLIC_GTM_ID=

# ========================================
# Firebase Configuration (if not already set)
# ========================================

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# ========================================
# Supabase Configuration (if not already set)
# ========================================

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# ========================================
# Other Services
# ========================================

# Resend Email API
RESEND_API_KEY=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

---

## 🔍 Troubleshooting

### Issue: Verification not working

**Check:**
1. ✅ Env var is set correctly (no extra spaces)
2. ✅ Site is deployed with the env var
3. ✅ Cache is cleared
4. ✅ Using correct verification method in Search Console

**Fix:**
```bash
# Clear Next.js cache
rm -rf .next

# Rebuild
npm run build

# Redeploy
```

### Issue: Env var not showing in browser

**Check:**
1. ✅ Variable name starts with `NEXT_PUBLIC_`
2. ✅ .env.local is in the frontend directory
3. ✅ Server was restarted after adding variable

**Fix:**
```bash
# Stop the dev server (Ctrl+C)
# Start again
npm run dev
```

### Issue: Different value in production

**Check:**
1. ✅ Env vars are set on hosting platform
2. ✅ Values match between local and production
3. ✅ Redeployed after adding env vars

**Fix:**
- Update env vars on hosting platform
- Redeploy the site

---

## ✅ Verification Checklist

After setup, verify:

- [ ] `.env.local` file created in frontend directory
- [ ] All required env vars added
- [ ] Values don't have extra spaces or quotes
- [ ] Dev server restarted
- [ ] Verification meta tag appears in page source
- [ ] Env vars added to hosting platform
- [ ] Site redeployed
- [ ] Verification successful in Search Console
- [ ] Google Analytics receiving data

---

## 📚 Additional Resources

- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Google Search Console Setup](https://support.google.com/webmasters/answer/9008080)
- [Google Analytics 4 Setup](https://support.google.com/analytics/answer/9304153)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

---

## 🎯 Quick Start Commands

```bash
# Create env file
touch frontend/.env.local

# Edit env file (use your preferred editor)
nano frontend/.env.local
# or
code frontend/.env.local

# Test locally
cd frontend && npm run dev

# Deploy (if using Vercel)
vercel --prod

# Check if env vars are loaded
# Add this temporarily to a page:
console.log('Verification:', process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION);
```

---

## 🤝 Need Help?

If you're stuck:

1. Check the main SEO guide: `frontend/SEO_GUIDE.md`
2. Review implementation summary: `frontend/SEO_IMPLEMENTATION_SUMMARY.md`
3. Check Next.js docs for environment variables
4. Verify your hosting platform's env var documentation

---

*Last Updated: December 14, 2024*

