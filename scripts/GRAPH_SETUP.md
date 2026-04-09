# Microsoft Graph Email Setup

One-time Azure app registration to enable automated email fetching.

## Step 1 — Register the app (5 minutes)

1. Go to https://portal.azure.com and sign in with dho@corsonagency.com
2. In the top search bar, search for **"App registrations"** and click it
3. Click **"+ New registration"**
4. Fill in:
   - **Name:** `Corson Email Pipeline`
   - **Supported account types:** select **"Accounts in any organizational directory and personal Microsoft accounts"**
   - **Redirect URI:** leave blank for now
5. Click **Register**

## Step 2 — Copy your IDs

On the app overview page you'll see:
- **Application (client) ID** — copy this
- **Directory (tenant) ID** — copy this

## Step 3 — Enable device code login

1. In the left sidebar click **Authentication**
2. Scroll to **"Advanced settings"**
3. Set **"Allow public client flows"** to **Yes**
4. Click **Save**

## Step 4 — Add Mail.Read permission

1. In the left sidebar click **API permissions**
2. Click **"+ Add a permission"**
3. Click **Microsoft Graph** → **Delegated permissions**
4. Search for and check: **Mail.Read**
5. Also check: **offline_access** (for refresh tokens — stays logged in)
6. Click **Add permissions**
7. Click **"Grant admin consent for [your org]"** → Yes
   (If you don't see this button, that's fine — it will prompt you on first sign-in)

## Step 5 — Add credentials to .env

Edit `scripts/.env` (create it if it doesn't exist):

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
AZURE_CLIENT_ID=paste-your-application-client-id-here
AZURE_TENANT_ID=paste-your-directory-tenant-id-here
```

## Step 6 — First run (one-time sign-in)

```bash
cd ~/corson-command-center
node scripts/fetch-emails.mjs
```

It will print a URL and a short code. Open the URL, enter the code, sign in.
After that, it runs silently forever — no more sign-ins needed.

## Step 7 — Run the full pipeline

```bash
bash scripts/sync-emails.sh
```

This runs every day at 8AM automatically via launchd.
