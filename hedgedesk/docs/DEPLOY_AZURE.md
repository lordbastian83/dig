# Deploy the desk to Azure — going live

The desk runs as a single always-on service (`hedgedesk.main serve`): a committee
loop over your universe on a fixed cadence, plus an HTTP server exposing
`/health`, `/status`, and `/verdicts`. On Azure it lives in **Azure Container
Apps** (serverless, one always-on replica, managed TLS + ingress) with the audit
ledger on **Azure Files** so Hermes keeps learning across restarts.

## One command

```bash
az login
export ANTHROPIC_API_KEY=sk-ant-...      # required (Claude Fable)
export OPENBB_PAT=...                     # optional (premium equity data)
./deploy/azure/deploy.sh
```

That script is idempotent and does everything:

1. Resource group.
2. **Azure Container Registry** + builds the image **server-side** (`az acr build`)
   — you do **not** need Docker installed locally.
3. User-assigned managed identity with **AcrPull** (no registry passwords).
4. Log Analytics + Container Apps environment.
5. Storage account + **Azure Files** share, mounted at `/app/runs` (the audit
   ledger — survives restarts so learning persists).
6. The Container App: ingress on 8080, **`/health` liveness + readiness probes**,
   API keys as secrets, `HEDGEDESK_UNIVERSE`, and **1 min / 1 max replica** (a
   committee is not horizontally scalable — never run two desks on one book).

It prints the live URL at the end. Verify:

```bash
curl https://<fqdn>/health      # {"status":"ok",...}
curl https://<fqdn>/status      # per-ticker last run + verdict + data source
curl https://<fqdn>/verdicts    # recent signed verdicts from the ledger
az containerapp logs show -g hedgedesk-rg -n hedgedesk --follow
```

### Tuning the run

Override via env before deploying (or `az containerapp update --set-env-vars` after):

| Var | Default | Meaning |
|---|---|---|
| `HEDGEDESK_UNIVERSE` | `AAPL,MSFT,NVDA,BTC_USDT,ETH_USDT` | names the desk covers (equities + crypto) |
| `HEDGEDESK_EVERY_MIN` | `240` | committee cadence (4h = candle close) |
| `HEDGEDESK_MODEL` | `claude-fable-5` | reasoning model |
| `INSTALL_OPENBB` | `0` | set `1` to bake OpenBB into the image (heavier) |

## Declarative alternative (Bicep)

`deploy/azure/main.bicep` is the same infra as code. Push the image once, then:

```bash
az deployment group create -g hedgedesk-rg -f deploy/azure/main.bicep \
  -p anthropicApiKey=$ANTHROPIC_API_KEY imageTag=$(git rev-parse --short HEAD)
```

## Keep it live (CI/CD)

`.github/workflows/hedgedesk-deploy.yml` tests every push and, on `master`,
rebuilds the image in ACR and rolls the Container App to it. One-time setup:

```bash
az ad sp create-for-rbac --name hedgedesk-ci --role contributor \
  --scopes /subscriptions/<SUB>/resourceGroups/hedgedesk-rg --sdk-auth
# → paste JSON into repo secret AZURE_CREDENTIALS
# → add repo secret ANTHROPIC_API_KEY and repo variable HEDGEDESK_ACR
```

After that, every push to `master` under `hedgedesk/` redeploys automatically.

## Cost & safety

- One always-on Container App replica + LLM calls at a 4h cadence is the dominant
  cost; lower `debate_rounds` or widen `HEDGEDESK_EVERY_MIN` to trim.
- The desk **never places orders** — it emits audited JSON verdicts on `/verdicts`.
  Bridge those to your venue (TradingView webhook, Saxo/IBKR) in a *separate*
  service so a human-approval / kill-switch step sits between research and money.
- Scale to zero is deliberately disabled: continuous exit-monitoring and the
  in-memory learned prior need the process alive.

## Verified before you run it

- The service (`hedgedesk/service.py`) is smoke-tested: `/health`, `/status`, and
  `/verdicts` serve, and the worker completes committee cycles over a mixed
  equity+crypto universe (see the run in the PR/commit).
- The offline test suite (15 tests) gates every deploy via CI.
- `deploy.sh` passes `bash -n`, and its rendered Container App spec parses as
  valid YAML with all substitutions applied.
- The **image build and `az` provisioning run on Azure**, not here — this repo's
  sandbox blocks the Docker registry and Azure egress, so those steps execute
  the first time *you* run `deploy.sh` with your subscription.
