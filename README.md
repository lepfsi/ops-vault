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

Autres scripts :

```bash
pnpm build
pnpm lint
pnpm typecheck
```
