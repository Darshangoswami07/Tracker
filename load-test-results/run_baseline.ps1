# DeliveryHub Baseline Load Test Runner
# =====================================
# Runs progressive concurrency tests against the production API.
# MEASUREMENT ONLY — no application changes.
#
# Usage:
#   .\run_baseline.ps1

$ErrorActionPreference = "Stop"
$resultsDir = "D:\Tracker\load-test-results"
$resultsFile = "$resultsDir\baseline_full_results.txt"
$scriptPath = "D:\Tracker\load-test-results\baseline.py"

# Ensure results directory exists
New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null

# Clear previous results
"" | Set-Content $resultsFile

function Run-LocustTest {
    param(
        [int]$Users,
        [int]$SpawnRate,
        [string]$Duration
    )
    $testName = "u${Users}_r${SpawnRate}_${Duration}"
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  CONCURRENCY: $Users users, spawn=$SpawnRate, duration=$Duration" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    $output = & locust -f $scriptPath --headless `
        -u $Users -r $SpawnRate --run-time $Duration `
        --host https://tracker-m0id.onrender.com `
        --csv "$resultsDir\baseline_$testName" `
        2>&1 | Out-String

    # Extract key metrics from locust output
    Write-Host $output

    # Append to consolidated results
    "`n`n===== $testName =====" | Add-Content $resultsFile
    $output | Add-Content $resultsFile

    # Brief cooldown between tests to let the server recover
    Write-Host "`nCooldown 15s..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
}

# ============================================================
# Test 1: /health — progressively higher concurrency
# ============================================================
Write-Host "`n`n### PHASE 1: /health endpoint (no auth, no DB, rate-limit whitelisted) ###" -ForegroundColor Green

Run-LocustTest -Users 10 -SpawnRate 10 -Duration "30s"
Run-LocustTest -Users 25 -SpawnRate 25 -Duration "30s"
Run-LocustTest -Users 50 -SpawnRate 50 -Duration "30s"
Run-LocustTest -Users 100 -SpawnRate 100 -Duration "30s"
Run-LocustTest -Users 200 -SpawnRate 200 -Duration "30s"
Run-LocustTest -Users 500 -SpawnRate 500 -Duration "30s"
Run-LocustTest -Users 1000 -SpawnRate 500 -Duration "30s"

# ============================================================
# Test 2: Mixed endpoints — conservative concurrency
# ============================================================
Write-Host "`n`n### PHASE 2: Mixed endpoints (auth + unauth) ###" -ForegroundColor Green

Run-LocustTest -Users 10 -SpawnRate 10 -Duration "45s"
Run-LocustTest -Users 25 -SpawnRate 25 -Duration "45s"
Run-LocustTest -Users 50 -SpawnRate 50 -Duration "45s"
Run-LocustTest -Users 100 -SpawnRate 50 -Duration "45s"
Run-LocustTest -Users 200 -SpawnRate 100 -Duration "45s"
Run-LocustTest -Users 500 -SpawnRate 200 -Duration "45s"

Write-Host "`n`n========================================" -ForegroundColor Green
Write-Host "  ALL TESTS COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Results saved to: $resultsFile"
