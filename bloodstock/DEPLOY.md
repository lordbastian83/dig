# Deploying the scanner to Azure + vault-racing.com

Three stages: create the Static Web App, connect the deploy workflow,
point the domain. Stages 1–2 are one-time; stage 3 is DNS.

## 1. Create the Static Web App (Azure portal)

1. Azure portal → **Create a resource** → search "Static Web App" → Create.
2. Plan: **Free** (2 custom domains included, free managed SSL).
3. Deployment source: **Other** — the GitHub workflow in this repo pushes
   the files itself.
4. Create, then open the resource. Note two things on the Overview page:
   - the auto-generated hostname, e.g. `happy-rock-0abc12345.azurestaticapps.net`
     — this is your CNAME target in stage 3;
   - the **Manage deployment token** button — copy the token.

## 2. Connect the deploy workflow (GitHub)

1. Repo → Settings → Secrets and variables → Actions → **New repository
   secret**: name `AZURE_STATIC_WEB_APPS_API_TOKEN_BLOODSTOCK`, value =
   the deployment token.
2. Actions tab → "Deploy Bloodstock Scanner to Azure Static Web Apps" →
   **Run workflow** (you can select this branch before it's merged).
   After merge, every push to `master` touching `bloodstock/app/**`
   deploys automatically.
3. Confirm the app loads at the `*.azurestaticapps.net` hostname.

## 3. Point vault-racing.com at it

Azure Static Web Apps validates `www` subdomains by CNAME automatically and
issues SSL for free. The apex (bare `vault-racing.com`) is the awkward one:
GoDaddy has no ALIAS/ANAME record type, so the standard GoDaddy setup is
**www as the real host + apex forwarding**.

### 3a. Add the domain in Azure

1. Static Web App resource → **Settings → Custom domains** → **+ Add** →
   "Custom domain on other DNS".
2. Enter `www.vault-racing.com` → Next. Azure shows the CNAME record it
   expects (host `www` → your `*.azurestaticapps.net` hostname).
3. Leave this blade open; add the DNS record (3b), then click **Validate**.
   Validation usually clears in minutes but can take up to 48 h for DNS
   propagation. SSL certificate is provisioned automatically after
   validation — nothing to buy or upload.

### 3b. DNS records in GoDaddy

GoDaddy → My Products → vault-racing.com → **DNS → Manage DNS**:

| Type | Name (host) | Value | TTL |
|------|-------------|-------|-----|
| CNAME | `www` | `<your-hostname>.azurestaticapps.net` | 1 hour |

Before saving: **delete any existing `www` CNAME** (GoDaddy parks one
pointing at the domain) — two records with the same host will fail.

### 3c. The apex: vault-racing.com → www

GoDaddy → same domain → **Forwarding** → Domain → Add:

- Forward to: `https://www.vault-racing.com`
- Type: **Permanent (301)**
- Forward only (not masking — masking breaks the PWA and SSL)

GoDaddy inserts its own forwarding A record at `@`; if an old parked
A record at `@` exists, remove it first.

### Alternative for a "real" apex (optional, later)

If you want `vault-racing.com` itself to resolve directly (no redirect):
either move the domain's nameservers to **Azure DNS** (free tier) and use
an ALIAS record at the apex, or add the apex in the Custom domains blade
via **TXT validation** — Azure shows a `TXT @ <code>` record to add in
GoDaddy — but the final ALIAS step still needs a DNS host that supports
ALIAS/ANAME, which GoDaddy is not. The www + 301 setup above is the normal
GoDaddy answer and costs nothing.

## 4. Locking the app behind login

The app requires the custom role **`vault`** on every route
(`staticwebapp.config.json`). Anyone without it is redirected to
**Microsoft 365 / Entra ID sign-in**, and even a signed-in stranger gets
403 — only invited accounts see the scanner. To invite yourself and each
syndicate member:

1. Azure portal → `vault-racing-www-swa` → **Settings → Role management**
   → **Invite**.
2. Authorization provider: **Microsoft Entra ID**. Invitee: their
   Microsoft email (e.g. `info@vaultmoney.io`). Domain: your app's domain.
   Role: **`vault`** (type it exactly). Generate.
3. Send them the invitation link — they open it, sign in with their
   Microsoft account, done. The link expires (hours), the membership
   doesn't.

Sign-out link is in the app footer. Note: the radar's `candidates.json`
feed is fetched from the public `bloodstock-data` branch, so the login
protects the app UI but the data stays public until the private-repo
migration.

## Checklist

- [ ] SWA created (Free plan), hostname noted
- [ ] Deployment token in `AZURE_STATIC_WEB_APPS_API_TOKEN_BLOODSTOCK`
- [ ] Workflow run green; app loads on `*.azurestaticapps.net`
- [ ] GoDaddy: parked `www` CNAME deleted, new CNAME added
- [ ] Azure: `www.vault-racing.com` validated, SSL issued
- [ ] GoDaddy: apex 301-forwarding to `https://www.vault-racing.com`
- [ ] Phone: open site → Add to Home Screen → scanner installs as an app
