#!/usr/bin/env bash
# One-command Azure deploy for the AI Hedge Fund Desk.
#
# Provisions everything and ships the running service:
#   Resource group · ACR (image built server-side, no local Docker needed) ·
#   Log Analytics · Container Apps environment · Azure Files (persistent audit
#   ledger) · user-assigned identity (ACR pull) · the Container App itself
#   (ingress + /health probe, API-key secrets, 1 always-on replica).
#
# Prereqs: `az login` done, and the API key exported:
#   export ANTHROPIC_API_KEY=sk-ant-...
#   export OPENBB_PAT=...            # optional (premium equity data)
#   ./deploy/azure/deploy.sh
#
# Re-runnable: every step is idempotent, so re-running redeploys the latest code.
set -euo pipefail

# ---- config (override via env) --------------------------------------------
LOCATION="${LOCATION:-eastus}"
RG="${RG:-hedgedesk-rg}"
ACR="${ACR:-hedgedesk$RANDOM_SUFFIX_ACR}"          # must be globally unique; see below
ENV_NAME="${ENV_NAME:-hedgedesk-env}"
APP_NAME="${APP_NAME:-hedgedesk}"
IDENTITY="${IDENTITY:-hedgedesk-id}"
STORAGE="${STORAGE:-hedgedesk$RANDOM}"             # globally unique storage acct
SHARE="${SHARE:-desk-runs}"
ENV_STORAGE_NAME="${ENV_STORAGE_NAME:-desk-runs}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"
INSTALL_OPENBB="${INSTALL_OPENBB:-0}"

export HEDGEDESK_MODEL="${HEDGEDESK_MODEL:-claude-fable-5}"
export HEDGEDESK_UNIVERSE="${HEDGEDESK_UNIVERSE:-AAPL,MSFT,NVDA,BTC_USDT,ETH_USDT}"
export HEDGEDESK_EVERY_MIN="${HEDGEDESK_EVERY_MIN:-240}"
export OPENBB_PAT="${OPENBB_PAT:-}"

# ACR names can't contain '-'; if the user didn't pin one, derive a stable name.
if [[ "$ACR" == *RANDOM_SUFFIX_ACR* ]]; then
  ACR="hedgedesk$(echo "$RG$LOCATION" | md5sum | cut -c1-8)"
fi

# ANTHROPIC_API_KEY is OPTIONAL: without it the desk deploys and runs in
# heuristic mode (rule-based verdicts on live data). Add it to upgrade to the
# full Claude Fable committee.
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo "ℹ No ANTHROPIC_API_KEY set — deploying in HEURISTIC mode (no LLM). You can add the key later."
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

# ---- 0. preflight: confirm we're logged into the RIGHT Azure account -------
command -v az >/dev/null 2>&1 || { echo "✗ Azure CLI not found. Install it, then 'az login'."; exit 1; }
if ! ACCOUNT_JSON="$(az account show -o json 2>/dev/null)"; then
  echo "✗ Not logged in. Run:  az login   (as info@vaultmoney.io)"; exit 1
fi
SIGNED_IN="$(echo "$ACCOUNT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("user",{}).get("name",""))')"
SUB_NAME="$(echo "$ACCOUNT_JSON" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("name",""))')"
echo "▸ Signed in as: ${SIGNED_IN:-<unknown>}   Subscription: ${SUB_NAME}"
# Optional guard: export EXPECTED_ACCOUNT=info@vaultmoney.io to hard-fail on mismatch.
if [[ -n "${EXPECTED_ACCOUNT:-}" && "$SIGNED_IN" != "$EXPECTED_ACCOUNT" ]]; then
  echo "✗ Signed in as '$SIGNED_IN' but EXPECTED_ACCOUNT='$EXPECTED_ACCOUNT'."
  echo "  Fix:  az login  (or)  az account set --subscription <name-or-id>"; exit 1
fi
# If the account has multiple subscriptions, pin one with: export SUBSCRIPTION=<id>
if [[ -n "${SUBSCRIPTION:-}" ]]; then az account set --subscription "$SUBSCRIPTION"; fi
# Interactive confirm; skip with ASSUME_YES=1 (for CI / non-TTY runs).
if [[ "${ASSUME_YES:-}" != "1" ]]; then
  if [[ -t 0 ]]; then
    read -r -p "▸ Deploy to this subscription? [y/N] " ok; [[ "$ok" == [yY] ]] || { echo "aborted."; exit 1; }
  else
    echo "✗ Non-interactive shell. Re-run with ASSUME_YES=1 to proceed."; exit 1
  fi
fi

echo "▸ RG=$RG  LOCATION=$LOCATION  ACR=$ACR  APP=$APP_NAME  TAG=$IMAGE_TAG"

az extension add --name containerapp --upgrade --only-show-errors -y >/dev/null 2>&1 || true

# Resource providers must be Registered before we create anything, or Container
# Apps / ACR / Storage calls fail on a fresh subscription. Register + wait (this
# blocks a few minutes the first time; it's a no-op once registered).
echo "▸ Ensuring resource providers are registered (first run can take a few min)…"
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry Microsoft.Storage; do
  state="$(az provider show -n "$ns" --query registrationState -o tsv 2>/dev/null || echo NotRegistered)"
  if [[ "$state" != "Registered" ]]; then
    echo "   registering $ns (currently: $state)…"
    az provider register -n "$ns" --wait
  fi
done
# Final gate: confirm the critical one really is Registered before proceeding.
if [[ "$(az provider show -n Microsoft.App --query registrationState -o tsv)" != "Registered" ]]; then
  echo "✗ Microsoft.App still not Registered. Run: az provider register -n Microsoft.App --wait"; exit 1
fi

# ---- 1. resource group ----------------------------------------------------
az group create -n "$RG" -l "$LOCATION" -o none

# ---- 2. container registry + server-side image build ----------------------
az acr create -g "$RG" -n "$ACR" --sku Basic --only-show-errors -o none 2>/dev/null || true
ACR_LOGIN_SERVER="$(az acr show -n "$ACR" -g "$RG" --query loginServer -o tsv)"
echo "▸ Building image in ACR (no local Docker needed)…"
az acr build -r "$ACR" -t "hedgedesk:$IMAGE_TAG" \
  --build-arg "INSTALL_OPENBB=$INSTALL_OPENBB" \
  -f "$ROOT/deploy/Dockerfile" "$ROOT" -o none

# ---- 3. user-assigned identity + AcrPull ----------------------------------
az identity create -g "$RG" -n "$IDENTITY" -o none 2>/dev/null || true
IDENTITY_RESOURCE_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query id -o tsv)"
IDENTITY_PRINCIPAL_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query principalId -o tsv)"
ACR_ID="$(az acr show -n "$ACR" -g "$RG" --query id -o tsv)"
az role assignment create --assignee-object-id "$IDENTITY_PRINCIPAL_ID" \
  --assignee-principal-type ServicePrincipal --role AcrPull --scope "$ACR_ID" \
  -o none 2>/dev/null || true

# ---- 4. Log Analytics + Container Apps environment ------------------------
az monitor log-analytics workspace create -g "$RG" -n hedgedesk-logs --only-show-errors -o none 2>/dev/null || true
LAW_ID="$(az monitor log-analytics workspace show -g "$RG" -n hedgedesk-logs --query customerId -o tsv)"
LAW_KEY="$(az monitor log-analytics workspace get-shared-keys -g "$RG" -n hedgedesk-logs --query primarySharedKey -o tsv)"
az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION" \
  --logs-workspace-id "$LAW_ID" --logs-workspace-key "$LAW_KEY" -o none 2>/dev/null || true
ENV_RESOURCE_ID="$(az containerapp env show -g "$RG" -n "$ENV_NAME" --query id -o tsv)"

# ---- 5. persistent audit ledger (Azure Files) -----------------------------
az storage account create -g "$RG" -n "$STORAGE" -l "$LOCATION" --sku Standard_LRS \
  --only-show-errors -o none 2>/dev/null || true
STORAGE_KEY="$(az storage account keys list -g "$RG" -n "$STORAGE" --query '[0].value' -o tsv)"
az storage share-rm create --storage-account "$STORAGE" -g "$RG" -n "$SHARE" --quota 5 -o none 2>/dev/null || true
az containerapp env storage set -g "$RG" -n "$ENV_NAME" --storage-name "$ENV_STORAGE_NAME" \
  --azure-file-account-name "$STORAGE" --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$SHARE" --access-mode ReadWrite -o none

# ---- 6. render + deploy the Container App ----------------------------------
# Rendered with python3 (present in Cloud Shell) so secrets are included only
# when non-empty — Container Apps rejects empty secret values, and the key is
# optional (heuristic mode runs with no secret at all).
RENDERED="$(mktemp -t hedgedesk-app.XXXX.yaml)"
trap 'rm -f "$RENDERED"' EXIT
export IDENTITY_RESOURCE_ID ENV_RESOURCE_ID ACR_LOGIN_SERVER IMAGE_TAG ENV_STORAGE_NAME \
       HEDGEDESK_MODEL HEDGEDESK_UNIVERSE HEDGEDESK_EVERY_MIN ANTHROPIC_API_KEY OPENBB_PAT
python3 - > "$RENDERED" <<'PY'
import os
E = os.environ.get
key = (E("ANTHROPIC_API_KEY") or "").strip()
pat = (E("OPENBB_PAT") or "").strip()

secrets, envs = [], []
if key:
    secrets.append(f'      - name: anthropic-api-key\n        value: "{key}"')
    envs.append("          - name: ANTHROPIC_API_KEY\n            secretRef: anthropic-api-key")
if pat:
    secrets.append(f'      - name: openbb-pat\n        value: "{pat}"')
    envs.append("          - name: OPENBB_PAT\n            secretRef: openbb-pat")
secrets_block = ("    secrets:\n" + "\n".join(secrets)) if secrets else ""
env_secret_block = ("\n" + "\n".join(envs)) if envs else ""

print(f"""identity:
  type: UserAssigned
  userAssignedIdentities:
    {E('IDENTITY_RESOURCE_ID')}: {{}}
properties:
  managedEnvironmentId: {E('ENV_RESOURCE_ID')}
  configuration:
    activeRevisionsMode: Single
    ingress:
      external: true
      targetPort: 8080
      transport: auto
      traffic:
        - latestRevision: true
          weight: 100
    registries:
      - server: {E('ACR_LOGIN_SERVER')}
        identity: {E('IDENTITY_RESOURCE_ID')}
{secrets_block}
  template:
    scale:
      minReplicas: 1
      maxReplicas: 1
    containers:
      - name: hedgedesk
        image: {E('ACR_LOGIN_SERVER')}/hedgedesk:{E('IMAGE_TAG')}
        resources:
          cpu: 1.0
          memory: 2.0Gi
        command: ["python", "-m", "hedgedesk.main"]
        args: ["serve"]
        env:
          - name: HEDGEDESK_MODEL
            value: "{E('HEDGEDESK_MODEL')}"
          - name: HEDGEDESK_UNIVERSE
            value: "{E('HEDGEDESK_UNIVERSE')}"
          - name: HEDGEDESK_EVERY_MIN
            value: "{E('HEDGEDESK_EVERY_MIN')}"
          - name: PORT
            value: "8080"{env_secret_block}
        probes:
          - type: Liveness
            httpGet: {{ path: /health, port: 8080 }}
            initialDelaySeconds: 15
            periodSeconds: 30
          - type: Readiness
            httpGet: {{ path: /health, port: 8080 }}
            initialDelaySeconds: 5
            periodSeconds: 15
        volumeMounts:
          - volumeName: desk-runs
            mountPath: /app/runs
    volumes:
      - name: desk-runs
        storageType: AzureFile
        storageName: {E('ENV_STORAGE_NAME')}""")
PY

if az containerapp show -g "$RG" -n "$APP_NAME" -o none 2>/dev/null; then
  echo "▸ Updating existing Container App…"
  az containerapp update -g "$RG" -n "$APP_NAME" --yaml "$RENDERED" -o none
else
  echo "▸ Creating Container App…"
  az containerapp create -g "$RG" -n "$APP_NAME" --yaml "$RENDERED" -o none
fi

FQDN="$(az containerapp show -g "$RG" -n "$APP_NAME" --query properties.configuration.ingress.fqdn -o tsv)"
echo ""
echo "✅ Deployed. The desk is live at: https://$FQDN"
echo "   Health : curl https://$FQDN/health"
echo "   Status : curl https://$FQDN/status"
echo "   Verdicts: curl https://$FQDN/verdicts"
echo "   Logs   : az containerapp logs show -g $RG -n $APP_NAME --follow"
