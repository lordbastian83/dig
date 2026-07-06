// Declarative IaC alternative to deploy.sh.
//   az deployment group create -g hedgedesk-rg -f deploy/azure/main.bicep \
//     -p anthropicApiKey=$ANTHROPIC_API_KEY imageTag=$(git rev-parse --short HEAD)
// Assumes the image has already been pushed to the ACR (az acr build, or CI).
@description('Location for all resources')
param location string = resourceGroup().location
param namePrefix string = 'hedgedesk'
@secure()
param anthropicApiKey string
@secure()
param openbbPat string = ''
param model string = 'claude-fable-5'
param universe string = 'AAPL,MSFT,NVDA,BTC_USDT,ETH_USDT'
param everyMin string = '240'
param imageTag string = 'latest'

var acrName = toLower('${namePrefix}${uniqueString(resourceGroup().id)}')
var storageName = toLower('${namePrefix}${uniqueString(resourceGroup().id, 'stor')}')

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-id'
  location: location
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

// Grant the app's identity pull rights on the registry.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, 'AcrPull')
  scope: acr
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    // AcrPull built-in role id
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource law 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: 'desk-runs'
  properties: { shareQuota: 5 }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
  }
}

resource envStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: env
  name: 'desk-runs'
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: share.name
      accessMode: 'ReadWrite'
    }
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: namePrefix
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        traffic: [ { latestRevision: true, weight: 100 } ]
      }
      registries: [ { server: acr.properties.loginServer, identity: identity.id } ]
      secrets: [
        { name: 'anthropic-api-key', value: anthropicApiKey }
        { name: 'openbb-pat', value: openbbPat }
      ]
    }
    template: {
      scale: { minReplicas: 1, maxReplicas: 1 }
      volumes: [ { name: 'desk-runs', storageType: 'AzureFile', storageName: 'desk-runs' } ]
      containers: [
        {
          name: 'hedgedesk'
          image: '${acr.properties.loginServer}/hedgedesk:${imageTag}'
          resources: { cpu: json('1.0'), memory: '2.0Gi' }
          command: [ 'python', '-m', 'hedgedesk.main' ]
          args: [ 'serve' ]
          env: [
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'OPENBB_PAT', secretRef: 'openbb-pat' }
            { name: 'HEDGEDESK_MODEL', value: model }
            { name: 'HEDGEDESK_UNIVERSE', value: universe }
            { name: 'HEDGEDESK_EVERY_MIN', value: everyMin }
            { name: 'PORT', value: '8080' }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 15, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 5, periodSeconds: 15 }
          ]
          volumeMounts: [ { volumeName: 'desk-runs', mountPath: '/app/runs' } ]
        }
      ]
    }
  }
  dependsOn: [ acrPull, envStorage ]
}

output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output acrLoginServer string = acr.properties.loginServer
