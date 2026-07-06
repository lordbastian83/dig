# Running the desk 24/7 on Azure

The desk is a single long-lived Python process (`hedgedesk.main watch`). To run
it around the clock without a local machine, wrap it in a container and host it
on **Azure Container Apps** (serverless, scales to a single always-on replica,
cheap) with the audit ledger on persistent storage so Hermes keeps learning
across restarts.

## Why Container Apps (not a VM or Functions)

- The committee loop is **stateful and continuous** — a trailing-stop sweep and a
  learned prior that must survive restarts. Functions' short-lived executions
  fight that; a VM is overkill and you patch the OS yourself.
- Container Apps gives you one always-on replica, managed TLS, secrets via
  Key Vault, and a mounted Azure Files share for `runs/` in a few commands.

## 1. Secrets → Azure Key Vault

Never bake keys into the image. Store `ANTHROPIC_API_KEY`, `OPENBB_PAT`, and any
`HERMES_*` in Key Vault and reference them as Container App secrets.

```bash
az keyvault create -n hedgedesk-kv -g hedgedesk-rg -l eastus
az keyvault secret set --vault-name hedgedesk-kv -n anthropic-key --value "sk-ant-..."
az keyvault secret set --vault-name hedgedesk-kv -n openbb-pat  --value "..."
```

## 2. Build & push the image

```bash
az acr create -g hedgedesk-rg -n hedgedeskacr --sku Basic
az acr build -r hedgedeskacr -t hedgedesk:latest -f deploy/Dockerfile .
```

## 3. Persistent audit ledger (Azure Files)

The learning loop depends on `runs/` surviving restarts. Mount an Azure Files
share at `/app/runs`:

```bash
az storage account create -n hedgedeskstore -g hedgedesk-rg -l eastus --sku Standard_LRS
az storage share-rm create --storage-account hedgedeskstore -n desk-runs --quota 5
# then, on the Container Apps *environment*, register the share as a storage
# named "desk-runs" and mount it in the app (see the YAML below).
```

## 4. Deploy the Container App

`deploy/azure/containerapp.yaml` is a ready template. Key points: **1 min / 1 max
replica** (a committee is not horizontally scalable — you want exactly one desk),
secrets pulled from Key Vault, and the Files share mounted at `/app/runs`.

```bash
az containerapp env create -n hedgedesk-env -g hedgedesk-rg -l eastus
az containerapp create -g hedgedesk-rg -n hedgedesk \
  --environment hedgedesk-env \
  --yaml deploy/azure/containerapp.yaml
```

## 5. Scheduling model

Two independent cadences:

| Job | Cadence | How |
|---|---|---|
| Committee research loop | every 4h (candle close) | the `watch` loop's own sleep — nothing else needed |
| Open-position exit sweep | every 15–30 min | a **Container Apps Job** (cron trigger) running `hedgedesk.main exits`, or add a second interval inside the process |

For the exit sweep as a scheduled Job:

```bash
az containerapp job create -g hedgedesk-rg -n hedgedesk-exits \
  --environment hedgedesk-env --trigger-type Schedule \
  --cron-expression "*/20 * * * *" \
  --image hedgedeskacr.azurecr.io/hedgedesk:latest \
  --args "exits"
```

## 6. From verdict → execution

The `watch` loop prints/stores signed `Verdict` JSON. To act on it:

1. Emit each verdict to an **Azure Service Bus** queue (add a publisher at the end
   of `main.cmd_watch`).
2. A separate consumer (Function or small Container App) applies your own
   guardrails and routes `ACCUMULATE`/`TRIM`/`EXIT` to your venue —
   **TradingView** webhook, **Saxo** OpenAPI, or **IBKR**. Keeping execution in a
   separate service means the research desk can never place an order directly; a
   human-approval step slots in here cleanly.

## Cost & safety notes

- One always-on Container App replica + occasional LLM calls is the dominant cost;
  the 4h cadence keeps token spend modest. Lower `debate_rounds` to trim further.
- Set `HEDGEDESK_MODEL` to pin the model; keep `temperature` low (0.2) for
  disciplined, reproducible judgement.
- The desk **never executes** — it produces audited JSON. Treat the execution
  bridge as the place to add position limits, kill-switches, and human sign-off.
