Set-Location "F:\code\siyuan-mcp"

# 删锁文件
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue
Remove-Item -Force ".git\config.lock" -ErrorAction SilentlyContinue

# 配置 git
git config user.email "yi865729489@gmail.com"
git config user.name "Ezreal"

# 确保在 main 分支
git checkout -b main 2>$null
if ($LASTEXITCODE -ne 0) { git checkout main }

# 提交
git add .
git commit -m "feat: initial release of siyuan-mcp v1.0.0"

# 创建 GitHub 仓库并推送
gh repo create siyuan-mcp --public --source=. --remote=origin --push

Write-Host "`n✅ 推送完成！" -ForegroundColor Green
Read-Host "按回车关闭"
