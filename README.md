# OpsVault

Coffre-fort de secrets pensé pour les équipes techniques.

Fait partie de la suite produit **DailyOps** (séparé d’OpsGate mais même écosystème).

## Philosophie

- Zero-knowledge (chiffrement côté client)
- Pensé par un administrateur système
- Support natif : mots de passe, clés SSH, certificats, clés API, OTP, snippets, notes sécurisées
- Local-first + self-hosted

## Stack

- Monorepo : pnpm + Turborepo
- Frontend : Vite + React + TypeScript + Tailwind
- Backend : Hono + TypeScript
- Core : `@noble/ciphers` + Argon2id + `otpauth`
- DB : SQLite via `node:sqlite` (Node ≥ 22)

## Structure

```
ops-vault/
├── apps/
│   ├── web/          # Frontend Vite + React
│   └── api/          # Backend Hono
├── packages/
│   ├── core/         # Crypto, OTP, vault auth, types
│   ├── db/           # SQLite VaultStore
│   ├── ui/           # Composants UI partagés
│   └── config/       # Config partagée
```

## Développement

Prérequis : **Node.js ≥ 22**, pnpm 10.

```bash
pnpm install
pnpm --filter @ops-vault/core build
pnpm --filter @ops-vault/db build
pnpm dev
```

- **Web** : http://localhost:5173  
- **API** : http://localhost:8787  
- **SQLite** : `./data/ops-vault.db` (configurable via `OPS_VAULT_DATA`)

## Auth vault (zero-knowledge)

1. **Setup** (client) : `createVaultAuth(password)` → salt + clé + vérificateur chiffré  
2. **API** stocke uniquement `{ salt, verifier }` — jamais le mot de passe  
3. **Unlock** (client) : `unlockVault(password, salt, verifier)` → dérive la clé et valide le vérificateur  

## Secrets

- Payloads chiffrés avec `encryptPayload` / `decryptPayload`  
- Types : password, otp, api_key, note, ssh_key, snippet, certificate  
- L’API ne voit que du ciphertext  

## OTP / TOTP

- `createOtpPayload`, `generateTotp`, `verifyTotp`, `otpauthUri`  
- Codes live dans l’UI après déchiffrement côté client  

## Crypto (`@ops-vault/core`)

- **Dérivation** : Argon2id (64 MiB, t=3) → clé AES-256  
- **Chiffrement** : AES-256-GCM (`@noble/ciphers`)  
- **Format ciphertext** : `base64(nonce 12B ‖ ciphertext+tag)`  
- La clé maître ne quitte jamais le client.
