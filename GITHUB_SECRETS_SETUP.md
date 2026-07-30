# GitHub Secrets Setup Guide (Non-Technical)

Follow these steps AFTER pushing files to GitHub.

---

## Step 1: Go to Your GitHub Repository

1. Open your browser
2. Go to [github.com](https://github.com)
3. Login and find your **PAFWA-Inventory** repo

---

## Step 2: Add Your Supabase Credentials as Secrets

### 2.1 Access Secrets Page

1. Click **Settings** (top right, gear icon)
2. In left sidebar: Find **"Secrets and variables"** → Click **"Actions"**

### 2.2 Add First Secret

1. Click the green button: **"New repository secret"**

2. Fill in:
   - **Name:** `SUPABASE_URL`
   - **Secret:** `https://isxefzwqtsiimhsfiuet.supabase.co`

3. Click **"Add secret"**

### 2.3 Add Second Secret

1. Click **"New repository secret"** again

2. Fill in:
   - **Name:** `SUPABASE_KEY`
   - **Secret:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzeGVmendxdHNpaW1oc2ZpdWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNjYxOTksImV4cCI6MjA5Mjg0MjE5OX0.c7rxoBQOPzOrfB9WAc-UXR9bS5GkSUA-nxA5pQwysXc`

3. Click **"Add secret"**

---

## Step 3: Enable GitHub Pages

1. Still in **Settings**
2. In left sidebar: Click **"Pages"**
3. Under **"Build and deployment"** → **"Source"**:
   - Click the dropdown
   - Select **"GitHub Actions"**
4. Click **Save** (blue button)

---

## Step 4: Trigger First Deployment

1. Go to **Actions** tab (top menu of your repo)
2. You should see "Deploy to GitHub Pages with Secrets" running
3. Wait 2-3 minutes until you see a green checkmark ✅
4. If it shows red ❌, click on it and read the error message

---

## Step 5: Get Your Site URL

1. Go to **Settings** → **Pages**
2. You'll see your live URL like:
   ```
   https://yourusername.github.io/your-repo-name/
   ```

3. Share this URL with your clients!

---

## Step 6: Testing

1. Open your site URL in a browser
2. Login with your Supabase credentials
3. Everything should work!

---

## Quick Reference

| Secret Name | Value |
|-------------|-------|
| SUPABASE_URL | https://isxefzwqtsiimhsfiuet.supabase.co |
| SUPABASE_KEY | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (starts with eyJ) |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Secret not found" error | Check Actions tab → Click failed job → Verify secret names are exact (SUPABASE_URL, SUPABASE_KEY) |
| Site shows blank page | Wait 3 minutes, then refresh |
| Login not working | Check browser console (F12) for errors |
| Workflow not running | Make sure you pushed files including .github/workflows/deploy.yml |

---

## What Just Happened?

```
YOUR COMPUTER                    GITHUB                      DEPLOYED SITE
─────────────                    ──────                      ─────────────

You push code            Secrets stored               Clients visit URL
with placeholders   →    (hidden)    →             →   and see working app
```

Your credentials are:
- Stored safely in GitHub (not visible in source code)
- Injected into app.js during deployment
- Never exposed to people viewing your repo

---

## Need Help?

If something goes wrong, go to **Actions** tab and click on the failed workflow to see exactly what went wrong.