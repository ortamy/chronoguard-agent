# ChronoGuard — lifecycle demo: disposable damage -> native restore -> integrity proof
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\demo-lifecycle.ps1
param([string]$Base = "http://127.0.0.1:8090", [string]$Sprite = "chronoguard-dev")

$ErrorActionPreference = "Stop"
$script:failures = 0
$spriteExe = "C:\Users\DELL\AppData\Local\Programs\Sprite\sprite.exe"
$Dir = "/home/sprite/workspace/disposable"

function Step($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Pass($m) { Write-Host "    PASS  $m" -ForegroundColor Green }
function Fail($m) { Write-Host "    FAIL  $m" -ForegroundColor Red; $script:failures++ }
function Info($m) { Write-Host "    $m" -ForegroundColor DarkGray }
function PostJson($p, $b) { Invoke-RestMethod -Uri "$Base$p" -Method Post -ContentType "application/json" -Body ($b | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 120 }

Step 1 "Write disposable files"
& $spriteExe exec --no-stdin -s $Sprite -- bash -c "mkdir -p $Dir; printf 'alpha-content\n' > $Dir/a.txt; printf 'beta-content\n' > $Dir/b.txt; printf 'gamma-content\n' > $Dir/c.txt" | Out-Null
$hashCmd = "sha256sum $Dir/a.txt $Dir/b.txt $Dir/c.txt"
$before = ((& $spriteExe exec --no-stdin -s $Sprite -- bash -c $hashCmd 2>&1) -join "`n").Trim()
if ($before -match "a\.txt") { Pass "3 files created and hashed" } else { Fail "could not hash files" }
Info ($before -replace "`n", " | ")

Step 2 "Create native checkpoint AFTER the files exist"
$cp = PostJson "/api/action/checkpoint" @{ comment = "lifecycle demo baseline" }
if ($cp.ok) { Pass "checkpoint $($cp.checkpoint)" } else { Fail "checkpoint failed"; exit 1 }

Step 3 "Record an incident after the checkpoint"
$incident = $null
try {
    Invoke-RestMethod -Uri "$Base/api/action/propose" -Method Post -ContentType "application/json" `
        -Body (@{ tool = "delete_path"; args = @{ path = "/home/sprite/agent"; recursive = $true }; actor = "agent" } |
               ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 30 | Out-Null
    Fail "dangerous delete was not blocked"
} catch {
    $p = $_.ErrorDetails.Message | ConvertFrom-Json
    $incident = $p.event
    if ($p.decision -eq "BLOCK") { Pass "incident $($incident.id) recorded (BLOCK)" } else { Fail "unexpected decision" }
}

Step 4 "Damage the disposable workspace"
& $spriteExe exec --no-stdin -s $Sprite -- bash -c "printf 'corrupted\n' > $Dir/a.txt; rm -f $Dir/b.txt; printf 'rogue\n' > $Dir/rogue.txt" | Out-Null
$damaged = ((& $spriteExe exec --no-stdin -s $Sprite -- bash -c "ls $Dir" 2>&1) -join " ").Trim()
Pass "damaged: $damaged"
if ($damaged -match "rogue\.txt") { Pass "rogue file present" } else { Fail "damage not applied" }

Step 5 "Native Sprite rollback"
try { PostJson "/api/action/rollback" @{ checkpoint = $cp.checkpoint } | Out-Null; Pass "restore initiated" }
catch { Info "response dropped during restart (expected)" }

$deadline = (Get-Date).AddSeconds(120); $alive = $false; $wait = 0
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3; $wait += 3
    try { if ((Invoke-RestMethod -Uri "$Base/api/health" -TimeoutSec 4).ok) { $alive = $true; break } } catch {}
}
if ($alive) { Pass "service healthy again after ${wait}s" } else { Fail "service did not return"; exit 1 }
Start-Sleep -Seconds 2

Step 6 "Integrity verification (hashes + rogue file)"
$after = ((& $spriteExe exec --no-stdin -s $Sprite -- bash -c $hashCmd 2>&1) -join "`n").Trim()
$listing = ((& $spriteExe exec --no-stdin -s $Sprite -- bash -c "ls $Dir" 2>&1) -join " ").Trim()
if ($before -eq $after) { Pass "all file hashes identical to pre-damage state" } else { Fail "hash mismatch"; Info $after }
if ($listing -match "rogue") { Fail "rogue file survived the restore" } else { Pass "rogue file removed by restore" }
if ($listing -match "b\.txt") { Pass "deleted file restored" } else { Fail "b.txt missing after restore" }
$v = PostJson "/api/action/verify" @{ checkpoint = $cp.checkpoint }
if ($v.verified) { Pass "verification $((@($v.checks | Where-Object { $_.ok })).Count)/$($v.checks.Count) checks passed" } else { Fail "verification failed" }

Step 7 "Audit history survived"
$ev = Invoke-RestMethod -Uri "$Base/api/events?limit=300" -TimeoutSec 20
$ids = @($ev.events | ForEach-Object { $_.id })
if ($incident -and ($ids -contains $incident.id)) { Pass "incident $($incident.id) still in journal" } else { Fail "incident lost" }
$markers = @($ev.events | Where-Object { $_.action -eq "audit_context_restored" })
if ($markers.Count -gt 0) { Pass "automatic audit import marker (mode=$($markers[0].mode), imported=$($markers[0].imported))" } else { Fail "no audit marker" }

Write-Host "`nLifecycle demo finished with $script:failures failure(s)." -ForegroundColor $(if ($script:failures -eq 0) { "Green" } else { "Red" })
exit $(if ($script:failures -eq 0) { 0 } else { 1 })
