# Read recent chrysty-voice Cloud Run logs (project chrysty)
# Usage:
#   .\scripts\read-chrysty-voice-logs.ps1
#   .\scripts\read-chrysty-voice-logs.ps1 -Filter "APIError"
#   .\scripts\read-chrysty-voice-logs.ps1 -Filter "session-context" -Freshness "2h"

param(
    [string]$Filter = "",
    [string]$Freshness = "1h",
    [int]$Limit = 50
)

$ErrorActionPreference = "Stop"
$GCloud = "C:\Users\nchri\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
$Project = "chrysty"
$Service = "chrysty-voice"

$query = "resource.type=cloud_run_revision AND resource.labels.service_name=$Service"
if ($Filter.Trim()) {
    $query += " AND textPayload:$Filter"
}

& $GCloud logging read $query `
    --project=$Project `
    --limit=$Limit `
    --freshness=$Freshness `
    --format="table(timestamp,textPayload)"
