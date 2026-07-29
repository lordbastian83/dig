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

## 5. Cross-device sync (watchlist follows your login)

The watchlist, notes, grades, saved searches and settings sync across phone
and laptop once a storage account is attached. Without it the app still
works, just per-device.

1. Azure portal → **Create a resource → Storage account** → any name, same
   region, cheapest redundancy (LRS). Create.
2. On the storage account → **Access keys** → copy **Connection string**.
3. Static Web App `vault-racing-www-swa` → **Settings → Environment
   variables** (Application settings) → **+ Add** → name
   `AZURE_STORAGE_CONNECTION`, value = the connection string → Save.
4. Re-run the deploy workflow (it now builds the `api/` function).

Data is keyed to your Microsoft login id and stored one row per user, so
each syndicate member sees only their own. Sign in on any device → your
saved board loads automatically.

## 6. AI photo inspection (conformation first pass)

Each horse profile has a **📷 Analyse photo (AI)** button. It resizes a
conformation photo in the browser and sends it to a vision model, which
grades the six conformation items (shoulder, pasterns, hoof-pastern axis,
limb, walk, balance) and writes a one-line read — you then adjust the grid
by eye. The model key stays server-side; the browser never sees it. Until
it's configured the button just says "AI inspection not enabled yet" and the
manual grid still works.

It works with **Claude (Anthropic)** or **OpenAI / Azure OpenAI**. Add these
Static Web App **Application settings** (same place as
`AZURE_STORAGE_CONNECTION`):

| Setting | Value |
|---|---|
| `INSPECT_PROVIDER` | `anthropic` (Claude) or `openai`. Auto-detected from the URL if omitted |
| `INSPECT_API_KEY` | The API key |
| `INSPECT_API_URL` | Optional — defaults to the provider's standard endpoint |
| `INSPECT_MODEL` | Optional — model name (defaults below) |
| `INSPECT_AUTH` | OpenAI only: `bearer` (default) or `api-key` (Azure) |

**Claude / Anthropic (recommended):** get an API key from
**console.anthropic.com** (this is the *API*, billed per-use — separate from a
Claude.ai Pro/Max subscription, which doesn't include API access). Then just:

- `INSPECT_PROVIDER=anthropic`
- `INSPECT_API_KEY=sk-ant-…`

That's it — the URL defaults to `https://api.anthropic.com/v1/messages` and the
model to a Haiku vision model (cheap/fast). For a sharper read set
`INSPECT_MODEL=claude-sonnet-5`. Cost is roughly a US cent or two per photo on
Haiku.

**OpenAI:** `INSPECT_PROVIDER=openai`, `INSPECT_API_KEY=sk-…`. URL defaults to
`https://api.openai.com/v1/chat/completions`, model to `gpt-4o-mini` (set
`INSPECT_MODEL=gpt-4o` for a sharper read).

**Azure OpenAI:** deploy a vision model, then `INSPECT_PROVIDER=openai`,
`INSPECT_API_URL=https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-08-01-preview`,
`INSPECT_API_KEY=<key>`, `INSPECT_AUTH=api-key` (the model comes from the
deployment URL, so `INSPECT_MODEL` is ignored).

Re-run the deploy workflow after adding them. This is an assistive first pass,
**not** the biomechanics pose model — that's a separate ML service (see
`DATA-SOURCES.md`); the scorer here is ready to receive its output too.

## Checklist

- [ ] SWA created (Free plan), hostname noted
- [ ] Deployment token in `AZURE_STATIC_WEB_APPS_API_TOKEN_BLOODSTOCK`
- [ ] Workflow run green; app loads on `*.azurestaticapps.net`
- [ ] GoDaddy: parked `www` CNAME deleted, new CNAME added
- [ ] Azure: `www.vault-racing.com` validated, SSL issued
- [ ] GoDaddy: apex 301-forwarding to `https://www.vault-racing.com`
- [ ] Phone: open site → Add to Home Screen → scanner installs as an app
