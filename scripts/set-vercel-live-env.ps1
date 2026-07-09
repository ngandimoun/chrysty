# Vercel production env for Gemini Live (chrysty.chrysty.dev)
# Run from repo root after: npx vercel link
# LIVE_SECRET: copy from chrysty-voice/app/.live-internal-secret (do not commit)

$LiveWsUrl = "wss://chrysty-voice-591471981377.us-central1.run.app"
$SecretFile = "..\chrysty-voice\app\.live-internal-secret"

if (-not (Test-Path $SecretFile)) {
    throw "Missing $SecretFile — run chrysty-voice deploy script first."
}

$LiveSecret = (Get-Content $SecretFile -Raw).Trim()

function Set-VercelEnv([string]$Name, [string]$Value) {
    $Value | npx vercel env add $Name production --force
    if ($LASTEXITCODE -ne 0) { throw "vercel env add failed for $Name" }
}

Set-VercelEnv "NEXT_PUBLIC_LIVE_WS_URL" $LiveWsUrl
Set-VercelEnv "LIVE_SERVICE_INTERNAL_SECRET" $LiveSecret
Set-VercelEnv "NEXT_PUBLIC_GEMINI_LIVE_ENABLED" "false"
Set-VercelEnv "GEMINI_TTS_VOICE" "Aoede"

Write-Host "Vercel production env updated. Redeploy chrysty on Vercel, then smoke test before enabling Live."
