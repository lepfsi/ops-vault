import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  RecoveryBundle,
  SecretItem,
  SecretMeta,
  SecretType,
  VaultBackupV1,
  VaultRecord,
  VaultRecordWithRecovery,
} from "@ops-vault/core";
import { SCHEMA_SQL } from "./schema.js";

export interface CreateVaultInput {
  name: string;
  salt: string;
  verifier: string;
  recovery?: RecoveryBundle | null;
}

export interface CreateSecretInput {
  vaultId: string;
  type: SecretType;
  title: string;
  encryptedData: string;
  tags?: string[];
}

export interface UpdateSecretInput {
  title?: string;
  encryptedData?: string;
  tags?: string[];
}

export interface ImportBackupResult {
  vault: VaultRecord;
  imported: number;
}

export type AuditAction =
  | "vault.create"
  | "vault.export"
  | "vault.import"
  | "vault.recovery.set"
  | "vault.recovery.clear"
  | "vault.rekey"
  | "vault.unlock.ok"
  | "vault.unlock.fail"
  | "secret.list"
  | "secret.read"
  | "secret.create"
  | "secret.update"
  | "secret.delete"
  | "audit.read";

export interface AuditEvent {
  id: string;
  at: string;
  action: AuditAction;
  detail?: string;
  ip?: string;
  userAgent?: string;
}

export interface RekeyVaultInput {
  salt: string;
  verifier: string;
  secrets: Array<{ id: string; encryptedData: string }>;
  clearRecovery?: boolean;
}

type VaultRow = {
  id: string;
  name: string;
  salt: string;
  verifier: string;
  recovery_salt: string | null;
  recovery_sealed_key: string | null;
  recovery_created_at: string | null;
  created_at: string;
  updated_at: string;
};

type SecretRow = {
  id: string;
  vault_id: string;
  type: string;
  title: string;
  encrypted_data: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
};

function mapVault(row: VaultRow): VaultRecordWithRecovery {
  const recovery =
    row.recovery_salt && row.recovery_sealed_key
      ? {
          salt: row.recovery_salt,
          sealedKey: row.recovery_sealed_key,
          createdAt: row.recovery_created_at ?? row.created_at,
        }
      : null;

  return {
    id: row.id,
    name: row.name,
    salt: row.salt,
    verifier: row.verifier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recovery,
  };
}

function mapSecret(row: SecretRow): SecretItem {
  return {
    id: row.id,
    vaultId: row.vault_id,
    type: row.type as SecretType,
    title: row.title,
    encryptedData: row.encrypted_data,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSecretMeta(row: SecretRow): SecretMeta {
  const { encryptedData: _, ...meta } = mapSecret(row);
  return meta;
}

const VAULT_SELECT = `SELECT id, name, salt, verifier,
  recovery_salt, recovery_sealed_key, recovery_created_at,
  created_at, updated_at FROM vaults`;

/**
 * SQLite-backed store (Node.js `node:sqlite`, Node ≥ 22).
 * Stores vault auth material + ciphertext only.
 */
export class VaultStore {
  private readonly db: DatabaseSync;

  constructor(path: string = "ops-vault.db") {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA_SQL);
    this.migrate();
  }

  private migrate(): void {
    const cols = this.db
      .prepare("PRAGMA table_info(vaults)")
      .all() as unknown as Array<{ name: string }>;
    const names = new Set(cols.map((c) => c.name));
    if (!names.has("recovery_salt")) {
      this.db.exec("ALTER TABLE vaults ADD COLUMN recovery_salt TEXT");
    }
    if (!names.has("recovery_sealed_key")) {
      this.db.exec("ALTER TABLE vaults ADD COLUMN recovery_sealed_key TEXT");
    }
    if (!names.has("recovery_created_at")) {
      this.db.exec("ALTER TABLE vaults ADD COLUMN recovery_created_at TEXT");
    }
    // audit_events created via SCHEMA_SQL CREATE IF NOT EXISTS
  }

  close(): void {
    this.db.close();
  }

  // ── Vaults ──────────────────────────────────────────────

  getVault(): VaultRecordWithRecovery | null {
    const row = this.db
      .prepare(`${VAULT_SELECT} LIMIT 1`)
      .get() as unknown as VaultRow | undefined;
    return row ? mapVault(row) : null;
  }

  getVaultById(id: string): VaultRecordWithRecovery | null {
    const row = this.db
      .prepare(`${VAULT_SELECT} WHERE id = ?`)
      .get(id) as unknown as VaultRow | undefined;
    return row ? mapVault(row) : null;
  }

  createVault(input: CreateVaultInput): VaultRecordWithRecovery {
    const existing = this.getVault();
    if (existing) {
      throw new Error("Vault already exists");
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const rec = input.recovery;
    this.db
      .prepare(
        `INSERT INTO vaults (
          id, name, salt, verifier,
          recovery_salt, recovery_sealed_key, recovery_created_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        input.salt,
        input.verifier,
        rec?.salt ?? null,
        rec?.sealedKey ?? null,
        rec?.createdAt ?? null,
        now,
        now
      );

    return {
      id,
      name: input.name,
      salt: input.salt,
      verifier: input.verifier,
      createdAt: now,
      updatedAt: now,
      recovery: rec ?? null,
    };
  }

  setRecovery(vaultId: string, recovery: RecoveryBundle | null): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE vaults SET
          recovery_salt = ?,
          recovery_sealed_key = ?,
          recovery_created_at = ?,
          updated_at = ?
        WHERE id = ?`
      )
      .run(
        recovery?.salt ?? null,
        recovery?.sealedKey ?? null,
        recovery?.createdAt ?? null,
        now,
        vaultId
      );
  }

  /** Wipe vault + secrets (import --force). */
  clearAll(): void {
    this.db.exec("DELETE FROM secrets");
    this.db.exec("DELETE FROM vaults");
  }

  // ── Secrets ─────────────────────────────────────────────

  listSecrets(vaultId: string): SecretMeta[] {
    const rows = this.db
      .prepare(
        `SELECT id, vault_id, type, title, encrypted_data, tags, created_at, updated_at
         FROM secrets WHERE vault_id = ? ORDER BY title COLLATE NOCASE`
      )
      .all(vaultId) as unknown as SecretRow[];
    return rows.map(mapSecretMeta);
  }

  /** Full secrets including ciphertext (for export only). */
  listSecretsFull(vaultId: string): SecretItem[] {
    const rows = this.db
      .prepare(
        `SELECT id, vault_id, type, title, encrypted_data, tags, created_at, updated_at
         FROM secrets WHERE vault_id = ? ORDER BY title COLLATE NOCASE`
      )
      .all(vaultId) as unknown as SecretRow[];
    return rows.map(mapSecret);
  }

  getSecret(id: string): SecretItem | null {
    const row = this.db
      .prepare(
        `SELECT id, vault_id, type, title, encrypted_data, tags, created_at, updated_at
         FROM secrets WHERE id = ?`
      )
      .get(id) as unknown as SecretRow | undefined;
    return row ? mapSecret(row) : null;
  }

  createSecret(input: CreateSecretInput): SecretItem {
    if (!this.getVaultById(input.vaultId)) {
      throw new Error("Vault not found");
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const tagsJson = input.tags ? JSON.stringify(input.tags) : null;

    this.db
      .prepare(
        `INSERT INTO secrets
         (id, vault_id, type, title, encrypted_data, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.vaultId,
        input.type,
        input.title,
        input.encryptedData,
        tagsJson,
        now,
        now
      );

    return {
      id,
      vaultId: input.vaultId,
      type: input.type,
      title: input.title,
      encryptedData: input.encryptedData,
      tags: input.tags,
      createdAt: now,
      updatedAt: now,
    };
  }

  updateSecret(id: string, input: UpdateSecretInput): SecretItem | null {
    const current = this.getSecret(id);
    if (!current) return null;

    const now = new Date().toISOString();
    const title = input.title ?? current.title;
    const encryptedData = input.encryptedData ?? current.encryptedData;
    const tags = input.tags !== undefined ? input.tags : current.tags;
    const tagsJson = tags ? JSON.stringify(tags) : null;

    this.db
      .prepare(
        `UPDATE secrets
         SET title = ?, encrypted_data = ?, tags = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, encryptedData, tagsJson, now, id);

    return {
      ...current,
      title,
      encryptedData,
      tags,
      updatedAt: now,
    };
  }

  deleteSecret(id: string): boolean {
    const result = this.db.prepare("DELETE FROM secrets WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  countSecrets(vaultId?: string): number {
    if (vaultId) {
      const row = this.db
        .prepare("SELECT COUNT(*) AS c FROM secrets WHERE vault_id = ?")
        .get(vaultId) as unknown as { c: number | bigint };
      return Number(row.c);
    }
    const row = this.db
      .prepare("SELECT COUNT(*) AS c FROM secrets")
      .get() as unknown as { c: number | bigint };
    return Number(row.c);
  }

  // ── Backup ──────────────────────────────────────────────

  exportBackup(): VaultBackupV1 {
    const vault = this.getVault();
    if (!vault) {
      throw new Error("No vault to export");
    }
    const secrets = this.listSecretsFull(vault.id);
    return {
      format: "ops-vault-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      vault: {
        name: vault.name,
        salt: vault.salt,
        verifier: vault.verifier,
      },
      secrets: secrets.map((s) => ({
        type: s.type,
        title: s.title,
        encryptedData: s.encryptedData,
        tags: s.tags,
      })),
    };
  }

  importBackup(
    backup: VaultBackupV1,
    options?: { force?: boolean }
  ): ImportBackupResult {
    const existing = this.getVault();
    if (existing && !options?.force) {
      throw new Error("Vault already exists — use force to replace");
    }
    if (existing && options?.force) {
      this.clearAll();
    }

    const vault = this.createVault({
      name: backup.vault.name,
      salt: backup.vault.salt,
      verifier: backup.vault.verifier,
    });

    let imported = 0;
    for (const s of backup.secrets) {
      this.createSecret({
        vaultId: vault.id,
        type: s.type,
        title: s.title,
        encryptedData: s.encryptedData,
        tags: s.tags,
      });
      imported++;
    }

    return { vault, imported };
  }

  /**
   * Apply master-password rotation: new salt/verifier + re-encrypted secrets.
   * Optionally clears recovery (must be recreated with new master key).
   */
  rekeyVault(input: RekeyVaultInput): VaultRecordWithRecovery {
    const vault = this.getVault();
    if (!vault) throw new Error("No vault");

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE vaults SET salt = ?, verifier = ?, updated_at = ?,
          recovery_salt = CASE WHEN ? = 1 THEN NULL ELSE recovery_salt END,
          recovery_sealed_key = CASE WHEN ? = 1 THEN NULL ELSE recovery_sealed_key END,
          recovery_created_at = CASE WHEN ? = 1 THEN NULL ELSE recovery_created_at END
         WHERE id = ?`
      )
      .run(
        input.salt,
        input.verifier,
        now,
        input.clearRecovery ? 1 : 0,
        input.clearRecovery ? 1 : 0,
        input.clearRecovery ? 1 : 0,
        vault.id
      );

    for (const s of input.secrets) {
      this.db
        .prepare(
          `UPDATE secrets SET encrypted_data = ?, updated_at = ? WHERE id = ?`
        )
        .run(s.encryptedData, now, s.id);
    }

    const updated = this.getVault();
    if (!updated) throw new Error("Vault missing after rekey");
    return updated;
  }

  // ── Audit ───────────────────────────────────────────────

  addAuditEvent(input: {
    action: AuditAction;
    detail?: string;
    ip?: string;
    userAgent?: string;
  }): AuditEvent {
    const id = randomUUID();
    const at = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO audit_events (id, at, action, detail, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        at,
        input.action,
        input.detail ?? null,
        input.ip ?? null,
        input.userAgent ?? null
      );
    return {
      id,
      at,
      action: input.action,
      detail: input.detail,
      ip: input.ip,
      userAgent: input.userAgent,
    };
  }

  listAuditEvents(limit = 50): AuditEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, at, action, detail, ip, user_agent
         FROM audit_events ORDER BY at DESC LIMIT ?`
      )
      .all(limit) as unknown as Array<{
      id: string;
      at: string;
      action: string;
      detail: string | null;
      ip: string | null;
      user_agent: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      action: r.action as AuditAction,
      detail: r.detail ?? undefined,
      ip: r.ip ?? undefined,
      userAgent: r.user_agent ?? undefined,
    }));
  }

  countAuditByAction(action: AuditAction): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM audit_events WHERE action = ?`)
      .get(action) as unknown as { c: number | bigint };
    return Number(row.c);
  }
}
