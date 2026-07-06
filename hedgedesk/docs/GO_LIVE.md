# Go Live — step by step

Everything you run is on **your own machine**, signed in as your Azure account
(info@vaultmoney.io). Nothing here needs Docker locally — the image is built in
Azure. Budget ~10 minutes.

---

## Step 0 — Get two keys/tools ready

You need exactly two things only you can provide:

1. **An Anthropic API key** (the desk's reasoning engine).
   Get it at <https://console.anthropic.com> → *API Keys* → *Create Key*. It
   starts with `sk-ant-`.
2. **Azure CLI installed.**
   - macOS:  `brew install azure-cli`
   - Windows: `winget install Microsoft.AzureCLI`
   - Linux:  `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash`

Check it works:

```bash
az version
```

---

## Step 1 — Sign in to Azure

```bash
az login
```

A browser opens → sign in as **info@vaultmoney.io**. When it returns, confirm
you're on the right account:

```bash
az account show --query "{account:user.name, subscription:name}" -o table
```

If you have more than one subscription, pick which one to use:

```bash
az account list --query "[].{name:name, id:id}" -o table
az account set --subscription "<the-id-or-name-you-want>"
```

---

## Step 2 — Get the code

```bash
git clone -b claude/ai-hedge-fund-desk-3fjj65 https://github.com/lordbastian83/dig.git
cd dig/hedgedesk
```

---

## Step 3 — Set your key and deploy

```bash
export ANTHROPIC_API_KEY=sk-ant-...          # from Step 0
export EXPECTED_ACCOUNT=info@vaultmoney.io   # safety guard: aborts on wrong login

./deploy/azure/deploy.sh
```

The script prints the account it's using and asks you to confirm (`y`). Then it
does everything automatically:

1. Creates a resource group (`hedgedesk-rg`).
2. Creates a container registry and **builds the image inside Azure** (watch the
   build log stream — takes ~2–3 min).
3. Sets up a managed identity, Log Analytics, and the Container Apps environment.
4. Creates persistent storage for the audit ledger (so learning survives
   restarts).
5. Deploys the service with a `/health` probe and one always-on replica.

When it finishes it prints:

```
✅ Deployed. The desk is live at: https://hedgedesk.<region>.azurecontainerapps.io
```

---

## Step 4 — Verify it's live

```bash
FQDN=https://hedgedesk.<region>.azurecontainerapps.io   # from Step 3 output

curl $FQDN/health      # {"status":"ok",...}
curl $FQDN/status      # each ticker's last run, verdict, conviction, data source
curl $FQDN/verdicts    # recent signed verdicts from the ledger
```

Watch it think in real time:

```bash
az containerapp logs show -g hedgedesk-rg -n hedgedesk --follow
```

Within one cycle you'll see lines like `NVDA -> ACCUMULATE 7/10`.

---

## Step 5 (optional) — Choose what it trades and how often

Defaults: `AAPL,MSFT,NVDA,BTC_USDT,ETH_USDT`, every 4 hours. Change without
redeploying:

```bash
az containerapp update -g hedgedesk-rg -n hedgedesk \
  --set-env-vars HEDGEDESK_UNIVERSE="AAPL,TSLA,BTC_USDT,SOL_USDT" \
                 HEDGEDESK_EVERY_MIN="240"
```

---

## Step 6 (optional) — Auto-redeploy on every code change

So you never run the script again after a change:

```bash
# create a deploy identity scoped to just this resource group
az ad sp create-for-rbac --name hedgedesk-ci --role contributor \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/hedgedesk-rg --sdk-auth
```

Copy the JSON it prints. In GitHub → repo **Settings → Secrets and variables →
Actions**:
- Secret `AZURE_CREDENTIALS` = that JSON
- Secret `ANTHROPIC_API_KEY` = your `sk-ant-...`
- Variable `HEDGEDESK_ACR` = the registry name the deploy printed (e.g. `hedgedeskab12cd34`)

Now every push to `master` under `hedgedesk/` rebuilds and rolls the app
(`.github/workflows/hedgedesk-deploy.yml`).

---

## Cost (rough)

- Container App (1 vCPU / 2 GB, always on): ~**$30–45/month**.
- Registry (Basic) + storage + logs: ~**$6–10/month**.
- Anthropic API: usage-based; at a 4h cadence over ~5 names it's modest. Widen
  `HEDGEDESK_EVERY_MIN` or lower `debate_rounds` to reduce it.

Tear it all down anytime:

```bash
az group delete -n hedgedesk-rg --yes --no-wait
```

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| `Not logged in` | `az login` again as info@vaultmoney.io |
| `Signed in as '…' but EXPECTED_ACCOUNT=…` | wrong account/subscription — `az account set` |
| `/status` shows tickers in `error` state | almost always a bad/missing `ANTHROPIC_API_KEY` — check `az containerapp logs show` |
| Provider register errors | run `az provider register -n Microsoft.App --wait` and re-run |
| Quota / region error | set `LOCATION=westus2` (or another region) and re-run the script |

The service is built to stay up even when a run fails — `/health` stays green so
you can always reach `/status` to see what's wrong.
