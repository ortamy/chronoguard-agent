# ChronoGuard — reproducible demo (real sprite, no mocks)
# Usage: pwsh -File .\scripts\demo.ps1 [-Base http://127.0.0.1:8090]
param(
    [string]$Base = "http://127.0.0.1:8090"
)

$ErrorActionPreference = "Stop"
$script:failures = 0

function Step($n, $title) { Write-Host "`n[$n] $title" -ForegroundColor Cyan }
function Pass($msg) { Write-Host "    PASS  $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "    FAIL  $msg" -ForegroundColor Red; $script:failures++ }
function Info($msg) { Write-Host "    $msg" -ForegroundColor DarkGray }

function PostJson($path, $body) {
    Invoke-RestMethod -Uri "$Base$path" -Method Post -ContentType "application/json" `
        -Body ($body | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 90
}

$t0 = Get-Date

Step 1 "Health"
try {
    $h = Invoke-RestMethod -Uri "$Base/api/health" -TimeoutSec 10
    Pass "healthy, uptime $([math]::Round($h.uptime_sec))s, $($h.checkpoints) checkpoints"
} catch { Fail "health unreachable: $($_.Exception.Message)"; exit 1 }

Step 2 "Real Sprites Connector request (Fly Machines)"
try {
    $c = Invoke-RestMethod -Uri "$Base/api/connectors" -TimeoutSec 30
    $conn = $c.connections | Where-Object { $_.provider -eq "custom_api" } | Select-Object -First 1
    if (-not $conn) { throw "no custom_api connector configured" }
    Info "connector $($conn.id) - $($conn.display_name) - policy $($conn.access_policy | ConvertTo-Json -Compress)"
    $t = PostJson "/api/connectors/test" @{ provider = "custom_api"; path = "/v1/apps?org_slug=artem-909" }
    if ($t.ok) {
        Pass "HTTP $($t.status) - total_apps=$($t.data.total_apps) - app=$($t.data.apps[0].name)"
    } else { Fail "connector call failed: $($t.error)" }
    try {
        $blocked = PostJson "/api/connectors/test" @{ provider = "custom_api"; path = "/v1/volumes?org_slug=artem-909" }
        if ($blocked.status -eq 403) { Pass "endpoint allow-list enforced (403 on /v1/volumes)" }
        else { Fail "expected 403 for a non-allowlisted endpoint, got $($blocked.status)" }
    } catch {
        $err = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($err.status -eq 403) { Pass "endpoint allow-list enforced (gateway 403 on /v1/volumes)" }
        else { Fail "unexpected connector error: $($_.Exception.Message)" }
    }
} catch { Fail "connector step: $($_.Exception.Message)" }

Step 3 "Create a native checkpoint"
$cp = $null
try {
    $cp = PostJson "/api/action/checkpoint" @{ comment = "demo baseline $(Get-Date -Format o)" }
    if ($cp.ok) { Pass "checkpoint $($cp.checkpoint) created" } else { Fail "checkpoint failed: $($cp.error)" }
} catch { Fail "checkpoint: $($_.Exception.Message)" }
if (-not $cp -or -not $cp.ok) { exit 1 }

Step 4 "Dangerous operation must be blocked"
$incident = $null
$payload = $null
try {
    $payload = Invoke-RestMethod -Uri "$Base/api/action/propose" -Method Post -ContentType "application/json" `
        -Body (@{ tool = "delete_path"; args = @{ path = "/home/sprite/agent"; recursive = $true }; actor = "agent" } |
               ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 30
} catch {
    $payload = $_.ErrorDetails.Message | ConvertFrom-Json
}
if ($payload -and $payload.decision -eq "BLOCK" -and $payload.blocked) {
    $incident = $payload.event
    Pass "BLOCK - risk $($payload.risk.score)/100 - event $($incident.id)"
} else { Fail "dangerous delete was NOT blocked" }

Step 5 "Deferred operation requires a human"
$deferred = $null
try {
    $deferred = Invoke-RestMethod -Uri "$Base/api/action/propose" -Method Post -ContentType "application/json" `
        -Body (@{ tool = "run_command"; args = @{ command = "nmap -sV 127.0.0.1" }; actor = "agent" } |
               ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 30
} catch {
    $deferred = $_.ErrorDetails.Message | ConvertFrom-Json
}
if ($deferred -and $deferred.decision -eq "DEFER" -and $deferred.pending) { Pass "DEFER - awaiting approval" }
else { Fail "unknown command was not deferred" }

Step 6 "Native Sprite restore"
try {
    $rb = PostJson "/api/action/rollback" @{ checkpoint = $cp.checkpoint }
    Pass "restore initiated: $($cp.checkpoint) (environment restarts)"
} catch { Info "response dropped during restart (expected)" }

$deadline = (Get-Date).AddSeconds(120); $alive = $false; $wait = 0
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3; $wait += 3
    try { if ((Invoke-RestMethod -Uri "$Base/api/health" -TimeoutSec 4).ok) { $alive = $true; break } } catch {}
}
if ($alive) { Pass "API healthy again after ${wait}s" } else { Fail "API did not return within 120s"; exit 1 }

Step 7 "Integrity verification"
Start-Sleep -Seconds 2
try {
    $v = PostJson "/api/action/verify" @{ checkpoint = $cp.checkpoint }
    $okCount = @($v.checks | Where-Object { $_.ok }).Count
    if ($v.verified) { Pass "verification $okCount/$($v.checks.Count) checks passed" }
    else { Fail "verification failed: $($v.checks | ConvertTo-Json -Compress)" }
} catch { Fail "verify: $($_.Exception.Message)" }

Step 8 "Persistent incident history"
try {
    $ev = Invoke-RestMethod -Uri "$Base/api/events?limit=300" -TimeoutSec 20
    $ids = @($ev.events | ForEach-Object { $_.id })
    $markers = @($ev.events | Where-Object { $_.action -eq "audit_context_restored" })
    if ($incident -and ($ids -contains $incident.id)) { Pass "incident $($incident.id) survived the restore" }
    else { Fail "incident was lost by the restore" }
    if ($markers.Count -gt 0) { Pass "audit auto-import marker present (mode=$($markers[0].mode), imported=$($markers[0].imported))" }
    else { Fail "no audit_context_restored marker" }
} catch { Fail "events: $($_.Exception.Message)" }

$elapsed = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
Write-Host "`nDemo finished in ${elapsed}s with $script:failures failure(s)." -ForegroundColor $(if ($script:failures -eq 0) { "Green" } else { "Red" })
exit $(if ($script:failures -eq 0) { 0 } else { 1 })
