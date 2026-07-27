# Hattor Migration Plan — Website, CRM, GoDaddy Domain → New GoDaddy Account + Azure

A step-by-step setup checklist for moving the Hattor website and CRM to Azure hosting/storage,
and moving the GoDaddy domain to a new GoDaddy account. Work through the phases in order —
the domain/DNS cutover (Phase 6) comes **last**, after everything is running on Azure.

---

## Phase 0 — Inventory and access (do this before touching anything)

- [ ] **Collect logins** for: old GoDaddy account, current web host (cPanel/Plesk/FTP/SSH),
      CRM admin, DNS manager, and email provider.
- [ ] **Identify the website stack**: static HTML, WordPress/PHP, Node/React, .NET, etc.
      This decides which Azure hosting service you use in Phase 2.
- [ ] **Identify the CRM**: is it self-hosted (e.g. SuiteCRM, EspoCRM, custom app + database)
      or a SaaS product (HubSpot, Zoho, Dynamics)? A SaaS CRM does **not** move to Azure —
      only its DNS/email/integration settings change.
- [ ] **Export a full DNS zone snapshot** from the old GoDaddy account (screenshot or export
      every A, AAAA, CNAME, MX, TXT/SPF/DKIM/DMARC, and SRV record). You will recreate these.
- [ ] **Locate email hosting**: GoDaddy/Microsoft 365 email tied to the old account, or external?
      Email tied to the old GoDaddy account needs its own migration plan or it will break at cutover.
- [ ] **Take full backups**: website files, website database(s), CRM database, CRM file
      attachments/uploads, SSL certificates (if custom), and any cron jobs/scheduled tasks.
- [ ] **Note all integrations**: payment gateways, contact forms, SMTP senders, webhooks,
      API keys that reference the old server's IP or hostname.
- [ ] **Lower DNS TTLs to 600 seconds now** on all records — this makes the final cutover fast.

## Phase 1 — New GoDaddy account

- [ ] Create the new GoDaddy account with the correct owner email, and enable 2-step verification.
- [ ] Verify the account email address.
- [ ] Add payment method and confirm domain auto-renew will be ON after the move.

## Phase 2 — Azure foundation

- [ ] Create (or use) the Azure subscription; set a **budget + cost alert** immediately.
- [ ] Create a resource group, e.g. `rg-hattor-prod`, in the region closest to your users.
- [ ] Create a **Storage Account** (e.g. `sthattorprod`): Blob containers for site media/uploads
      and a `backups` container. Enable soft delete and (optionally) lifecycle rules.
- [ ] Choose the website hosting service:
  - Static site → **Azure Static Web Apps** (free/standard tier).
  - WordPress/PHP/Node/.NET → **Azure App Service** (Linux, B1 or higher for production).
  - Full server control needed → **Azure VM** (last resort; more maintenance).
- [ ] If the site/CRM uses a database, create the managed equivalent:
  - MySQL → **Azure Database for MySQL Flexible Server**
  - PostgreSQL → **Azure Database for PostgreSQL Flexible Server**
  - SQL Server → **Azure SQL Database**
- [ ] If the CRM is self-hosted, create a **separate App Service** (or a second app on the same
      plan) for it, e.g. `crm.hattor.com`, with its own database.
- [ ] Store secrets (DB passwords, API keys, SMTP creds) in **Azure Key Vault** or App Service
      configuration settings — not in code.
- [ ] Set up backups: App Service backup or database automated backups (default 7 days —
      raise retention if needed), plus nightly DB dump to the `backups` blob container.

## Phase 3 — Migrate the website to Azure

- [ ] Copy site files/code to the new App Service (Git deploy, GitHub Actions, or zip deploy).
- [ ] Import the website database into the Azure database; update the site's DB connection string.
- [ ] Repoint file uploads/media to Azure Blob Storage where applicable (or copy the uploads
      folder into the App Service / mounted storage).
- [ ] Update hardcoded URLs (WordPress: `siteurl`/`home`; run a search-replace on the DB).
- [ ] Test on the temporary Azure URL (`*.azurewebsites.net`) — pages, forms, checkout, admin login.
- [ ] Fix outbound email: App Services often can't send raw SMTP reliably — configure an email
      service (e.g. Azure Communication Services, SendGrid, or SMTP2GO) for form/notification mail.

## Phase 4 — Migrate the CRM

**If self-hosted CRM:**
- [ ] Deploy the CRM application to its Azure App Service/VM.
- [ ] Import the CRM database; copy attachment/upload directories (to Blob Storage or app storage).
- [ ] Update the CRM config: site URL (`crm.hattor.com`), DB connection, SMTP settings.
- [ ] Recreate cron jobs / scheduled tasks (App Service WebJobs, or Azure Functions timer).
- [ ] Test: login, contact search, email send/receive, workflows, any website→CRM form feeds.

**If SaaS CRM (HubSpot/Zoho/Dynamics/etc.):**
- [ ] Nothing moves to Azure. Just re-verify domain ownership DNS records (CNAME/TXT) in the
      new DNS zone, and update any tracking scripts/form embeds on the new site if URLs changed.

## Phase 5 — Move the GoDaddy domain to the new GoDaddy account

Moving **between two GoDaddy accounts** is an internal "account change," not a registrar
transfer — it's free, instant, and does not extend/reset the registration.

- [ ] Old account → Domain settings → **Transfer to another GoDaddy account** (account change).
- [ ] Enter the new account's email/customer number; the new account accepts the incoming domain.
- [ ] **Important:** decide whether to copy the DNS zone during the move — GoDaddy may reset
      the zone to defaults. Have your Phase 0 DNS snapshot ready to recreate records.
- [ ] In the new account: turn ON auto-renew, keep the domain **locked**, confirm WHOIS/contact
      info (changing registrant contact can trigger a 60-day transfer lock — fine if staying
      at GoDaddy).
- [ ] If email (Microsoft 365 via GoDaddy) was bundled with the old account, move/repurchase
      those subscriptions under the new account **before** closing anything in the old one.

## Phase 6 — DNS cutover to Azure (go-live)

- [ ] In Azure, add custom domains to the App Service/Static Web App: `hattor.com`, `www`,
      and `crm.hattor.com`. Azure gives you the verification TXT record and target
      (CNAME to `<app>.azurewebsites.net`, or A record to the app's IP for the apex).
- [ ] In the new GoDaddy account's DNS zone, recreate **all** records from the Phase 0 snapshot,
      then change the web records to point at Azure:
  - `www` → CNAME → the Azure app hostname
  - apex `@` → A record to the App Service IP (plus the `asuid` TXT verification record)
  - `crm` → CNAME → the CRM app hostname
  - **Do not change MX/SPF/DKIM records** unless email is intentionally moving.
- [ ] Enable **App Service managed certificates** (free SSL) on each custom domain; force HTTPS.
- [ ] Wait for propagation (fast because of the low TTLs), verify the live site + CRM over HTTPS.
- [ ] Send a test email from a website form and from the CRM; confirm inbound email still works.

## Phase 7 — Post-migration cleanup

- [ ] Re-test all integrations (payments, webhooks, API callers) against the new hostnames/IPs.
- [ ] Update Google Search Console / Analytics, sitemap, and any IP allowlists at third parties.
- [ ] Keep the old hosting running **read-only for 2–4 weeks** as rollback, then cancel it.
- [ ] Take a final archive backup of the old server before it's deleted; store it in the
      `backups` blob container.
- [ ] Close or downgrade the old GoDaddy account only after confirming the domain, email
      products, and any other domains/services have all been moved out.
- [ ] Raise DNS TTLs back to normal (e.g. 3600s).
- [ ] Document the new setup: Azure resources, DNS records, credentials location (Key Vault),
      backup schedule, and renewal dates.

---

## Rollback plan (keep handy on cutover day)

DNS is the switch: pointing `www`/`@`/`crm` back to the old host's records restores the old
site within the TTL window. That's why the old server stays untouched until Phase 7.
