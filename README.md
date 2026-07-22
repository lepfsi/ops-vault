# OpsVault

Coffre-fort de secrets pensé pour les équipes techniques.

Fait partie de la suite produit **DailyOps** (séparé d’OpsGate mais même écosystème).

## Philosophie

- Zero-knowledge (chiffrement côté client)
- Pensé par un administrateur système
- Support natif : mots de passe, clés SSH, certificats, clés API, OTP, snippets, notes
- Local-first + self-hosted
- Export / import portable + recovery key

## Stack

- Monorepo : pnpm + Turborepo
- Frontend : Vite + React + TypeScript + Tailwind
- Backend : Hono + TypeScript
- Core : `@noble/ciphers` + Argon2id + `otpauth`
- DB : SQLite via `node:sqlite` (Node ≥ 22)
- UI : `@ops-vault/ui` (composants partagés)

## Développement

```bash
pnpm install
pnpm --filter @ops-vault/core build
pnpm --filter @ops-vault/db build
pnpm --filter @ops-vault/ui build
pnpm dev
```

- **Web** : http://localhost:5173  
- **API** : http://localhost:8787  
- **SQLite** : `./data/ops-vault.db` (`OPS_VAULT_DATA`)

## Auth vault

1. **Setup** : `createVaultAuth(password)` → salt + vérificateur chiffré  
2. **API** stocke `{ salt, verifier }` uniquement  
3. **Unlock** : `unlockVault(password, salt, verifier)` côté client  

## Backup

| Type | Description |
|------|-------------|
| **Plain backup** | JSON `ops-vault-backup` — salt, verifier, ciphertexts |
| **Sealed backup** | JSON `ops-vault-sealed-backup` — couche export Argon2id + AES-GCM |

```
GET  /vault/export
POST /vault/import   { backup, force? }
```

Le MDP maître n’est jamais dans le fichier. Un backup scellé nécessite le **mot de passe d’export**.

## Recovery key

- `createRecoveryBundle(masterKey, recoveryPassword)` → scelle la clé maître  
- Stockage serveur : `recovery_salt` + `recovery_sealed_key`  
- `unlockWithRecovery(bundle, recoveryPassword)` pour break-glass  

```
PUT /vault/recovery  { recovery }
```

## Certificats

- Type secret `certificate`
- `parseCertificatePem` : validation PEM + empreinte SHA-256 DER
- Clé privée PEM optionnelle dans le même payload

## OTP

- `createOtpPayload`, `generateTotp`, `verifyTotp`, `otpauthUri`

## Crypto

- Argon2id (64 MiB, t=3) → AES-256-GCM  
- Format : `base64(nonce 12B ‖ ciphertext+tag)`  
- La clé maître ne quitte jamais le client (sauf recovery scellée côté serveur)

## Structure

```
apps/web          UI
apps/api          Hono + SQLite
packages/core     crypto, OTP, backup, cert, recovery
packages/db       VaultStore
packages/ui       Button, Card, Badge, Input
```
