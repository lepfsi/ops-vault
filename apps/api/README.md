# @ops-vault/api

Backend OpsVault — Hono + TypeScript.

## Principes

- Stocke **uniquement** du ciphertext (`encryptedData`)
- Pas de mot de passe maître côté serveur
- Store mémoire pour le MVP (sera remplacé par `@ops-vault/db`)

## Dev

```bash
# depuis la racine du monorepo
pnpm --filter @ops-vault/api dev
```

Écoute sur `http://localhost:8787` par défaut.
