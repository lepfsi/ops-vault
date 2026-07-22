# Install, rebuild, typecheck, commit & push OpsVault
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "==> cwd: $(Get-Location)"

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "==> enabling pnpm via corepack"
  corepack enable
  corepack prepare pnpm@10.12.4 --activate
}

Write-Host "==> pnpm install"
pnpm install

Write-Host "==> build core + db + ui"
pnpm --filter @ops-vault/core build
pnpm --filter @ops-vault/db build
pnpm --filter @ops-vault/ui build

Write-Host "==> typecheck api + web"
pnpm --filter @ops-vault/api typecheck
pnpm --filter @ops-vault/web typecheck

if (-not (git remote get-url origin 2>$null)) {
  git remote add origin https://github.com/lepfsi/ops-vault.git
}

git add -A
$pending = git status --porcelain
if ($pending) {
  git commit -m @"
feat: encrypted export/import, recovery keys, cert PEM, ui kit

- core: sealBackup/unsealBackup, parseBackupJson, recovery bundle
- core: parseCertificatePem (SHA-256 fingerprint)
- db/api: GET /vault/export, POST /vault/import, PUT /vault/recovery
- web: BackupPanel + certificate secret type
- ui: Button, Card, Badge, Input package
"@
  Write-Host "==> committed"
} else {
  Write-Host "==> nothing new to commit"
}

Write-Host "==> push origin main"
git branch -M main
git push -u origin main

Write-Host "==> done"
git rev-parse HEAD
git log -1 --oneline
