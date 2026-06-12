# push-to-github.ps1
# Run this script to push siyuan-mcp to GitHub
# Usage: Right-click -> "Run with PowerShell", or run in PowerShell terminal

Set-Location "F:\code\siyuan-mcp"

Write-Host "=== SiYuan MCP - Push to GitHub ===" -ForegroundColor Cyan

# Step 1: Clean up stale lock files
Write-Host "`n[1/5] Cleaning up stale git lock files..." -ForegroundColor Yellow
if (Test-Path ".git\index.lock") { Remove-Item ".git\index.lock" -Force; Write-Host "  Removed index.lock" }
if (Test-Path ".git\config.lock") { Remove-Item ".git\config.lock" -Force; Write-Host "  Removed config.lock" }

# Step 2: Re-initialize git (safe on existing .git dir)
Write-Host "`n[2/5] Initializing git repository..." -ForegroundColor Yellow
git init -b main
git config user.email "yi865729489@gmail.com"
git config user.name "Ezreal"

# Step 3: Stage all files
Write-Host "`n[3/5] Staging files..." -ForegroundColor Yellow
git add .
git status --short

# Step 4: Commit
Write-Host "`n[4/5] Creating initial commit..." -ForegroundColor Yellow
git commit -m "Initial commit: SiYuan MCP server"

# Step 5: Create GitHub repo and push
Write-Host "`n[5/5] Creating GitHub repo and pushing..." -ForegroundColor Yellow

# Check if gh CLI is available
if (Get-Command gh -ErrorAction SilentlyContinue) {
    Write-Host "  Using GitHub CLI (gh)..." -ForegroundColor Green
    gh repo create siyuan-mcp --public --source=. --remote=origin --push
    $repoUrl = gh repo view --json url -q ".url" 2>$null
    Write-Host "`n=== Done! ===" -ForegroundColor Green
    Write-Host "Repository URL: $repoUrl" -ForegroundColor Cyan
} else {
    Write-Host "  GitHub CLI (gh) not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Option A: Install gh CLI from https://cli.github.com, then run:" -ForegroundColor Yellow
    Write-Host "    gh repo create siyuan-mcp --public --source=. --remote=origin --push" -ForegroundColor White
    Write-Host ""
    Write-Host "  Option B: Create repo manually on GitHub, then run:" -ForegroundColor Yellow
    Write-Host "    git remote add origin https://github.com/YOUR_USERNAME/siyuan-mcp.git" -ForegroundColor White
    Write-Host "    git push -u origin main" -ForegroundColor White
}

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
