#Requires -Version 5.1
<#
.SYNOPSIS
  Cria os cron jobs do Dudit no cron-job.org via REST API.

.DESCRIPTION
  Le os segredos das variaveis de ambiente e cria os jobs que ainda nao existem.
  O job do SuperFrete (/api/cron/superfrete-reconcile) NAO esta nesta lista
  porque ja foi cadastrado manualmente.

  API key: cron-job.org > Settings > API key (https://cron-job.org/en/members/settings/)
  Endpoint: PUT https://api.cron-job.org/jobs

  Jobs marcados como Optional ficam desligados por padrao; use -IncludeOptional.

.PARAMETER DryRun
  Nao chama a API. Apenas imprime o corpo JSON de cada job.

.PARAMETER IncludeOptional
  Tambem cria os jobs opcionais (webhooks pendentes, sync-redis, moderacao).

.PARAMETER UpdateSecret
  Nao cria nada: atualiza o header Authorization dos jobs existentes com os
  valores atuais de CRON_SECRET, INTERNAL_CRON_SECRET e BACKUP_CRON_SECRET.
  A familia de cada job e decidida pela URL, entao jobs criados manualmente
  (como o do SuperFrete) tambem sao atualizados. Use apos trocar os secrets no
  ambiente do app e fazer o deploy.

.EXAMPLE
  $env:CRONJOB_API_KEY = "sua-api-key"
  $env:APP_URL = "https://dudit.com.br"
  $env:CRON_SECRET = "..."
  $env:INTERNAL_CRON_SECRET = "..."
  $env:BACKUP_CRON_SECRET = "..."
  .\scripts\setup-cron-job-org.ps1 -DryRun
  .\scripts\setup-cron-job-org.ps1

.EXAMPLE
  # Depois de rotacionar os secrets no Railway e fazer deploy:
  .\scripts\setup-cron-job-org.ps1 -UpdateSecret -DryRun
  .\scripts\setup-cron-job-org.ps1 -UpdateSecret
#>
param(
  [string]$AppUrl = $env:APP_URL,
  [switch]$DryRun,
  [switch]$IncludeOptional,
  [switch]$UpdateSecret
)

$ErrorActionPreference = "Stop"

if (-not $AppUrl) { $AppUrl = "https://dudit.com.br" }
$AppUrl = $AppUrl.TrimEnd("/")

if (-not $DryRun -and -not $env:CRONJOB_API_KEY) {
  throw "Defina `$env:CRONJOB_API_KEY (cron-job.org > Settings > API key) ou use -DryRun."
}

$secrets = @{
  CRON_SECRET          = $env:CRON_SECRET
  INTERNAL_CRON_SECRET = $env:INTERNAL_CRON_SECRET
  BACKUP_CRON_SECRET   = $env:BACKUP_CRON_SECRET
}

$apiUrl = "https://api.cron-job.org/jobs"
$apiHeaders = @{ Authorization = "Bearer $($env:CRONJOB_API_KEY)" }

function Get-MaskedToken([string]$authorization) {
  if (-not $authorization) { return "<vazio>" }
  $token = $authorization -replace "^Bearer\s+", ""
  if ($token.Length -le 14) { return "***" }
  return $token.Substring(0, 8) + "..." + $token.Substring($token.Length - 4)
}

function Resolve-SecretName([string]$url) {
  $path = ([uri]$url).AbsolutePath
  if ($path -like "/api/internal/jobs/backup-database*") { return "BACKUP_CRON_SECRET" }
  if ($path -like "/api/internal/*") { return "INTERNAL_CRON_SECRET" }
  if ($path -like "/api/cron/*" -or $path -like "/api/moderation/*") { return "CRON_SECRET" }
  return $null
}

if ($UpdateSecret) {
  if (-not $env:CRONJOB_API_KEY) {
    throw "Defina `$env:CRONJOB_API_KEY para listar/atualizar os jobs."
  }

  $existingJobs = @((Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $apiHeaders -UseBasicParsing).jobs)
  if ($existingJobs.Count -eq 0) {
    Write-Host "Nenhum job encontrado na conta." -ForegroundColor Yellow
    exit 0
  }

  Write-Host "Jobs na conta: $($existingJobs.Count)" -ForegroundColor DarkGray
  $updated = 0
  $skipped = 0
  $failed = 0

  $first = $true
  foreach ($job in $existingJobs | Sort-Object jobId) {
    # API permite 5 req/s: espaca tambem as leituras dos jobs que serao pulados.
    if (-not $first) { Start-Sleep -Milliseconds 500 }
    $first = $false

    $secretName = Resolve-SecretName $job.url
    $newSecret = if ($secretName) { $secrets[$secretName] } else { $null }

    if (-not $secretName) {
      Write-Host "SKIP (url desconhecida) $($job.jobId) $($job.url)" -ForegroundColor DarkGray
      $skipped++
      continue
    }
    if (-not $newSecret) {
      Write-Warning "Pulando $($job.jobId): `$env:$secretName nao definido."
      $skipped++
      continue
    }

    $details = (Invoke-RestMethod -Uri "$apiUrl/$($job.jobId)" -Method Get -Headers $apiHeaders -UseBasicParsing).jobDetails
    $currentHeader = [string]$details.extendedData.headers.Authorization
    $newHeader = "Bearer $newSecret"

    if ($currentHeader -ceq $newHeader) {
      Write-Host "OK (ja atualizado) $($job.jobId) | $secretName | $(Get-MaskedToken $newHeader)" -ForegroundColor DarkGray
      $skipped++
      continue
    }

    if ($DryRun) {
      Write-Host "WOULD PATCH $($job.jobId) | $secretName | $(Get-MaskedToken $currentHeader) -> $(Get-MaskedToken $newHeader) | $($job.url)" -ForegroundColor Cyan
      continue
    }

    try {
      $payload = @{
        job = @{
          extendedData = @{
            headers = @{ Authorization = $newHeader }
          }
        }
      } | ConvertTo-Json -Depth 6 -Compress

      Invoke-RestMethod -Uri "$apiUrl/$($job.jobId)" -Method Patch -Headers $apiHeaders `
        -ContentType "application/json" -Body $payload -UseBasicParsing | Out-Null

      $check = (Invoke-RestMethod -Uri "$apiUrl/$($job.jobId)" -Method Get -Headers $apiHeaders -UseBasicParsing).jobDetails
      if ([string]$check.extendedData.headers.Authorization -cne $newHeader) {
        throw "header nao confere depois do PATCH"
      }

      Write-Host "OK   $($job.jobId) | $secretName | $(Get-MaskedToken $newHeader) | $($job.url)" -ForegroundColor Green
      $updated++
    } catch {
      Write-Host "FAIL $($job.jobId): $($_.Exception.Message)" -ForegroundColor Red
      $failed++
    }
  }

  if ($DryRun) {
    Write-Host "`nDry run: nada foi alterado." -ForegroundColor Yellow
  } else {
    Write-Host "`nAtualizados: $updated | Ja estavam ok: $skipped | Falharam: $failed" -ForegroundColor Green
  }
  exit 0
}

$every10 = @(0, 10, 20, 30, 40, 50)
$every15 = @(0, 15, 30, 45)
$every30 = @(0, 30)
$hourly  = @(0)

# requestMethod: 0 = GET, 1 = POST
$jobs = @(
  @{ Title = "Dudit - Expirar pedidos"
     Path  = "/api/cron/expire-orders"
     Method = 0; Minutes = $every10; Hours = @(-1); SecretName = "CRON_SECRET"
     Note  = "Libera estoque/pedidos vencidos (so Mercado Pago)." }

  @{ Title = "Dudit - Lembretes e notificacoes"
     Path  = "/api/cron/notification-reminders"
     Method = 0; Minutes = @(0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55); Hours = @(-1); SecretName = "CRON_SECRET"
     Note  = "Envia notificacoes agendadas (lote 100)." }

  @{ Title = "Dudit - Carrinho abandonado"
     Path  = "/api/cron/cart-abandonment-sweep"
     Method = 0; Minutes = $every30; Hours = @(-1); SecretName = "CRON_SECRET"
     Note  = "Detecta carrinho parado ha 4h e cria notificacao." }

  @{ Title = "Dudit - Assinaturas recorrentes"
     Path  = "/api/cron/recurring-subscriptions"
     Method = 0; Minutes = $hourly; Hours = @(-1); SecretName = "CRON_SECRET"
     Note  = "Cobra execucoes vencidas + congela janelas de mudanca de preco." }

  @{ Title = "Dudit - Conciliar assinaturas (MP)"
     Path  = "/api/cron/reconcile-subscriptions"
     Method = 0; Minutes = @(0); Hours = @(6); SecretName = "CRON_SECRET"
     Note  = "Diario 06:00 UTC (03:00 BRT): relê status no Mercado Pago." }

  @{ Title = "Dudit - Backup do banco"
     Path  = "/api/internal/jobs/backup-database"
     Method = 1; Minutes = @(30); Hours = @(6); SecretName = "BACKUP_CRON_SECRET"
     Note  = "Diario 06:30 UTC (03:30 BRT). Requer R2 + BACKUP_ENCRYPTION_KEY_BASE64." }

  # ---- Opcionais (so com -IncludeOptional) ----
  @{ Title = "Dudit - Outbox de webhooks"
     Path  = "/api/internal/jobs/process-pending-webhooks"
     Method = 1; Minutes = @(0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55); Hours = @(-1); SecretName = "INTERNAL_CRON_SECRET"
     Optional = $true; Note = "So se usar Mercado Pago com outbox de webhook." }

  @{ Title = "Dudit - Sync busca (Redis/FTS)"
     Path  = "/api/cron/sync-redis"
     Method = 0; Minutes = @(0); Hours = @(7); SecretName = "CRON_SECRET"
     Optional = $true; Note = "Quase no-op hoje; util se voce esquecer de rodar manual." }

  @{ Title = "Dudit - Moderacao"
     Path  = "/api/moderation/process"
     Method = 1; Minutes = $every10; Hours = @(-1); SecretName = "CRON_SECRET"
     Optional = $true; Note = "So se usar a fila de moderacao." }
)

$created = 0
$failed = 0
$skipped = 0

# Evita duplicar jobs se o script for executado mais de uma vez.
$existingTitles = @{}
if (-not $DryRun) {
  try {
    $existing = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers $apiHeaders -UseBasicParsing
    foreach ($j in @($existing.jobs)) {
      if ($j.title) { $existingTitles[$j.title] = $j.jobId }
    }
    Write-Host "Jobs ja existentes na conta: $($existingTitles.Count)" -ForegroundColor DarkGray
  } catch {
    throw "Falha ao autenticar na API do cron-job.org (API key invalida, expirada ou restrita por IP?): $($_.Exception.Message)"
  }
}

foreach ($job in $jobs) {
  if ($job.Optional -and -not $IncludeOptional) {
    Write-Host "SKIP (opcional) $($job.Title)" -ForegroundColor DarkGray
    continue
  }

  $secret = $secrets[$job.SecretName]
  if (-not $secret) {
    Write-Warning "Pulando '$($job.Title)': `$env:$($job.SecretName) nao definido."
    continue
  }

  if ($existingTitles.ContainsKey($job.Title)) {
    Write-Host "SKIP (ja existe) $($job.Title) -> jobId $($existingTitles[$job.Title])" -ForegroundColor DarkGray
    $skipped++
    continue
  }

  $payload = @{
    job = @{
      url            = "$AppUrl$($job.Path)"
      enabled        = $true
      title          = $job.Title
      saveResponses  = $true
      requestMethod  = $job.Method
      requestTimeout = 30
      schedule       = @{
        timezone  = "UTC"
        expiresAt = 0
        hours     = $job.Hours
        mdays     = @(-1)
        minutes   = $job.Minutes
        months    = @(-1)
        wdays     = @(-1)
      }
      extendedData   = @{
        headers = @{ Authorization = "Bearer $secret" }
        body    = ""
      }
      # onSuccess = "voltou a funcionar depois de uma falha", nao um e-mail por
      # execucao bem-sucedida (ver JobNotificationSettings na API).
      notification   = @{
        onFailure      = $true
        onFailureCount = 1
        onSuccess      = $true
        onDisable      = $true
      }
    }
  } | ConvertTo-Json -Depth 10 -Compress

  if ($DryRun) {
    Write-Host "`n### $($job.Title)  [$(if ($job.Method -eq 0) { 'GET' } else { 'POST' })]" -ForegroundColor Cyan
    Write-Host $payload
    continue
  }

  try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Put -Headers $apiHeaders `
      -ContentType "application/json" -Body $payload -UseBasicParsing

    if (-not $response.jobId) {
      throw "resposta sem jobId: $($response | ConvertTo-Json -Compress)"
    }

    Write-Host "OK   $($job.Title) -> jobId $($response.jobId)" -ForegroundColor Green
    $created++
  } catch {
    $detail = $_.Exception.Message
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $detail = $detail + " | " + $reader.ReadToEnd()
      }
    } catch { }
    Write-Host "FAIL $($job.Title): $detail" -ForegroundColor Red
    $failed++
  }

  # API limita a criacao a 1 req/s e 5 req/min. 13 s entre criacoes garante as
  # duas coisas numa janela movel de 60 s (5 requests no maximo).
  Start-Sleep -Seconds 13
}

if (-not $DryRun) {
  Write-Host "`nCriados: $created | Ja existiam: $skipped | Falharam: $failed" -ForegroundColor Green
  Write-Host "Confira em https://cron-job.org/en/members/jobs/"
  Write-Host "Rode 'TEST RUN' em cada um e verifique o History (esperado: HTTP 200)."
}
