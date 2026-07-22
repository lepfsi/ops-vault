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
- Core : `@noble/ciphers` + Argon2id

## Structure

```
ops-vault/
├── apps/
│   ├── web/          # Frontend Vite + React
│   └── api/          # Backend Hono
├── packages/
│   ├── core/         # Crypto + types secrets (@ops-vault/core)
│   ├── db/           # Accès données
│   ├── ui/           # Composants UI partagés
│   └── config/       # Config partagée (TS, ESLint, etc.)
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Développement

```bash
pnpm install
pnpm dev
```

- **Web** : http://localhost:5173  
- **API** : http://localhost:8787  

Autres scripts :

```bash
pnpm build
pnpm lint
pnpm typecheck
```

## Crypto (`@ops-vault/core`)

- **Dérivation** : Argon2id (64 MiB, t=3) → clé AES-256  
- **Chiffrement** : AES-256-GCM (`@noble/ciphers`)  
- **Format ciphertext** : `base64(nonce 12B ‖ ciphertext+tag)`  
- La clé maître ne quitte jamais le client.
