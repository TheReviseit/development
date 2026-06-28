# Emergency Secret Rotation — BFG Repo Cleaner

All secrets below were committed to git history before `.env*` was added to
`.gitignore`. Git history is permanent — deleting the files from HEAD does not
remove them from history. Anyone with repo access can find them in `git log -p`.

**You must rotate every secret below at its source service, then scrub history
with BFG Repo Cleaner.**

---

## Step 1: Regenerate Secrets at Source

Create new values for each secret, then update BOTH `.env` files. Do NOT commit
the new values until Step 2 is complete.

| Secret | Frontend .env | Backend .env | Rotate At |
|--------|---------------|--------------|-----------|
| `FIREBASE_ADMIN_PRIVATE_KEY` | line 20 | — | Firebase Console → Project Settings → Service Accounts → Generate new private key |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | line 22 | — | Same as above (embedded in base64 JSON) |
| `SUPABASE_SERVICE_ROLE_KEY` | line 36 | line 45 | Supabase Dashboard → Settings → API → `service_role` key → Regenerate |
| `RESEND_API_KEY` | line 41 | line 114 | Resend Dashboard → API Keys |
| `ENCRYPTION_KEY` | line 55 | line 50 | `openssl rand -hex 32` (generate new, update both .env files with same value) |
| `FACEBOOK_APP_SECRET` / `META_APP_SECRET` | line 56 | line 128 | Meta Developer Console → Apps → Flowauxi → Settings → Basic |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` / `META_WEBHOOK_VERIFY_TOKEN` | line 59 | line 131 | Generate random string, update Meta webhook config |
| `RAZORPAY_KEY_SECRET` | line 78 | line 65 | Razorpay Dashboard → Settings → API Keys → Regenerate |
| `RAZORPAY_WEBHOOK_SECRET` | line 82 | line 66 | Razorpay Dashboard → Webhooks → Edit → Regenerate secret |
| `OPENAI_API_KEY` | — | line 35 | OpenAI Dashboard → API Keys |
| `REDIS_URL` | — | line 54 | Redis Labs / Upstash Console → Regenerate password |
| `WHATSAPP_ACCESS_TOKEN` | — | line 14 | Meta Developer Console → WhatsApp → Access Token (temporary) |
| `INTERNAL_API_KEY` | line 70 | line 18 | Any random 48-char string, same in both files |
| `CLOUDINARY_API_SECRET` | line 29 | — | Cloudinary Dashboard → Settings → Security |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | line 94 | line 93 | Cloudflare Dashboard → R2 → Manage API Tokens |
| `BING_WEBMASTER_API_KEY` | line 49 | — | Bing Webmaster Tools → Settings |
| `ANALYTICS_API_SECRET` | line 112 | — | GA4 Admin → Data Streams → Measurement Protocol API secrets |
| `MONITOR_ADMIN_KEY` | line 101 | line 119 | Generate new random string |
| `ADMIN_API_KEY` | — | line 120 | Generate new random string |
| `JWT_SECRET` | — | line 28 | `openssl rand -base64 32` |
| `CONSOLE_JWT_SECRET` | — | line 109 | `openssl rand -base64 32` |
| `OTP_HASH_SALT` | — | line 102 | `openssl rand -hex 32` |
| `GOOGLE_SHEETS_CREDENTIALS` | — | line 60 | GCP Console → Service Accounts → Create new key |

---

## Step 2: Scrub Git History with BFG

### Prerequisites

1. Install Java Runtime (JRE 8+): https://www.java.com/download/
2. Download BFG: https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
3. Save as `bfg.jar` in your project root

### Commands

```bash
# 1. Create a backup branch
git branch backup/main main

# 2. Create a text file listing all strings to replace
# Save as replacements.txt in project root:
cat > replacements.txt << 'EOF'
AIzaSyC0z-YBr7DPJuCFfCpaY2gnZuJ1KfMhoUs==FIREBASE_API_KEY_REVOKED
AIzaSyD0R3qVoiPDE0V818gpNZ-zu4W9FLwY5uc==GEMINI_API_KEY_REVOKED
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==OPENAI_API_KEY_REVOKED
ROAlL6pejCwdwfgPbEfTKYLV==RAZORPAY_KEY_SECRET_REVOKED
TvPG00p1Z4p5PGBym8Tq0wfm==RAZORPAY_KEY_SECRET_REVOKED_OLD
Ph58KhW05kJvRaRK202NMoqSkQZvFAxF==REDIS_PASSWORD_REVOKED
re_B6vNzFJK_4YNZz2sWKVyn4A2hiKBe5dT1==RESEND_API_KEY_REVOKED
c770a994701c046e2e7cfea585ec5d4c==FACEBOOK_APP_SECRET_REVOKED
efdf689c3983248f6110b0afe3d1b2dba218dadf196ac7ca3a054746e2b94536==ENCRYPTION_KEY_REVOKED_1
cae42563bbabbffc7bea654ab4717d4930bd48b77c59b6a36c89bef5b900d352==ENCRYPTION_KEY_REVOKED_2
xUAaR7n0a5bgIxSw9FfGKO3wcybG_AmNkC8i41jn9V4==INTERNAL_API_KEY_REVOKED
EOF

# 3. Run BFG to replace all occurrences in history
java -jar bfg-1.14.0.jar --replace-text replacements.txt --no-blob-protection

# 4. Force Git to garbage-collect and expire reflog
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Force push to all remotes
git push origin --force --all
git push origin --force --tags

# 6. Notify all collaborators to re-clone (their local history is now invalid)
```

### Verification

```bash
# Check that secrets no longer appear in any commit
git log --all -p | grep -i "ROAlL6pe" && echo "STILL PRESENT" || echo "SCRUBBED"

# Check that .env files are now ignored
git check-ignore frontend/.env backend/.env
# Both should return the file path (meaning they're ignored)
```

---

## Step 3: Move Secrets to Hosted Secret Stores

### Vercel (Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Set ALL non-public frontend secrets
vercel secrets add RAZORPAY_KEY_SECRET <new-value>
vercel secrets add RAZORPAY_WEBHOOK_SECRET <new-value>
vercel secrets add RESEND_API_KEY <new-value>
vercel secrets add FIREBASE_ADMIN_PRIVATE_KEY "<new-value>"  # Quoted for newlines
vercel secrets add SUPABASE_SERVICE_ROLE_KEY <new-value>
vercel secrets add ENCRYPTION_KEY <new-value>
vercel secrets add CLOUDINARY_API_SECRET <new-value>
vercel secrets add CLOUDFLARE_R2_SECRET_ACCESS_KEY <new-value>
vercel secrets add CLOUDFLARE_R2_ACCOUNT_ID <new-value>
vercel secrets add CLOUDFLARE_R2_ACCESS_KEY_ID <new-value>
vercel secrets add INTERNAL_API_KEY <new-value>
vercel secrets add MONITOR_ADMIN_KEY <new-value>
vercel secrets add ANALYTICS_API_SECRET <new-value>
vercel secrets add FACEBOOK_APP_SECRET <new-value>
vercel secrets add BING_WEBMASTER_API_KEY <new-value>
```

### Render / Railway (Backend)

Set each env var in the Render Dashboard → Environment or `render.yaml`:

```yaml
  envVars:
    - key: RAZORPAY_KEY_SECRET
      value: <new-value>
    - key: SUPABASE_SERVICE_ROLE_KEY
      value: <new-value>
    - key: OPENAI_API_KEY
      value: <new-value>
    - key: REDIS_URL
      value: <new-value>
    - key: ENCRYPTION_KEY
      value: <new-value>
    # ... all other secrets
```

---

## Step 4: Rotate Webhook URLs if Needed

If the `RAZORPAY_WEBHOOK_SECRET` was changed, update the webhook URL in
Razorpay Dashboard → Webhooks to match the new secret. Razorpay will reject
webhooks signed with the old secret immediately after rotation.

---

## Post-Rotation Checklist

- [ ] All 22+ secrets regenerated at source
- [ ] BFG ran successfully, `git log --all -p` shows no secrets
- [ ] Force push completed to all remotes
- [ ] All collaborators notified to re-clone
- [ ] Vercel secrets populated
- [ ] Render/backend env vars populated
- [ ] `.env` files removed from `.gitignore` exception list (already done)
- [ ] Pre-commit hook added to block `.env` file commits
- [ ] `git log --all -p | grep -i "BEGIN PRIVATE KEY"` returns nothing
