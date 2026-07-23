import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  FolderItem,
  RecoveryBundle,
  SecretItem,
  SecretMeta,
  SecretType,
  SecretVisibility,
  VaultBackupV1,
  VaultRecord,
  VaultRecordWithRecovery,
} from "@ops-vault/core";
import { SCHEMA_SQL } from "./schema.js";

export interface CreateVaultInput {
  name: string;
  salt: string;
  verifier: string;
  email?: string | null;
  recoveryEmail?: string | null;
  recovery?: RecoveryBundle | null;
}

export interface CreateSecretInput {
  vaultId: string;
  type: SecretType;
  title: string;
  encryptedData: string;
  url?: string | null;
  folderId?: string | null;
  tags?: string[];
  workspaceId?: string | null;
  visibility?: SecretVisibility;
  ownerVaultId?: string | null;
  groupId?: string | null;
}

export interface UpdateSecretInput {
  title?: string;
  encryptedData?: string;
  url?: string | null;
  folderId?: string | null;
  tags?: string[];
  visibility?: SecretVisibility;
}

export interface CreateFolderInput {
  vaultId: string;
  name: string;
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
  vaultId?: string;
  salt: string;
  verifier: string;
  secrets: Array<{ id: string; encryptedData: string }>;
  clearRecovery?: boolean;
}

export interface VaultSummary {
  id: string;
  name: string;
  email?: string | null;
  hasRecovery: boolean;
  hasRecoveryEmail: boolean;
  secretCount: number;
  createdAt: string;
  updatedAt: string;
}

type VaultRow = {
  id: string;
  name: string;
  email: string | null;
  recovery_email: string | null;
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
  url: string | null;
  folder_id: string | null;
  workspace_id: string | null;
  owner_vault_id: string | null;
  visibility: string | null;
  group_id: string | null;
  encrypted_data: string;
  tags: string | null;
  created_at: string;
  updated_at: string;
};

type FolderRow = {
  id: string;
  vault_id: string;
  name: string;
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
    email: row.email ?? null,
    recoveryEmail: row.recovery_email ?? null,
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
    url: row.url,
    folderId: row.folder_id,
    workspaceId: row.workspace_id ?? null,
    ownerVaultId: row.owner_vault_id ?? row.vault_id,
    visibility: (row.visibility === "org" ? "org" : "private") as SecretVisibility,
    groupId: row.group_id ?? null,
    encryptedData: row.encrypted_data,
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFolder(row: FolderRow): FolderItem {
  return {
    id: row.id,
    vaultId: row.vault_id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SECRET_SELECT = `SELECT id, vault_id, type, title, url, folder_id,
  workspace_id, owner_vault_id, visibility, group_id,
  encrypted_data, tags, created_at, updated_at FROM secrets`;

function mapSecretMeta(row: SecretRow): SecretMeta {
  const { encryptedData: _, ...meta } = mapSecret(row);
  return meta;
}

const VAULT_SELECT = `SELECT id, name, email, recovery_email, salt, verifier,
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
    // 1) create tables (IF NOT EXISTS keeps old secrets shape)
    this.db.exec(SCHEMA_SQL);
    // 2) add missing columns on existing DBs
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
    if (!names.has("email")) {
      this.db.exec("ALTER TABLE vaults ADD COLUMN email TEXT");
    }
    if (!names.has("recovery_email")) {
      this.db.exec("ALTER TABLE vaults ADD COLUMN recovery_email TEXT");
    }
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_vaults_email ON vaults(email) WHERE email IS NOT NULL AND email != ''"
    );

    const secretCols = this.db
      .prepare("PRAGMA table_info(secrets)")
      .all() as unknown as Array<{ name: string }>;
    const sNames = new Set(secretCols.map((c) => c.name));
    if (!sNames.has("url")) {
      this.db.exec("ALTER TABLE secrets ADD COLUMN url TEXT");
    }
    if (!sNames.has("folder_id")) {
      this.db.exec("ALTER TABLE secrets ADD COLUMN folder_id TEXT");
    }
    if (!sNames.has("workspace_id")) {
      this.db.exec("ALTER TABLE secrets ADD COLUMN workspace_id TEXT");
    }
    if (!sNames.has("owner_vault_id")) {
      this.db.exec("ALTER TABLE secrets ADD COLUMN owner_vault_id TEXT");
    }
    if (!sNames.has("visibility")) {
      this.db.exec(
        "ALTER TABLE secrets ADD COLUMN visibility TEXT DEFAULT 'private'"
      );
    }
    if (!sNames.has("group_id")) {
      this.db.exec("ALTER TABLE secrets ADD COLUMN group_id TEXT");
    }

    // Indexes that need migrated columns (must run after ALTER TABLE)
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_secrets_folder ON secrets(folder_id)"
    );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_secrets_workspace ON secrets(workspace_id)"
    );

    // Org key packages + groups (IF NOT EXISTS)
    this.db.exec(`
CREATE TABLE IF NOT EXISTS workspace_org_keys (
  workspace_id TEXT NOT NULL,
  vault_id TEXT NOT NULL,
  sealed_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, vault_id)
);
CREATE TABLE IF NOT EXISTS workspace_groups (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ws_groups ON workspace_groups(workspace_id);
CREATE TABLE IF NOT EXISTS workspace_group_members (
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, member_id)
);
`);

    // workspace_members extras (table may predate invite_token)
    try {
      const memCols = this.db
        .prepare("PRAGMA table_info(workspace_members)")
        .all() as unknown as Array<{ name: string }>;
      const mNames = new Set(memCols.map((c) => c.name));
      if (mNames.size > 0) {
        if (!mNames.has("invite_token")) {
          this.db.exec(
            "ALTER TABLE workspace_members ADD COLUMN invite_token TEXT"
          );
        }
        if (!mNames.has("accepted_at")) {
          this.db.exec(
            "ALTER TABLE workspace_members ADD COLUMN accepted_at TEXT"
          );
        }
        if (!mNames.has("accepted_vault_id")) {
          this.db.exec(
            "ALTER TABLE workspace_members ADD COLUMN accepted_vault_id TEXT"
          );
        }
        if (!mNames.has("sealed_org_key")) {
          this.db.exec(
            "ALTER TABLE workspace_members ADD COLUMN sealed_org_key TEXT"
          );
        }
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_ws_invite_token ON workspace_members(invite_token)"
        );
      }
    } catch (err) {
      console.warn("workspace_members migrate:", err);
    }

    // secret_shares extras (table may predate access_token / TTL)
    try {
      const shCols = this.db
        .prepare("PRAGMA table_info(secret_shares)")
        .all() as unknown as Array<{ name: string }>;
      const shNames = new Set(shCols.map((c) => c.name));
      if (shNames.size > 0) {
        // SQLite ALTER cannot use NOT NULL DEFAULT on all versions — use plain types
        for (const col of [
          "access_token",
          "expires_at",
          "max_views",
          "view_count",
          "status",
        ] as const) {
          if (!shNames.has(col)) {
            this.db.exec(`ALTER TABLE secret_shares ADD COLUMN ${col}`);
          }
        }
        // Backfill defaults for new columns
        this.db.exec(
          `UPDATE secret_shares SET view_count = 0 WHERE view_count IS NULL`
        );
        this.db.exec(
          `UPDATE secret_shares SET status = 'active' WHERE status IS NULL`
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_shares_token ON secret_shares(access_token)"
        );
      }
    } catch (err) {
      console.warn("secret_shares migrate:", err);
    }
  }

  close(): void {
    this.db.close();
  }

  // ── Vaults ──────────────────────────────────────────────

  /** First vault (compat) — prefer listVaults + getVaultById. */
  getVault(): VaultRecordWithRecovery | null {
    const row = this.db
      .prepare(`${VAULT_SELECT} ORDER BY created_at ASC LIMIT 1`)
      .get() as unknown as VaultRow | undefined;
    return row ? mapVault(row) : null;
  }

  getVaultById(id: string): VaultRecordWithRecovery | null {
    const row = this.db
      .prepare(`${VAULT_SELECT} WHERE id = ?`)
      .get(id) as unknown as VaultRow | undefined;
    return row ? mapVault(row) : null;
  }

  /** Resolve by id, or fall back to first vault. */
  resolveVault(vaultId?: string | null): VaultRecordWithRecovery | null {
    if (vaultId) return this.getVaultById(vaultId);
    return this.getVault();
  }

  listVaults(): VaultSummary[] {
    const rows = this.db
      .prepare(`${VAULT_SELECT} ORDER BY name COLLATE NOCASE`)
      .all() as unknown as VaultRow[];
    return rows.map((row) => {
      const v = mapVault(row);
      return {
        id: v.id,
        name: v.name,
        email: v.email,
        hasRecovery: Boolean(v.recovery),
        hasRecoveryEmail: Boolean(v.recoveryEmail),
        secretCount: this.countSecrets(v.id),
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      };
    });
  }

  getVaultByEmail(email: string): VaultRecordWithRecovery | null {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const row = this.db
      .prepare(`${VAULT_SELECT} WHERE lower(email) = ?`)
      .get(normalized) as unknown as VaultRow | undefined;
    return row ? mapVault(row) : null;
  }

  createVault(input: CreateVaultInput): VaultRecordWithRecovery {
    const now = new Date().toISOString();
    const id = randomUUID();
    const rec = input.recovery;
    const email = input.email?.trim().toLowerCase() || null;
    const recoveryEmail = input.recoveryEmail?.trim().toLowerCase() || null;

    if (email) {
      const existing = this.getVaultByEmail(email);
      if (existing) {
        throw new Error("An account with this email already exists");
      }
    }

    this.db
      .prepare(
        `INSERT INTO vaults (
          id, name, email, recovery_email, salt, verifier,
          recovery_salt, recovery_sealed_key, recovery_created_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.name,
        email,
        recoveryEmail,
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
      email,
      recoveryEmail,
      salt: input.salt,
      verifier: input.verifier,
      createdAt: now,
      updatedAt: now,
      recovery: rec ?? null,
    };
  }

  updateAccount(
    vaultId: string,
    patch: { email?: string | null; recoveryEmail?: string | null; name?: string }
  ): VaultRecordWithRecovery | null {
    const current = this.getVaultById(vaultId);
    if (!current) return null;
    const now = new Date().toISOString();
    let email = current.email ?? null;
    let recoveryEmail = current.recoveryEmail ?? null;
    let name = current.name;

    if (patch.email !== undefined) {
      email = patch.email?.trim().toLowerCase() || null;
      if (email) {
        const other = this.getVaultByEmail(email);
        if (other && other.id !== vaultId) {
          throw new Error("Email already in use");
        }
      }
    }
    if (patch.recoveryEmail !== undefined) {
      recoveryEmail = patch.recoveryEmail?.trim().toLowerCase() || null;
    }
    if (patch.name !== undefined && patch.name.trim()) {
      name = patch.name.trim();
    }

    this.db
      .prepare(
        `UPDATE vaults SET email = ?, recovery_email = ?, name = ?, updated_at = ? WHERE id = ?`
      )
      .run(email, recoveryEmail, name, now, vaultId);

    return this.getVaultById(vaultId);
  }

  deleteVault(vaultId: string): boolean {
    this.db.prepare("DELETE FROM secrets WHERE vault_id = ?").run(vaultId);
    const result = this.db
      .prepare("DELETE FROM vaults WHERE id = ?")
      .run(vaultId);
    return Number(result.changes) > 0;
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

  /** Wipe all vaults + secrets. */
  clearAll(): void {
    this.db.exec("DELETE FROM secrets");
    this.db.exec("DELETE FROM vaults");
  }

  /** Wipe one vault and its secrets. */
  clearVault(vaultId: string): void {
    this.db.prepare("DELETE FROM secrets WHERE vault_id = ?").run(vaultId);
    this.db.prepare("DELETE FROM vaults WHERE id = ?").run(vaultId);
  }

  // ── Secrets ─────────────────────────────────────────────

  /**
   * Personal vault: only items with no workspace (or empty).
   * Org vault: shared (visibility=org) for that workspace + my private items in that org.
   */
  listSecrets(
    vaultId: string,
    opts?: { workspaceId?: string | null }
  ): SecretMeta[] {
    return this.listSecretsFull(vaultId, opts).map((s) => {
      const { encryptedData: _, ...meta } = s;
      return meta;
    });
  }

  /** Full secrets including ciphertext. */
  listSecretsFull(
    vaultId: string,
    opts?: { workspaceId?: string | null }
  ): SecretItem[] {
    const ws = opts?.workspaceId;
    let rows: SecretRow[];
    if (ws) {
      const memberId = this.getMemberIdForVault(ws, vaultId);
      const groupIds = memberId ? this.memberGroupIds(ws, memberId) : [];
      // Owner always sees their items; org-wide (no group); group-scoped if member of group
      const all = this.db
        .prepare(
          `${SECRET_SELECT}
           WHERE workspace_id = ?
           ORDER BY title COLLATE NOCASE`
        )
        .all(ws) as unknown as SecretRow[];
      rows = all.filter((r) => {
        if (r.vault_id === vaultId || r.owner_vault_id === vaultId) return true;
        if (r.visibility !== "org") return false;
        if (!r.group_id) return true; // whole org
        return groupIds.includes(r.group_id);
      });
    } else {
      rows = this.db
        .prepare(
          `${SECRET_SELECT}
           WHERE vault_id = ?
             AND (workspace_id IS NULL OR workspace_id = '')
           ORDER BY title COLLATE NOCASE`
        )
        .all(vaultId) as unknown as SecretRow[];
    }
    return rows.map(mapSecret);
  }

  getSecret(id: string): SecretItem | null {
    const row = this.db
      .prepare(`${SECRET_SELECT} WHERE id = ?`)
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
    const url = normalizeUrl(input.url);
    const folderId = input.folderId ?? null;
    const workspaceId = input.workspaceId ?? null;
    const visibility =
      workspaceId && input.visibility === "org" ? "org" : "private";
    const ownerVaultId = input.ownerVaultId ?? input.vaultId;
    const groupId =
      visibility === "org" && input.groupId ? input.groupId : null;

    this.db
      .prepare(
        `INSERT INTO secrets
         (id, vault_id, type, title, url, folder_id, workspace_id, owner_vault_id, visibility, group_id,
          encrypted_data, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.vaultId,
        input.type,
        input.title,
        url,
        folderId,
        workspaceId,
        ownerVaultId,
        visibility,
        groupId,
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
      url,
      folderId,
      workspaceId,
      ownerVaultId,
      visibility,
      groupId,
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
    const url =
      input.url !== undefined ? normalizeUrl(input.url) : current.url ?? null;
    const folderId =
      input.folderId !== undefined ? input.folderId : current.folderId ?? null;

    this.db
      .prepare(
        `UPDATE secrets
         SET title = ?, url = ?, folder_id = ?, encrypted_data = ?, tags = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, url, folderId, encryptedData, tagsJson, now, id);

    return {
      ...current,
      title,
      url,
      folderId,
      encryptedData,
      tags,
      updatedAt: now,
    };
  }

  // ── Folders ─────────────────────────────────────────────

  listFolders(vaultId: string): FolderItem[] {
    const rows = this.db
      .prepare(
        `SELECT id, vault_id, name, created_at, updated_at
         FROM folders WHERE vault_id = ? ORDER BY name COLLATE NOCASE`
      )
      .all(vaultId) as unknown as FolderRow[];
    return rows.map(mapFolder);
  }

  createFolder(input: CreateFolderInput): FolderItem {
    if (!this.getVaultById(input.vaultId)) {
      throw new Error("Vault not found");
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const name = input.name.trim();
    if (!name) throw new Error("Folder name required");
    this.db
      .prepare(
        `INSERT INTO folders (id, vault_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, input.vaultId, name, now, now);
    return {
      id,
      vaultId: input.vaultId,
      name,
      createdAt: now,
      updatedAt: now,
    };
  }

  deleteFolder(id: string): boolean {
    this.db
      .prepare(`UPDATE secrets SET folder_id = NULL WHERE folder_id = ?`)
      .run(id);
    const result = this.db.prepare(`DELETE FROM folders WHERE id = ?`).run(id);
    return Number(result.changes) > 0;
  }

  listTags(vaultId: string): string[] {
    const rows = this.db
      .prepare(`SELECT tags FROM secrets WHERE vault_id = ? AND tags IS NOT NULL`)
      .all(vaultId) as unknown as Array<{ tags: string }>;
    const set = new Set<string>();
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.tags) as string[];
        for (const t of arr) {
          if (t?.trim()) set.add(t.trim());
        }
      } catch {
        /* ignore */
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
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

  exportBackup(vaultId?: string): VaultBackupV1 {
    const vault = this.resolveVault(vaultId);
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
        url: s.url,
        folderId: s.folderId,
        tags: s.tags,
      })),
    };
  }

  /**
   * Import backup as a new vault.
   * force + replaceVaultId: wipe that vault first then recreate under same id… 
   * For simplicity force replaces only when replaceVaultId is set; otherwise always creates new.
   */
  importBackup(
    backup: VaultBackupV1,
    options?: { force?: boolean; replaceVaultId?: string }
  ): ImportBackupResult {
    if (options?.force && options.replaceVaultId) {
      this.clearVault(options.replaceVaultId);
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
        url: s.url,
        tags: s.tags,
        // folder ids are per-vault; skip on import to avoid FK orphans
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
    const vault = this.resolveVault(input.vaultId);
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
          `UPDATE secrets SET encrypted_data = ?, updated_at = ? WHERE id = ? AND vault_id = ?`
        )
        .run(s.encryptedData, now, s.id, vault.id);
    }

    const updated = this.getVaultById(vault.id);
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

  // ── Workspaces & shares ─────────────────────────────────

  listWorkspaces(): Array<{
    id: string;
    name: string;
    ownerVaultId: string | null;
    memberCount: number;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, name, owner_vault_id, created_at FROM workspaces ORDER BY name COLLATE NOCASE`
      )
      .all() as unknown as Array<{
      id: string;
      name: string;
      owner_vault_id: string | null;
      created_at: string;
    }>;
    return rows.map((r) => this.mapWorkspaceRow(r));
  }

  /**
   * Only orgs the vault owns or is a member of (never a global dump).
   */
  listWorkspacesForVault(
    vaultId: string,
    email?: string | null
  ): Array<{
    id: string;
    name: string;
    ownerVaultId: string | null;
    memberCount: number;
    createdAt: string;
    role?: string;
  }> {
    const emailNorm = email?.trim().toLowerCase() || null;
    const rows = this.db
      .prepare(
        `SELECT DISTINCT w.id, w.name, w.owner_vault_id, w.created_at
         FROM workspaces w
         LEFT JOIN workspace_members m ON m.workspace_id = w.id
         WHERE w.owner_vault_id = ?
            OR m.accepted_vault_id = ?
            OR (m.email = ? AND m.status IN ('active', 'invited') AND ? IS NOT NULL)
         ORDER BY w.name COLLATE NOCASE`
      )
      .all(vaultId, vaultId, emailNorm, emailNorm) as unknown as Array<{
      id: string;
      name: string;
      owner_vault_id: string | null;
      created_at: string;
    }>;

    return rows.map((r) => {
      const base = this.mapWorkspaceRow(r);
      let role = r.owner_vault_id === vaultId ? "admin" : "member";
      if (emailNorm) {
        const mem = this.db
          .prepare(
            `SELECT role FROM workspace_members
             WHERE workspace_id = ? AND lower(email) = ? AND status != 'revoked'
             LIMIT 1`
          )
          .get(r.id, emailNorm) as unknown as { role: string } | undefined;
        if (mem?.role) role = mem.role;
      }
      return { ...base, role };
    });
  }

  private mapWorkspaceRow(r: {
    id: string;
    name: string;
    owner_vault_id: string | null;
    created_at: string;
  }) {
    const m = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND status != 'revoked'`
      )
      .get(r.id) as unknown as { c: number | bigint };
    return {
      id: r.id,
      name: r.name,
      ownerVaultId: r.owner_vault_id,
      memberCount: Number(m.c),
      createdAt: r.created_at,
    };
  }

  createWorkspace(input: {
    name: string;
    ownerVaultId?: string | null;
    ownerEmail?: string | null;
  }): { id: string; name: string; createdAt: string } {
    const id = randomUUID();
    const now = new Date().toISOString();
    const name = input.name.trim();
    if (!name) throw new Error("Workspace name required");
    if (name.length < 2) throw new Error("Workspace name too short");

    // Unique name per owner vault
    if (input.ownerVaultId) {
      const dup = this.db
        .prepare(
          `SELECT id FROM workspaces
           WHERE owner_vault_id = ? AND lower(name) = lower(?) LIMIT 1`
        )
        .get(input.ownerVaultId, name) as unknown as { id: string } | undefined;
      if (dup) throw new Error("You already have an organization with this name");
    }

    this.db
      .prepare(
        `INSERT INTO workspaces (id, name, owner_vault_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, name, input.ownerVaultId ?? null, now, now);

    // Owner is immediately an active admin member
    if (input.ownerVaultId && input.ownerEmail) {
      const mid = randomUUID();
      this.db
        .prepare(
          `INSERT INTO workspace_members
           (id, workspace_id, email, role, status, invite_token, accepted_at, accepted_vault_id, created_at)
           VALUES (?, ?, ?, 'admin', 'active', NULL, ?, ?, ?)`
        )
        .run(
          mid,
          id,
          input.ownerEmail.trim().toLowerCase(),
          now,
          input.ownerVaultId,
          now
        );
    } else if (input.ownerVaultId) {
      const mid = randomUUID();
      this.db
        .prepare(
          `INSERT INTO workspace_members
           (id, workspace_id, email, role, status, invite_token, accepted_at, accepted_vault_id, created_at)
           VALUES (?, ?, ?, 'admin', 'active', NULL, ?, ?, ?)`
        )
        .run(
          mid,
          id,
          `owner@${input.ownerVaultId.slice(0, 8)}.local`,
          now,
          input.ownerVaultId,
          now
        );
    }

    return { id, name, createdAt: now };
  }

  listWorkspaceMembers(workspaceId: string): Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, email, role, status, created_at FROM workspace_members
         WHERE workspace_id = ? ORDER BY email COLLATE NOCASE`
      )
      .all(workspaceId) as unknown as Array<{
      id: string;
      email: string;
      role: string;
      status: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  inviteWorkspaceMember(input: {
    workspaceId: string;
    email: string;
    role?: "admin" | "member" | "viewer";
    sealedOrgKey?: string | null;
  }): {
    id: string;
    email: string;
    role: string;
    status: string;
    inviteToken: string;
  } {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      throw new Error("Valid email required");
    }
    const role = input.role ?? "member";
    if (!["admin", "member", "viewer"].includes(role)) {
      throw new Error("Invalid role");
    }

    // One active/invited membership per email per workspace
    const existing = this.db
      .prepare(
        `SELECT id, status FROM workspace_members
         WHERE workspace_id = ? AND lower(email) = ? AND status != 'revoked'
         LIMIT 1`
      )
      .get(input.workspaceId, email) as unknown as
      | { id: string; status: string }
      | undefined;
    if (existing) {
      throw new Error("This email is already a member or has a pending invite");
    }

    const id = randomUUID();
    const inviteToken =
      randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workspace_members
         (id, workspace_id, email, role, status, invite_token, sealed_org_key, created_at)
         VALUES (?, ?, ?, ?, 'invited', ?, ?, ?)`
      )
      .run(
        id,
        input.workspaceId,
        email,
        role,
        inviteToken,
        input.sealedOrgKey ?? null,
        now
      );
    return { id, email, role, status: "invited", inviteToken };
  }

  // ── Org key packages (per vault member) ─────────────────

  putWorkspaceOrgKey(
    workspaceId: string,
    vaultId: string,
    sealedKey: string
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workspace_org_keys (workspace_id, vault_id, sealed_key, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace_id, vault_id) DO UPDATE SET sealed_key = excluded.sealed_key`
      )
      .run(workspaceId, vaultId, sealedKey, now);
  }

  getWorkspaceOrgKey(workspaceId: string, vaultId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT sealed_key FROM workspace_org_keys WHERE workspace_id = ? AND vault_id = ?`
      )
      .get(workspaceId, vaultId) as unknown as { sealed_key: string } | undefined;
    return row?.sealed_key ?? null;
  }

  // ── Groups ──────────────────────────────────────────────

  listGroups(workspaceId: string): Array<{
    id: string;
    name: string;
    memberCount: number;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, name, created_at FROM workspace_groups
         WHERE workspace_id = ? ORDER BY name COLLATE NOCASE`
      )
      .all(workspaceId) as unknown as Array<{
      id: string;
      name: string;
      created_at: string;
    }>;
    return rows.map((r) => {
      const c = this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM workspace_group_members WHERE group_id = ?`
        )
        .get(r.id) as unknown as { c: number | bigint };
      return {
        id: r.id,
        name: r.name,
        memberCount: Number(c.c),
        createdAt: r.created_at,
      };
    });
  }

  createGroup(workspaceId: string, name: string): { id: string; name: string } {
    const n = name.trim();
    if (!n) throw new Error("Group name required");
    const dup = this.db
      .prepare(
        `SELECT id FROM workspace_groups WHERE workspace_id = ? AND lower(name) = lower(?)`
      )
      .get(workspaceId, n) as unknown as { id: string } | undefined;
    if (dup) throw new Error("Group name already exists");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workspace_groups (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)`
      )
      .run(id, workspaceId, n, now);
    return { id, name: n };
  }

  addGroupMember(groupId: string, memberId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO workspace_group_members (group_id, member_id, created_at)
         VALUES (?, ?, ?)`
      )
      .run(groupId, memberId, now);
  }

  removeGroupMember(groupId: string, memberId: string): void {
    this.db
      .prepare(
        `DELETE FROM workspace_group_members WHERE group_id = ? AND member_id = ?`
      )
      .run(groupId, memberId);
  }

  listGroupMembers(groupId: string): Array<{ memberId: string }> {
    const rows = this.db
      .prepare(
        `SELECT member_id FROM workspace_group_members WHERE group_id = ?`
      )
      .all(groupId) as unknown as Array<{ member_id: string }>;
    return rows.map((r) => ({ memberId: r.member_id }));
  }

  /** Member ids (workspace_members.id) for vault in this workspace */
  getMemberIdForVault(
    workspaceId: string,
    vaultId: string
  ): string | null {
    const row = this.db
      .prepare(
        `SELECT id FROM workspace_members
         WHERE workspace_id = ? AND accepted_vault_id = ? AND status = 'active'
         LIMIT 1`
      )
      .get(workspaceId, vaultId) as unknown as { id: string } | undefined;
    return row?.id ?? null;
  }

  memberGroupIds(workspaceId: string, memberId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT g.id FROM workspace_groups g
         JOIN workspace_group_members gm ON gm.group_id = g.id
         WHERE g.workspace_id = ? AND gm.member_id = ?`
      )
      .all(workspaceId, memberId) as unknown as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  setMemberSealedOrgKey(memberId: string, sealedOrgKey: string): boolean {
    const r = this.db
      .prepare(`UPDATE workspace_members SET sealed_org_key = ? WHERE id = ?`)
      .run(sealedOrgKey, memberId);
    return Number(r.changes) > 0;
  }

  getInviteByToken(token: string): {
    id: string;
    workspaceId: string;
    email: string;
    role: string;
    status: string;
    workspaceName: string;
    sealedOrgKey: string | null;
  } | null {
    const row = this.db
      .prepare(
        `SELECT m.id, m.workspace_id, m.email, m.role, m.status, m.sealed_org_key,
                w.name AS workspace_name
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.invite_token = ?`
      )
      .get(token) as unknown as
      | {
          id: string;
          workspace_id: string;
          email: string;
          role: string;
          status: string;
          sealed_org_key: string | null;
          workspace_name: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      email: row.email,
      role: row.role,
      status: row.status,
      workspaceName: row.workspace_name,
      sealedOrgKey: row.sealed_org_key ?? null,
    };
  }

  acceptInvite(input: {
    token: string;
    vaultId: string;
  }): {
    workspaceId: string;
    role: string;
    email: string;
    sealedOrgKey: string | null;
  } {
    const inv = this.getInviteByToken(input.token);
    if (!inv) throw new Error("Invalid invite token");
    if (inv.status === "active") {
      throw new Error("Invite already accepted");
    }
    if (inv.status === "revoked") {
      throw new Error("Invite revoked");
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE workspace_members
         SET status = 'active', accepted_at = ?, accepted_vault_id = ?, invite_token = NULL
         WHERE id = ?`
      )
      .run(now, input.vaultId, inv.id);
    return {
      workspaceId: inv.workspaceId,
      role: inv.role,
      email: inv.email,
      sealedOrgKey: inv.sealedOrgKey,
    };
  }

  updateMemberRole(
    memberId: string,
    role: "admin" | "member" | "viewer"
  ): boolean {
    const r = this.db
      .prepare(`UPDATE workspace_members SET role = ? WHERE id = ?`)
      .run(role, memberId);
    return Number(r.changes) > 0;
  }

  revokeMember(memberId: string): boolean {
    const r = this.db
      .prepare(
        `UPDATE workspace_members SET status = 'revoked', invite_token = NULL WHERE id = ?`
      )
      .run(memberId);
    return Number(r.changes) > 0;
  }

  createSecretShare(input: {
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
  }): { id: string; accessToken: string; createdAt: string } {
    const id = randomUUID();
    const accessToken =
      randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO secret_shares
         (id, secret_id, vault_id, workspace_id, scope, title, type, package_json,
          recipient_email, note, access_token, expires_at, max_views, view_count, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?)`
      )
      .run(
        id,
        input.secretId ?? null,
        input.vaultId,
        input.workspaceId ?? null,
        input.scope,
        input.title,
        input.type,
        input.packageJson ?? null,
        input.recipientEmail ?? null,
        input.note ?? null,
        accessToken,
        input.expiresAt ?? null,
        input.maxViews ?? null,
        now
      );
    return { id, accessToken, createdAt: now };
  }

  listSecretShares(vaultId: string): Array<{
    id: string;
    secretId: string | null;
    scope: string;
    title: string;
    type: string;
    recipientEmail: string | null;
    workspaceId: string | null;
    createdAt: string;
    packageJson: string | null;
    accessToken: string | null;
    expiresAt: string | null;
    maxViews: number | null;
    viewCount: number;
    status: string;
  }> {
    this.expireShares();
    const rows = this.db
      .prepare(
        `SELECT id, secret_id, scope, title, type, recipient_email, workspace_id,
                package_json, access_token, expires_at, max_views, view_count, status, created_at
         FROM secret_shares WHERE vault_id = ? ORDER BY created_at DESC`
      )
      .all(vaultId) as unknown as Array<{
      id: string;
      secret_id: string | null;
      scope: string;
      title: string;
      type: string;
      recipient_email: string | null;
      workspace_id: string | null;
      package_json: string | null;
      access_token: string | null;
      expires_at: string | null;
      max_views: number | null;
      view_count: number | bigint;
      status: string;
      created_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      secretId: r.secret_id,
      scope: r.scope,
      title: r.title,
      type: r.type,
      recipientEmail: r.recipient_email,
      workspaceId: r.workspace_id,
      packageJson: r.package_json,
      accessToken: r.access_token,
      expiresAt: r.expires_at,
      maxViews: r.max_views,
      viewCount: Number(r.view_count),
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  private expireShares(): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE secret_shares SET status = 'expired'
         WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?`
      )
      .run(now);
  }

  getSecretShareByToken(token: string): {
    id: string;
    packageJson: string | null;
    title: string;
    type: string;
    scope: string;
    status: string;
    expiresAt: string | null;
    maxViews: number | null;
    viewCount: number;
  } | null {
    this.expireShares();
    const row = this.db
      .prepare(
        `SELECT id, package_json, title, type, scope, status, expires_at, max_views, view_count
         FROM secret_shares WHERE access_token = ?`
      )
      .get(token) as unknown as
      | {
          id: string;
          package_json: string | null;
          title: string;
          type: string;
          scope: string;
          status: string;
          expires_at: string | null;
          max_views: number | null;
          view_count: number | bigint;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      packageJson: row.package_json,
      title: row.title,
      type: row.type,
      scope: row.scope,
      status: row.status,
      expiresAt: row.expires_at,
      maxViews: row.max_views,
      viewCount: Number(row.view_count),
    };
  }

  /**
   * Claim a share for viewing (increments view count; enforces TTL / max views).
   * Returns package JSON only if allowed.
   */
  claimSecretShare(token: string): {
    id: string;
    title: string;
    type: string;
    packageJson: string;
    viewsRemaining: number | null;
  } {
    const share = this.getSecretShareByToken(token);
    if (!share) throw new Error("Share not found");
    if (share.status === "revoked") throw new Error("Share revoked");
    if (share.status === "expired") throw new Error("Share expired");
    if (share.status === "exhausted") {
      throw new Error("Share view limit reached");
    }
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      this.db
        .prepare(`UPDATE secret_shares SET status = 'expired' WHERE id = ?`)
        .run(share.id);
      throw new Error("Share expired");
    }
    if (
      share.maxViews != null &&
      share.viewCount >= share.maxViews
    ) {
      this.db
        .prepare(`UPDATE secret_shares SET status = 'exhausted' WHERE id = ?`)
        .run(share.id);
      throw new Error("Share view limit reached");
    }
    if (!share.packageJson) throw new Error("Share has no package");

    const next = share.viewCount + 1;
    let status = "active";
    if (share.maxViews != null && next >= share.maxViews) {
      status = "exhausted";
    }
    this.db
      .prepare(
        `UPDATE secret_shares SET view_count = ?, status = ? WHERE id = ?`
      )
      .run(next, status, share.id);

    return {
      id: share.id,
      title: share.title,
      type: share.type,
      packageJson: share.packageJson,
      viewsRemaining:
        share.maxViews == null ? null : Math.max(0, share.maxViews - next),
    };
  }

  getSecretShare(id: string): {
    id: string;
    packageJson: string | null;
    title: string;
    scope: string;
    status: string;
  } | null {
    const row = this.db
      .prepare(
        `SELECT id, package_json, title, scope, status FROM secret_shares WHERE id = ?`
      )
      .get(id) as unknown as
      | {
          id: string;
          package_json: string | null;
          title: string;
          scope: string;
          status: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      packageJson: row.package_json,
      title: row.title,
      scope: row.scope,
      status: row.status,
    };
  }

  deleteSecretShare(id: string): boolean {
    const r = this.db.prepare(`DELETE FROM secret_shares WHERE id = ?`).run(id);
    return Number(r.changes) > 0;
  }

  getPasswordPolicy(vaultId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT password_policy_json FROM vault_settings WHERE vault_id = ?`
      )
      .get(vaultId) as unknown as { password_policy_json: string } | undefined;
    return row?.password_policy_json ?? null;
  }

  setPasswordPolicy(vaultId: string, policyJson: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO vault_settings (vault_id, password_policy_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(vault_id) DO UPDATE SET
           password_policy_json = excluded.password_policy_json,
           updated_at = excluded.updated_at`
      )
      .run(vaultId, policyJson, now);
  }
}

/** Normalize login URLs for metadata (open-in-browser). */
function normalizeUrl(url?: string | null): string | null {
  if (url == null) return null;
  const t = url.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(t)) return `https://${t}`;
  return t;
}
