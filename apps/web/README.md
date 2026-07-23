# @ops-vault/web

Frontend OpsVault — Vite + React + TypeScript + Tailwind v4.

## Dev

Le **web seul ne suffit pas** : l’API doit tourner sur le port **8787**.

```bash
# depuis la racine (recommandé) — lance api + web
pnpm dev

# ou deux terminaux :
pnpm dev:api   # http://localhost:8787
pnpm dev:web   # http://localhost:5173
```

Proxy Vite : `/api/*` → `http://127.0.0.1:8787/*`.

Si tu vois `ECONNREFUSED` / `proxy error: /vaults` → l’API n’est pas démarrée.
