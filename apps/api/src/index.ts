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
import { VaultStore, type AuditAction } from "@ops-vault/db";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Context } from "hono";

const dataDir = resolve(process.env.OPS_VAULT_DATA ?? "./data");
mkdirSync(dataDir, { recursive: true });
const dbPath = resolve(dataDir, "ops-vault.db");

const store = new VaultStore(dbPath);
console.log(`ops-vault db: ${dbPath}`);

const app = new Hono();

function clientMeta(c: Context) {
  return {
    ip:
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      undefined,
    userAgent: c.req.header("user-agent") || undefined,
  };
}

function audit(
  c: Context,
  action: AuditAction,
  detail?: string
): void {
  try {
    const meta = clientMeta(c);
    store.addAuditEvent({
      action,
      detail,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  } catch (err) {
    console.error("audit write failed", err);
  }
}

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
    unlockOk: store.countAuditByAction("vault.unlock.ok"),
    unlockFail: store.countAuditByAction("vault.unlock.fail"),
    exports: store.countAuditByAction("vault.export"),
  });
});

// ── Vault ─────────────────────────────────────────────────

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
    audit(c, "vault.create", vault.name);
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
  audit(
    c,
    body.recovery ? "vault.recovery.set" : "vault.recovery.clear"
  );
  const updated = store.getVault();
  return c.json({ vault: updated });
});

/**
 * Client-reported unlock outcome.
 * IMPORTANT: unlock is zero-knowledge (client-side). Offline password cracking
 * of a stolen dump leaves NO server trace. These events only reflect UI/API
 * sessions that choose to report — useful for "unlock I didn't do", not for
 * proving the password was never cracked offline.
 */
app.post("/vault/session", async (c) => {
  const body = await c.req.json<{
    result: "ok" | "fail";
    detail?: string;
  }>();

  if (body.result !== "ok" && body.result !== "fail") {
    return c.json({ error: "result must be ok|fail" }, 400);
  }

  audit(
    c,
    body.result === "ok" ? "vault.unlock.ok" : "vault.unlock.fail",
    body.detail
  );
  return c.json({ ok: true });
});

/** Apply password rotation (new salt/verifier + re-encrypted secrets). */
app.post("/vault/rekey", async (c) => {
  const body = await c.req.json<{
    salt: string;
    verifier: string;
    secrets: Array<{ id: string; encryptedData: string }>;
    clearRecovery?: boolean;
  }>();

  if (!body?.salt || !body?.verifier || !Array.isArray(body.secrets)) {
    return c.json({ error: "salt, verifier and secrets required" }, 400);
  }

  try {
    const vault = store.rekeyVault({
      salt: body.salt,
      verifier: body.verifier,
      secrets: body.secrets,
      clearRecovery: body.clearRecovery !== false,
    });
    audit(c, "vault.rekey", `${body.secrets.length} secrets`);
    return c.json({ vault });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Rekey failed";
    return c.json({ error: msg }, 400);
  }
});

// ── Backup ────────────────────────────────────────────────

app.get("/vault/export", (c) => {
  try {
    const backup = store.exportBackup();
    audit(c, "vault.export", `${backup.secrets.length} secrets`);
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
    audit(
      c,
      "vault.import",
      `force=${Boolean(body.force)} count=${result.imported}`
    );
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

// ── Audit ─────────────────────────────────────────────────

app.get("/audit", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const events = store.listAuditEvents(limit);
  audit(c, "audit.read", `limit=${limit}`);
  return c.json({
    events,
    summary: {
      unlockOk: store.countAuditByAction("vault.unlock.ok"),
      unlockFail: store.countAuditByAction("vault.unlock.fail"),
      exports: store.countAuditByAction("vault.export"),
      imports: store.countAuditByAction("vault.import"),
      rekeys: store.countAuditByAction("vault.rekey"),
      secretReads: store.countAuditByAction("secret.read"),
    },
    note:
      "Offline cracking of a stolen salt+verifier dump cannot appear here. " +
      "These events only record API/UI activity that hit this server.",
  });
});

// ── Secrets ───────────────────────────────────────────────

app.get("/secrets", (c) => {
  const vault = store.getVault();
  if (!vault) return c.json({ items: [] });
  audit(c, "secret.list");
  return c.json({ items: store.listSecrets(vault.id) });
});

app.get("/secrets/:id", (c) => {
  const item = store.getSecret(c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  audit(c, "secret.read", item.id);
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
  audit(c, "secret.create", `${item.type}:${item.id}`);
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
  audit(c, "secret.update", item.id);
  return c.json(item);
});

app.delete("/secrets/:id", (c) => {
  const id = c.req.param("id");
  const ok = store.deleteSecret(id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  audit(c, "secret.delete", id);
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
