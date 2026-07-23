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

# Lance API (:8790) + Web (:5180) ensemble
# (ports par défaut hors conflit OpsGate 5173/8787 — override via .env)
pnpm dev
```

| Service | URL | Script seul |
|---------|-----|-------------|
| **Web** | http://localhost:5180 | `pnpm dev:web` (`OPS_VAULT_WEB_PORT`) |
| **API** | http://localhost:8790 | `pnpm dev:api` (`OPS_VAULT_API_PORT`) |
| **SQLite** | `apps/api/data/ops-vault.db` | `OPS_VAULT_DATA` |

Si le navigateur affiche *API injoignable* / Vite `proxy error: /vaults` : seul le front tourne — démarre aussi `pnpm dev:api`.

Après un pull qui change le schéma SQLite, rebuild le package db avant `pnpm dev` :

```bash
pnpm --filter @ops-vault/db build
```

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

## « Est-ce que mon MDP a été cramé ? »

| Scénario | Détectable ? |
|----------|----------------|
| Dump SQLite/backup volé + brute-force offline | **Non** (ZK) |
| Attaquant qui appelle l’API (export, lecture secret, unlock UI) | **Oui** → journal `/audit` |
| Ancien MDP après rotation (rekey) | Invalide sur le coffre actuel |

Actions : panneau **Sécurité** (audit + rotation MDP), `POST /vault/rekey`, `GET /audit`.

## UI (professional shell)

Inspiré Bitwarden / 1Password (icônes SVG, logo OpsVault v1) :

- **Lock screen** + wordmark officiel
- **Sidebar** : types · dossiers (drag & drop) · tags · coffres
- **Top bar** : recherche (`/`) · Ajouter (`N`)
- **Drawer** : détail, **édition**, TOTP hero, partage externe
- **Mots de passe** : URL site · générateur · favicon/monogramme
- **Réglages** : Backup · Sécurité (rekey/reset) · Confidentialité · Espaces · À propos
- **Mode clair / sombre** · auto-lock

## Multi-vault

- Plusieurs coffres par instance (`GET/POST /vaults`)
- Header `X-Vault-Id` pour cibler le coffre actif
- UI : sélecteur + « Nouveau coffre »
- Recovery unlock sur l’écran verrouillé (si configuré)

## X.509

- `parseCertificatePem` + `parseX509Der` : subject, issuer, serial, notBefore/notAfter, SHA-256

## Structure

```
apps/web          UI (AuthPanel → @ops-vault/ui)
apps/api          Hono + SQLite multi-vault
packages/core     crypto, OTP, backup, X.509, recovery
packages/db       VaultStore
packages/ui       Button, Card, Badge, Input
```
