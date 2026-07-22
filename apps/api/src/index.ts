import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  assertVaultBackup,
  type RecoveryBundle,
  type SecretType,
  type VaultBackupV1,
} from "@ops-vault/core";
import { VaultStore } from "@ops-vault/db";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const dataDir = resolve(process.env.OPS_VAULT_DATA ?? "./data");
mkdirSync(dataDir, { recursive: true });
const dbPath = resolve(dataDir, "ops-vault.db");

const store = new VaultStore(dbPath);
console.log(`ops-vault db: ${dbPath}`);

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

app.get("/health", (c) => {
  const vault = store.getVault();
  return c.json({
    ok: true,
    service: "ops-vault-api",
    vault: vault
      ? {
          id: vault.id,
          name: vault.name,
          hasRecovery: Boolean(vault.recovery),
        }
      : null,
    secrets: vault ? store.countSecrets(vault.id) : 0,
  });
});

// ── Vault (auth material only — never password/key) ───────

app.get("/vault", (c) => {
  const vault = store.getVault();
  if (!vault) return c.json({ vault: null });
  return c.json({ vault });
});

app.post("/vault", async (c) => {
  const body = await c.req.json<{
    name?: string;
    salt: string;
    verifier: string;
    recovery?: RecoveryBundle | null;
  }>();

  if (!body?.salt || !body?.verifier) {
    return c.json({ error: "salt and verifier are required" }, 400);
  }

  try {
    const vault = store.createVault({
      name: body.name?.trim() || "OpsVault",
      salt: body.salt,
      verifier: body.verifier,
      recovery: body.recovery ?? null,
    });
    return c.json({ vault }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create vault";
    const status = msg.includes("already exists") ? 409 : 500;
    return c.json({ error: msg }, status);
  }
});

app.put("/vault/recovery", async (c) => {
  const vault = store.getVault();
  if (!vault) return c.json({ error: "No vault" }, 400);

  const body = await c.req.json<{ recovery: RecoveryBundle | null }>();
  store.setRecovery(vault.id, body.recovery ?? null);
  const updated = store.getVault();
  return c.json({ vault: updated });
});

// ── Backup export / import (ciphertext only) ──────────────

app.get("/vault/export", (c) => {
  try {
    const backup = store.exportBackup();
    return c.json(backup);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    return c.json({ error: msg }, 400);
  }
});

app.post("/vault/import", async (c) => {
  const body = await c.req.json<{
    backup: VaultBackupV1;
    force?: boolean;
  }>();

  try {
    assertVaultBackup(body.backup);
    const result = store.importBackup(body.backup, { force: body.force });
    return c.json(
      {
        vault: result.vault,
        imported: result.imported,
      },
      body.force ? 200 : 201
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    const status = msg.includes("already exists") ? 409 : 400;
    return c.json({ error: msg }, status);
  }
});

// ── Secrets (ciphertext only) ─────────────────────────────

app.get("/secrets", (c) => {
  const vault = store.getVault();
  if (!vault) return c.json({ items: [] });
  return c.json({ items: store.listSecrets(vault.id) });
});

app.get("/secrets/:id", (c) => {
  const item = store.getSecret(c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.post("/secrets", async (c) => {
  const vault = store.getVault();
  if (!vault) return c.json({ error: "No vault — init first" }, 400);

  const body = await c.req.json<{
    type: SecretType;
    title: string;
    encryptedData: string;
    tags?: string[];
  }>();

  if (!body?.type || !body?.title || !body?.encryptedData) {
    return c.json(
      { error: "type, title and encryptedData are required" },
      400
    );
  }

  const item = store.createSecret({
    vaultId: vault.id,
    type: body.type,
    title: body.title,
    encryptedData: body.encryptedData,
    tags: body.tags,
  });
  return c.json(item, 201);
});

app.patch("/secrets/:id", async (c) => {
  const body = await c.req.json<{
    title?: string;
    encryptedData?: string;
    tags?: string[];
  }>();

  const item = store.updateSecret(c.req.param("id"), body);
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.delete("/secrets/:id", (c) => {
  const ok = store.deleteSecret(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

const port = Number(process.env.PORT ?? 8787);

console.log(`ops-vault api listening on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});
