# Vercel production env for Gemini Live (chrysty.chrysty.dev)
# Run from repo root after: npx vercel link
# LIVE_SECRET: from chrysty-voice/app/.live-internal-secret or GCP Secret Manager

param(
    [switch]$FromGcp
)

$ErrorActionPreference = "Stop"
$LiveWsUrl = "wss://chrysty-voice-591471981377.us-central1.run.app"
$GCloud = "C:\Users\nchri\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$SecretFile = "..\chrysty-voice\app\.live-internal-secret"

if ($FromGcp) {
    $LiveSecret = (& $GCloud secrets versions access latest --secret=chrysty-voice-live-internal-secret --project=chrysty).Trim()
    if (-not $LiveSecret) { throw "Could not read chrysty-voice-live-internal-secret from GCP." }
    Set-Content -Path $SecretFile -Value $LiveSecret -NoNewline
    Write-Host "Synced local secret file from GCP Secret Manager."
} elseif (Test-Path $SecretFile) {
    $LiveSecret = (Get-Content $SecretFile -Raw).Trim()
} else {
    throw "Missing $SecretFile - run chrysty-voice deploy script first or pass -FromGcp."
}

function Set-VercelEnv([string]$Name, [string]$Value) {
    $Value | npx vercel env add $Name production --force
    if ($LASTEXITCODE -ne 0) { throw "vercel env add failed for $Name" }
}

Set-VercelEnv "NEXT_PUBLIC_LIVE_WS_URL" $LiveWsUrl
Set-VercelEnv "LIVE_SERVICE_INTERNAL_SECRET" $LiveSecret
Set-VercelEnv "GEMINI_TTS_VOICE" "Aoede"

Write-Host "Vercel production env updated. Redeploy chrysty on Vercel before testing Live."
