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

: "${ANTHROPIC_API_KEY:?export ANTHROPIC_API_KEY before deploying}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

echo "▸ Subscription: $(az account show --query name -o tsv)"
echo "▸ RG=$RG  LOCATION=$LOCATION  ACR=$ACR  APP=$APP_NAME  TAG=$IMAGE_TAG"

az extension add --name containerapp --upgrade --only-show-errors -y >/dev/null 2>&1 || true
az provider register -n Microsoft.App --wait >/dev/null 2>&1 || true
az provider register -n Microsoft.OperationalInsights --wait >/dev/null 2>&1 || true

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
# Rendered with a bash heredoc (portable; no envsubst/gettext dependency).
RENDERED="$(mktemp -t hedgedesk-app.XXXX.yaml)"
trap 'rm -f "$RENDERED"' EXIT
cat > "$RENDERED" <<EOF
identity:
  type: UserAssigned
  userAssignedIdentities:
    ${IDENTITY_RESOURCE_ID}: {}
properties:
  managedEnvironmentId: ${ENV_RESOURCE_ID}
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
      - server: ${ACR_LOGIN_SERVER}
        identity: ${IDENTITY_RESOURCE_ID}
    secrets:
      - name: anthropic-api-key
        value: "${ANTHROPIC_API_KEY}"
      - name: openbb-pat
        value: "${OPENBB_PAT}"
  template:
    scale:
      minReplicas: 1
      maxReplicas: 1
    containers:
      - name: hedgedesk
        image: ${ACR_LOGIN_SERVER}/hedgedesk:${IMAGE_TAG}
        resources:
          cpu: 1.0
          memory: 2.0Gi
        command: ["python", "-m", "hedgedesk.main"]
        args: ["serve"]
        env:
          - name: ANTHROPIC_API_KEY
            secretRef: anthropic-api-key
          - name: OPENBB_PAT
            secretRef: openbb-pat
          - name: HEDGEDESK_MODEL
            value: "${HEDGEDESK_MODEL}"
          - name: HEDGEDESK_UNIVERSE
            value: "${HEDGEDESK_UNIVERSE}"
          - name: HEDGEDESK_EVERY_MIN
            value: "${HEDGEDESK_EVERY_MIN}"
          - name: PORT
            value: "8080"
        probes:
          - type: Liveness
            httpGet: { path: /health, port: 8080 }
            initialDelaySeconds: 15
            periodSeconds: 30
          - type: Readiness
            httpGet: { path: /health, port: 8080 }
            initialDelaySeconds: 5
            periodSeconds: 15
        volumeMounts:
          - volumeName: desk-runs
            mountPath: /app/runs
    volumes:
      - name: desk-runs
        storageType: AzureFile
        storageName: ${ENV_STORAGE_NAME}
EOF

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
