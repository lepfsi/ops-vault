# @ops-vault/api

Backend OpsVault — Hono + `@ops-vault/db`.

## Principes

- Stocke **uniquement** salt, vérificateur et ciphertext
- Pas de mot de passe maître côté serveur
- SQLite local (`OPS_VAULT_DATA` / `./data/ops-vault.db`)

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Santé + stats |
| GET | `/vault` | Vault auth material ou null |
| POST | `/vault` | Init vault `{ name?, salt, verifier }` |
| GET | `/secrets` | Liste métadonnées (sans ciphertext) |
| GET | `/secrets/:id` | Secret complet (ciphertext) |
| POST | `/secrets` | Créer (ciphertext required) |
| PATCH | `/secrets/:id` | MAJ titre / ciphertext / tags |
| DELETE | `/secrets/:id` | Supprimer |

## Dev

```bash
pnpm --filter @ops-vault/api dev
```

Node ≥ 22 requis (`node:sqlite`).
