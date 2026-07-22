# Bootstrap: install, build core, typecheck api/web, commit & push to origin main
# Run: powershell -ExecutionPolicy Bypass -File scripts/bootstrap-and-push.ps1
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

Write-Host "==> build @ops-vault/core"
pnpm --filter @ops-vault/core build

Write-Host "==> typecheck api"
pnpm --filter @ops-vault/api typecheck

Write-Host "==> typecheck web"
pnpm --filter @ops-vault/web typecheck

Write-Host "==> git status"
git status

if (-not (git remote get-url origin 2>$null)) {
  git remote add origin https://github.com/lepfsi/ops-vault.git
}

git add -A
$pending = git status --porcelain
if ($pending) {
  git commit -m "feat: crypto core (Argon2id + AES-GCM) + scaffold web/api

- @ops-vault/core: deriveMasterKey, encrypt, decrypt, generateSalt
- apps/web: Vite + React + Tailwind unlock demo
- apps/api: Hono ciphertext-only REST store"
  Write-Host "==> committed"
} else {
  Write-Host "==> nothing new to commit"
}

Write-Host "==> push origin main"
git branch -M main
git push -u origin main

Write-Host "==> done"
git rev-parse HEAD
git remote get-url origin
git log -1 --oneline
