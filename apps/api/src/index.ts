import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  assertVaultBackup,
  createOtpPayload,
  otpauthUri,
  verifyTotp,
  type RecoveryBundle,
  type SecretType,
  type VaultBackupV1,
} from "@ops-vault/core";
import { VaultStore, type AuditAction } from "@ops-vault/db";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Context } from "hono";
import {
  mailStatus,
  parseSmtpJson,
  sendShareEmail,
  smtpPublicFromRaw,
} from "./mail.js";

// Keep DB under OPS_VAULT_DATA (default ./data). Watcher must ignore this dir
// (see package.json dev script) — SQLite writes must not restart the API.
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

function audit(c: Context, action: AuditAction, detail?: string): void {
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

/** Active vault: X-Vault-Id header, ?vaultId=, or first vault. */
function vaultIdFrom(c: Context): string | undefined {
  return (
    c.req.header("x-vault-id") ||
    c.req.query("vaultId") ||
    undefined
  );
}

const webPort = Number(process.env.OPS_VAULT_WEB_PORT ?? 5180);
const corsOrigins = [
  `http://localhost:${webPort}`,
  `http://127.0.0.1:${webPort}`,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
  ...(process.env.OPS_VAULT_CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? []),
];

// Quiet logger: skip OPTIONS, health, and high-frequency list GETs
// (SecretList polls secrets/folders/tags; logging them floods the terminal).
const QUIET_GET = new Set([
  "/health",
  "/secrets",
  "/folders",
  "/tags",
  "/workspaces",
  "/mail/status",
]);
const requestLog = logger();
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  if (c.req.method === "GET" && QUIET_GET.has(c.req.path)) return next();
  return requestLog(c, next);
});
app.use(
  "*",
  cors({
    origin: corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Vault-Id"],
  })
);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "ops-vault-api",
    unlockOk: store.countAuditByAction("vault.unlock.ok"),
    unlockFail: store.countAuditByAction("vault.unlock.fail"),
    exports: store.countAuditByAction("vault.export"),
  });
});

// ── Auth (account by email — unlock remains client-side ZK) ─

app.post("/auth/register", async (c) => {
  const body = await c.req.json<{
    email: string;
    recoveryEmail?: string;
    name?: string;
    salt: string;
    verifier: string;
    recovery?: RecoveryBundle | null;
  }>();

  const email = body?.email?.trim().toLowerCase();
  if (!email || !body?.salt || !body?.verifier) {
    return c.json({ error: "email, salt and verifier are required" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: "Invalid email" }, 400);
  }

  try {
    const vault = store.createVault({
      name: body.name?.trim() || "OpsVault",
      email,
      recoveryEmail: body.recoveryEmail?.trim() || email,
      salt: body.salt,
      verifier: body.verifier,
      recovery: body.recovery ?? null,
    });
    audit(c, "vault.create", `${vault.id}:${email}`);
    return c.json({ vault }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Register failed";
    const status = msg.includes("already exists") ? 409 : 400;
    return c.json({ error: msg }, status);
  }
});

/** Lookup account material for client-side unlock (no password verified server-side). */
app.post("/auth/login", async (c) => {
  const body = await c.req.json<{ email: string }>();
  const email = body?.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "email is required" }, 400);

  const vault = store.getVaultByEmail(email);
  if (!vault) {
    audit(c, "vault.unlock.fail", `unknown:${email}`);
    return c.json({ error: "Unknown account" }, 404);
  }
  return c.json({ vault });
});

app.patch("/vault/account", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{
    email?: string | null;
    recoveryEmail?: string | null;
    name?: string;
  }>();
  try {
    const updated = store.updateAccount(vault.id, body);
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json({ vault: updated });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      400
    );
  }
});

// ── Multi-vault (scoped: only active vault, never global dump) ─

app.get("/vaults", (c) => {
  const vid = vaultIdFrom(c);
  if (!vid) return c.json({ vaults: [] });
  const v = store.getVaultById(vid);
  if (!v) return c.json({ vaults: [] });
  return c.json({
    vaults: [
      {
        id: v.id,
        name: v.name,
        email: v.email,
        hasRecovery: Boolean(v.recovery),
        hasRecoveryEmail: Boolean(v.recoveryEmail),
        secretCount: store.countSecrets(v.id),
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      },
    ],
  });
});

app.get("/vaults/:id", (c) => {
  const vault = store.getVaultById(c.req.param("id"));
  if (!vault) return c.json({ error: "Not found" }, 404);
  return c.json({ vault });
});

app.post("/vaults", async (c) => {
  const body = await c.req.json<{
    name?: string;
    email?: string;
    recoveryEmail?: string;
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
      email: body.email,
      recoveryEmail: body.recoveryEmail,
      salt: body.salt,
      verifier: body.verifier,
      recovery: body.recovery ?? null,
    });
    audit(c, "vault.create", `${vault.id}:${vault.name}`);
    return c.json({ vault }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      400
    );
  }
});

app.delete("/vaults/:id", (c) => {
  const id = c.req.param("id");
  const active = vaultIdFrom(c);
  if (active && active !== id) {
    return c.json({ error: "Can only delete the active vault" }, 403);
  }
  const ok = store.deleteVault(id);
  if (!ok) return c.json({ error: "Not found" }, 404);
  audit(c, "vault.create", `deleted:${id}`);
  return c.json({ ok: true });
});

app.delete("/workspaces/:id", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  try {
    const ok = store.deleteWorkspace(c.req.param("id"), vault.id);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      403
    );
  }
});

// Compat: single-vault style endpoints (active vault via header)

app.get("/vault", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
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

  const vault = store.createVault({
    name: body.name?.trim() || "OpsVault",
    salt: body.salt,
    verifier: body.verifier,
    recovery: body.recovery ?? null,
  });
  audit(c, "vault.create", vault.name);
  return c.json({ vault }, 201);
});

app.put("/vault/recovery", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);

  const body = await c.req.json<{ recovery: RecoveryBundle | null }>();
  store.setRecovery(vault.id, body.recovery ?? null);
  audit(c, body.recovery ? "vault.recovery.set" : "vault.recovery.clear", vault.id);
  return c.json({ vault: store.getVaultById(vault.id) });
});

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

app.post("/vault/rekey", async (c) => {
  const body = await c.req.json<{
    vaultId?: string;
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
      vaultId: body.vaultId ?? vaultIdFrom(c),
      salt: body.salt,
      verifier: body.verifier,
      secrets: body.secrets,
      clearRecovery: body.clearRecovery !== false,
    });
    audit(c, "vault.rekey", `${vault.id}:${body.secrets.length}`);
    return c.json({ vault });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Rekey failed";
    return c.json({ error: msg }, 400);
  }
});

app.get("/vault/export", (c) => {
  try {
    const backup = store.exportBackup(vaultIdFrom(c));
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
    replaceVaultId?: string;
  }>();

  try {
    assertVaultBackup(body.backup);
    const result = store.importBackup(body.backup, {
      force: body.force,
      replaceVaultId: body.replaceVaultId ?? vaultIdFrom(c),
    });
    audit(
      c,
      "vault.import",
      `force=${Boolean(body.force)} count=${result.imported} id=${result.vault.id}`
    );
    return c.json(
      { vault: result.vault, imported: result.imported },
      201
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    return c.json({ error: msg }, 400);
  }
});

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

// ── Folders & tags ────────────────────────────────────────

app.get("/folders", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ folders: [] });
  return c.json({ folders: store.listFolders(vault.id) });
});

app.post("/folders", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{ name: string }>();
  try {
    const folder = store.createFolder({
      vaultId: vault.id,
      name: body.name ?? "",
    });
    return c.json({ folder }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Create folder failed" },
      400
    );
  }
});

app.delete("/folders/:id", (c) => {
  const ok = store.deleteFolder(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.get("/tags", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ tags: [] });
  return c.json({ tags: store.listTags(vault.id) });
});

// ── Secrets (scoped by X-Vault-Id) ────────────────────────

app.get("/secrets", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ items: [] });
  const workspaceId = c.req.query("workspaceId") || null;
  // No audit on list — high frequency + would thrash tsx watch if DB dir is watched
  return c.json({
    items: store.listSecrets(vault.id, { workspaceId }),
  });
});

app.get("/secrets/:id", (c) => {
  const item = store.getSecret(c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  const active = vaultIdFrom(c);
  // Personal: owner only. Org-shared: any member with list access path.
  if (active && item.vaultId !== active) {
    if (!(item.workspaceId && item.visibility === "org")) {
      return c.json({ error: "Not found" }, 404);
    }
  }
  audit(c, "secret.read", item.id);
  return c.json(item);
});

app.post("/secrets", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault — init first" }, 400);

  const body = await c.req.json<{
    type: SecretType;
    title: string;
    encryptedData: string;
    url?: string | null;
    folderId?: string | null;
    tags?: string[];
    workspaceId?: string | null;
    visibility?: "private" | "org";
  }>();

  if (!body?.type || !body?.title || !body?.encryptedData) {
    return c.json(
      { error: "type, title and encryptedData are required" },
      400
    );
  }

  const bodyFull = body as typeof body & { groupId?: string | null };
  const item = store.createSecret({
    vaultId: vault.id,
    type: body.type,
    title: body.title,
    encryptedData: body.encryptedData,
    url: body.url,
    folderId: body.folderId,
    tags: body.tags,
    workspaceId: body.workspaceId ?? null,
    visibility: body.visibility ?? "private",
    ownerVaultId: vault.id,
    groupId: bodyFull.groupId ?? null,
  });
  audit(c, "secret.create", `${item.type}:${item.id}`);
  return c.json(item, 201);
});

// ── Org vault key (sealed under each member master key) ───

app.get("/workspaces/:id/org-key", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const sealed = store.getWorkspaceOrgKey(c.req.param("id"), vault.id);
  return c.json({ sealedKey: sealed });
});

app.put("/workspaces/:id/org-key", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{ sealedKey: string }>();
  if (!body?.sealedKey) return c.json({ error: "sealedKey required" }, 400);
  store.putWorkspaceOrgKey(c.req.param("id"), vault.id, body.sealedKey);
  return c.json({ ok: true });
});

app.get("/workspaces/:id/groups", (c) => {
  return c.json({ groups: store.listGroups(c.req.param("id")) });
});

app.post("/workspaces/:id/groups", async (c) => {
  const body = await c.req.json<{ name: string }>();
  try {
    const group = store.createGroup(c.req.param("id"), body.name ?? "");
    return c.json({ group }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Create group failed" },
      400
    );
  }
});

app.post("/workspaces/:id/groups/:gid/members", async (c) => {
  const body = await c.req.json<{ memberId: string }>();
  if (!body?.memberId) return c.json({ error: "memberId required" }, 400);
  store.addGroupMember(c.req.param("gid"), body.memberId);
  return c.json({ ok: true });
});

app.delete("/workspaces/:id/groups/:gid/members/:mid", (c) => {
  store.removeGroupMember(c.req.param("gid"), c.req.param("mid"));
  return c.json({ ok: true });
});

app.patch("/secrets/:id", async (c) => {
  const body = await c.req.json<{
    title?: string;
    encryptedData?: string;
    url?: string | null;
    folderId?: string | null;
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

// ── Workspaces & shares (scoped to active vault membership) ─

app.get("/workspaces", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ workspaces: [] });
  return c.json({
    workspaces: store.listWorkspacesForVault(vault.id, vault.email),
  });
});

app.post("/workspaces", async (c) => {
  const body = await c.req.json<{ name: string }>();
  try {
    const vault = store.resolveVault(vaultIdFrom(c));
    if (!vault) return c.json({ error: "Unlock vault first" }, 400);
    const workspace = store.createWorkspace({
      name: body.name ?? "",
      ownerVaultId: vault.id,
      ownerEmail: vault.email,
    });
    return c.json({ workspace }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      400
    );
  }
});

/** Join org by invite token (active vault becomes member). */
app.post("/workspaces/join", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "Unlock vault first" }, 400);
  const body = await c.req.json<{ token: string }>();
  const token = body?.token?.trim();
  if (!token) return c.json({ error: "token required" }, 400);
  try {
    const result = store.acceptInvite({ token, vaultId: vault.id });
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Join failed" },
      400
    );
  }
});

app.get("/workspaces/:id/members", (c) => {
  return c.json({
    members: store.listWorkspaceMembers(c.req.param("id")),
  });
});

app.post("/workspaces/:id/members", async (c) => {
  const body = await c.req.json<{
    email: string;
    role?: "admin" | "member" | "viewer";
    sealedOrgKey?: string | null;
  }>();
  try {
    const member = store.inviteWorkspaceMember({
      workspaceId: c.req.param("id"),
      email: body.email ?? "",
      role: body.role,
      sealedOrgKey: body.sealedOrgKey ?? null,
    });
    return c.json({ member }, 201);
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Invite failed" },
      400
    );
  }
});

app.patch("/workspaces/:wid/members/:mid", async (c) => {
  const body = await c.req.json<{
    role?: "admin" | "member" | "viewer";
    revoke?: boolean;
    sealedOrgKey?: string | null;
  }>();
  if (body.sealedOrgKey) {
    const ok = store.setMemberSealedOrgKey(
      c.req.param("mid"),
      body.sealedOrgKey
    );
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  }
  if (body.revoke) {
    const ok = store.revokeMember(c.req.param("mid"));
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  }
  if (body.role) {
    const ok = store.updateMemberRole(c.req.param("mid"), body.role);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true, role: body.role });
  }
  return c.json({ error: "role, revoke or sealedOrgKey required" }, 400);
});

/** Preview invite (public-ish — token is secret). */
app.get("/invites/:token", (c) => {
  const inv = store.getInviteByToken(c.req.param("token"));
  if (!inv) return c.json({ error: "Invalid invite" }, 404);
  return c.json({
    invite: {
      email: inv.email,
      role: inv.role,
      status: inv.status,
      workspaceName: inv.workspaceName,
      workspaceId: inv.workspaceId,
    },
  });
});

/** Accept invite into active vault. */
app.post("/invites/:token/accept", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "Unlock/create a vault first" }, 400);
  try {
    const result = store.acceptInvite({
      token: c.req.param("token"),
      vaultId: vault.id,
    });
    return c.json({ ok: true, ...result });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Accept failed" },
      400
    );
  }
});

app.get("/shares", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ shares: [] });
  return c.json({ shares: store.listSecretShares(vault.id) });
});

app.get("/mail/status", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  const raw = vault ? store.getSmtpConfigRaw(vault.id) : null;
  return c.json(mailStatus(raw));
});

/** Per-vault SMTP (UI). Password never returned; omit pass on PUT to keep existing. */
app.get("/settings/smtp", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const raw = store.getSmtpConfigRaw(vault.id);
  const env = mailStatus(null);
  return c.json({
    smtp: smtpPublicFromRaw(raw),
    envFallback: {
      configured: env.configured,
      host: env.host,
      from: env.from,
    },
  });
});

app.put("/settings/smtp", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{
    enabled?: boolean;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
    clear?: boolean;
  }>();

  if (body.clear) {
    store.setSmtpConfigRaw(vault.id, null);
    return c.json({ ok: true, smtp: smtpPublicFromRaw(null) });
  }

  const existing = parseSmtpJson(store.getSmtpConfigRaw(vault.id));
  const host = (body.host ?? existing?.host ?? "").trim();
  const port = Number(body.port ?? existing?.port ?? 587);
  const user = body.user ?? existing?.user ?? "";
  // Keep previous password when client sends empty pass (masked field)
  const pass =
    body.pass != null && body.pass.length > 0
      ? body.pass
      : (existing?.pass ?? "");
  const from = (body.from ?? existing?.from ?? user ?? "").trim();
  const secure =
    body.secure != null
      ? Boolean(body.secure)
      : existing?.secure ?? port === 465;
  const enabled = body.enabled != null ? Boolean(body.enabled) : true;

  if (enabled && !host) {
    return c.json({ error: "SMTP host is required when enabled" }, 400);
  }

  const json = JSON.stringify({
    enabled,
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    pass,
    from,
  });
  store.setSmtpConfigRaw(vault.id, json);
  return c.json({ ok: true, smtp: smtpPublicFromRaw(json) });
});

app.post("/settings/smtp/test", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{ to?: string }>().catch(() => ({} as { to?: string }));
  const to =
    body.to?.trim() ||
    vault.email ||
    vault.recoveryEmail ||
    "";
  if (!to || !to.includes("@")) {
    return c.json(
      { error: "Provide a recipient email (to) or set account email" },
      400
    );
  }
  const raw = store.getSmtpConfigRaw(vault.id);
  const result = await sendShareEmail(
    {
      to,
      title: "SMTP test",
      claimUrl: "https://example.invalid/ops-vault-smtp-test",
      sharePassword: "(test — no real share)",
      scope: "external",
      expiresAt: null,
      maxViews: 1,
    },
    raw
  );
  if (!result.sent) {
    return c.json({ sent: false, error: result.reason, reason: result.reason }, 422);
  }
  return c.json({ sent: true, to });
});

app.post("/shares", async (c) => {
  const body = await c.req.json<{
    secretId?: string | null;
    vaultId: string;
    workspaceId?: string | null;
    scope: "workspace" | "external";
    title: string;
    type: string;
    packageJson?: string | null;
    recipientEmail?: string | null;
    note?: string | null;
    expiresAt?: string | null;
    maxViews?: number | null;
  }>();
  if (!body?.vaultId || !body?.title || !body?.scope) {
    return c.json({ error: "vaultId, title, scope required" }, 400);
  }
  const share = store.createSecretShare(body);
  return c.json({ share }, 201);
});

/** Email claim link (+ password) to a recipient after share creation. */
app.post("/shares/notify", async (c) => {
  const body = await c.req.json<{
    to: string;
    title: string;
    claimUrl: string;
    sharePassword: string;
    scope?: string;
    expiresAt?: string | null;
    maxViews?: number | null;
  }>();
  if (!body?.to || !body?.claimUrl || !body?.sharePassword || !body?.title) {
    return c.json(
      { error: "to, title, claimUrl and sharePassword are required" },
      400
    );
  }
  const vault = store.resolveVault(vaultIdFrom(c));
  const smtpRaw = vault ? store.getSmtpConfigRaw(vault.id) : null;
  const result = await sendShareEmail(
    {
      to: body.to,
      title: body.title,
      claimUrl: body.claimUrl,
      sharePassword: body.sharePassword,
      scope: body.scope ?? "external",
      expiresAt: body.expiresAt,
      maxViews: body.maxViews,
    },
    smtpRaw
  );
  if (!result.sent) {
    // 422: share was created client-side; only delivery failed — not a proxy outage
    return c.json(
      { sent: false, reason: result.reason, error: result.reason },
      422
    );
  }
  return c.json({ sent: true });
});

/** Claim share by access token (enforces TTL + max views). */
app.post("/shares/claim/:token", async (c) => {
  try {
    const claimed = store.claimSecretShare(c.req.param("token"));
    return c.json({
      share: {
        id: claimed.id,
        title: claimed.title,
        type: claimed.type,
        package: JSON.parse(claimed.packageJson),
        viewsRemaining: claimed.viewsRemaining,
      },
    });
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : "Claim failed" },
      400
    );
  }
});

app.get("/shares/:id", (c) => {
  const share = store.getSecretShare(c.req.param("id"));
  if (!share) return c.json({ error: "Not found" }, 404);
  return c.json({ share });
});

app.delete("/shares/:id", (c) => {
  const ok = store.deleteSecretShare(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.get("/vault/policy", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ policy: null });
  const raw = store.getPasswordPolicy(vault.id);
  return c.json({
    policy: raw ? JSON.parse(raw) : null,
  });
});

app.put("/vault/policy", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{ policy: Record<string, unknown> }>();
  store.setPasswordPolicy(vault.id, JSON.stringify(body.policy ?? {}));
  return c.json({ ok: true });
});

// ── Account 2FA (TOTP + recovery codes) ──────────────────

type TwoFactorStored = {
  enabled: boolean;
  secret: string;
  issuer: string;
  label: string;
  algorithm: "SHA1";
  digits: 6;
  period: 30;
  enabledAt?: string;
  /** SHA-256 hex hashes of one-time recovery codes (XXXX-XXXX). */
  recoveryHashes?: string[];
};

function parseTwoFactor(raw: string | null): TwoFactorStored | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<TwoFactorStored>;
    if (!o.secret || typeof o.secret !== "string") return null;
    return {
      enabled: Boolean(o.enabled),
      secret: o.secret,
      issuer: o.issuer ?? "OpsVault",
      label: o.label ?? "account",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      enabledAt: o.enabledAt,
      recoveryHashes: Array.isArray(o.recoveryHashes)
        ? o.recoveryHashes.filter((h): h is string => typeof h === "string")
        : [],
    };
  } catch {
    return null;
  }
}

function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(`opsvault-2fa-rc:${normalized}`).digest("hex");
}

function generateRecoveryCodes(count = 8): string[] {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let a = "";
    let b = "";
    for (let j = 0; j < 4; j++) {
      a += alphabet[bytes[j]! % alphabet.length]!;
      b += alphabet[bytes[j + 4]! % alphabet.length]!;
    }
    codes.push(`${a}-${b}`);
  }
  return codes;
}

function matchRecoveryCode(
  tf: TwoFactorStored,
  code: string
): { ok: true; remainingHashes: string[] } | { ok: false } {
  const h = hashRecoveryCode(code);
  const hashes = tf.recoveryHashes ?? [];
  const idx = hashes.indexOf(h);
  if (idx < 0) return { ok: false };
  const remainingHashes = hashes.filter((_, i) => i !== idx);
  return { ok: true, remainingHashes };
}

function totpOk(tf: TwoFactorStored, code: string): boolean {
  if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) return false;
  return verifyTotp(
    {
      secret: tf.secret,
      issuer: tf.issuer,
      label: tf.label,
      algorithm: tf.algorithm,
      digits: tf.digits,
      period: tf.period,
    },
    code
  );
}

async function buildQrDataUrl(uri: string): Promise<string | null> {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

app.get("/vault/2fa", (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ enabled: false, configured: false, recoveryRemaining: 0 });
  const tf = parseTwoFactor(store.getTwoFactorRaw(vault.id));
  return c.json({
    enabled: Boolean(tf?.enabled),
    configured: Boolean(tf?.enabled && tf.secret),
    enabledAt: tf?.enabledAt ?? null,
    recoveryRemaining: tf?.enabled ? (tf.recoveryHashes?.length ?? 0) : 0,
  });
});

/** Start setup: secret + otpauth + QR (not enabled until /enable). */
app.post("/vault/2fa/setup", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const existing = parseTwoFactor(store.getTwoFactorRaw(vault.id));
  if (existing?.enabled) {
    return c.json({ error: "2FA already enabled — disable first" }, 400);
  }
  const body = await c.req
    .json<{ label?: string }>()
    .catch(() => ({} as { label?: string }));
  const payload = createOtpPayload({
    issuer: "OpsVault",
    label: body.label?.trim() || vault.email || vault.name || "account",
  });
  const uri = otpauthUri(payload);
  const pending: TwoFactorStored = {
    enabled: false,
    secret: payload.secret,
    issuer: payload.issuer ?? "OpsVault",
    label: payload.label ?? "account",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    recoveryHashes: [],
  };
  store.setTwoFactorRaw(vault.id, JSON.stringify(pending));
  const qrDataUrl = await buildQrDataUrl(uri);
  return c.json({
    secret: pending.secret,
    otpauthUri: uri,
    qrDataUrl,
    issuer: pending.issuer,
    label: pending.label,
  });
});

/** Confirm setup with TOTP → enable + return one-time recovery codes. */
app.post("/vault/2fa/enable", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{ code?: string }>();
  const code = body?.code?.replace(/\s+/g, "") ?? "";
  if (!/^\d{6}$/.test(code)) {
    return c.json({ error: "Enter the 6-digit code from your app" }, 400);
  }
  const tf = parseTwoFactor(store.getTwoFactorRaw(vault.id));
  if (!tf?.secret) {
    return c.json({ error: "Start setup first (POST /vault/2fa/setup)" }, 400);
  }
  if (!totpOk(tf, code)) {
    return c.json({ error: "Invalid code — try the next one" }, 400);
  }
  const recoveryCodes = generateRecoveryCodes(8);
  const enabled: TwoFactorStored = {
    ...tf,
    enabled: true,
    enabledAt: new Date().toISOString(),
    recoveryHashes: recoveryCodes.map(hashRecoveryCode),
  };
  store.setTwoFactorRaw(vault.id, JSON.stringify(enabled));
  audit(c, "vault.rekey", `2fa.enable:${vault.id}`);
  return c.json({
    enabled: true,
    recoveryCodes,
    recoveryNote:
      "Save these codes now. Each works once to unlock or disable 2FA if you lose your authenticator.",
  });
});

/**
 * Disable 2FA with a recovery code (preferred when phone is lost)
 * or a current TOTP code.
 */
app.post("/vault/2fa/disable", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{ code?: string; recoveryCode?: string }>();
  const recoveryCode = (body?.recoveryCode ?? body?.code ?? "").trim();
  const totpCode = (body?.code ?? "").replace(/\s+/g, "");
  const tf = parseTwoFactor(store.getTwoFactorRaw(vault.id));
  if (!tf?.enabled) {
    store.setTwoFactorRaw(vault.id, null);
    return c.json({ enabled: false });
  }

  // Prefer recovery-code path when value looks like XXXX-XXXX / long alnum
  const looksLikeRecovery =
    recoveryCode.includes("-") ||
    recoveryCode.replace(/[^A-Za-z0-9]/g, "").length >= 8;

  if (looksLikeRecovery) {
    const match = matchRecoveryCode(tf, recoveryCode);
    if (!match.ok) {
      return c.json(
        {
          error:
            "Invalid recovery code. Use one of the codes shown when you enabled 2FA.",
        },
        400
      );
    }
    store.setTwoFactorRaw(vault.id, null);
    audit(c, "vault.rekey", `2fa.disable:recovery:${vault.id}`);
    return c.json({ enabled: false, usedRecovery: true });
  }

  if (!totpOk(tf, totpCode)) {
    return c.json(
      {
        error:
          "Invalid code. Enter a recovery code (XXXX-XXXX) or a 6-digit authenticator code.",
      },
      400
    );
  }
  store.setTwoFactorRaw(vault.id, null);
  audit(c, "vault.rekey", `2fa.disable:totp:${vault.id}`);
  return c.json({ enabled: false, usedRecovery: false });
});

/** Verify TOTP or recovery code after master password (unlock gate). */
app.post("/vault/2fa/verify", async (c) => {
  const vault = store.resolveVault(vaultIdFrom(c));
  if (!vault) return c.json({ error: "No vault" }, 400);
  const body = await c.req.json<{ code?: string; recoveryCode?: string }>();
  const raw = (body?.recoveryCode ?? body?.code ?? "").trim();
  const tf = parseTwoFactor(store.getTwoFactorRaw(vault.id));
  if (!tf?.enabled) {
    return c.json({ ok: true, required: false });
  }
  if (!raw) {
    return c.json(
      { error: "Enter authenticator code or a recovery code" },
      400
    );
  }

  const digits = raw.replace(/\s+/g, "");
  if (/^\d{6}$/.test(digits) && totpOk(tf, digits)) {
    audit(c, "vault.unlock.ok", `2fa:totp:${vault.id}`);
    return c.json({ ok: true, required: true, usedRecovery: false });
  }

  const match = matchRecoveryCode(tf, raw);
  if (match.ok) {
    // consume recovery code
    store.setTwoFactorRaw(
      vault.id,
      JSON.stringify({ ...tf, recoveryHashes: match.remainingHashes })
    );
    audit(c, "vault.unlock.ok", `2fa:recovery:${vault.id}`);
    return c.json({
      ok: true,
      required: true,
      usedRecovery: true,
      recoveryRemaining: match.remainingHashes.length,
    });
  }

  audit(c, "vault.unlock.fail", `2fa:${vault.id}`);
  return c.json(
    {
      error:
        "Invalid code. Use your authenticator app or a one-time recovery code.",
    },
    400
  );
});

/** Prefer OPS_VAULT_API_PORT (default 8790) to avoid OpsGate on 8787. */
const port = Number(
  process.env.OPS_VAULT_API_PORT ?? process.env.PORT ?? 8790
);

console.log(`ops-vault api · http://localhost:${port} · db ${dbPath}`);

serve({
  fetch: app.fetch,
  port,
});

process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});
