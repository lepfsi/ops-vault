# @ops-vault/api

Backend OpsVault — Hono + `@ops-vault/db`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Santé + stats |
| GET | `/vault` | Vault (+ recovery meta) |
| POST | `/vault` | Init `{ name?, salt, verifier, recovery? }` |
| PUT | `/vault/recovery` | Set/clear recovery bundle |
| GET | `/vault/export` | Backup JSON (ciphertexts) |
| POST | `/vault/import` | `{ backup, force? }` |
| GET | `/secrets` | Métadonnées |
| GET | `/secrets/:id` | Ciphertext inclus |
| POST | `/secrets` | Créer |
| PATCH | `/secrets/:id` | MAJ |
| DELETE | `/secrets/:id` | Supprimer |

## Dev

```bash
pnpm --filter @ops-vault/api dev
```

Node ≥ 22 (`node:sqlite`).
