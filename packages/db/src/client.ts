import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  SecretItem,
  SecretMeta,
  SecretType,
  VaultRecord,
} from "@ops-vault/core";
import { SCHEMA_SQL } from "./schema.js";

export interface CreateVaultInput {
  name: string;
  salt: string;
  verifier: string;
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

type VaultRow = {
  id: string;
  name: string;
  salt: string;
  verifier: string;
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

function mapVault(row: VaultRow): VaultRecord {
  return {
    id: row.id,
    name: row.name,
    salt: row.salt,
    verifier: row.verifier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  }

  close(): void {
    this.db.close();
  }

  // ── Vaults ──────────────────────────────────────────────

  getVault(): VaultRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, name, salt, verifier, created_at, updated_at FROM vaults LIMIT 1"
      )
      .get() as unknown as VaultRow | undefined;
    return row ? mapVault(row) : null;
  }

  getVaultById(id: string): VaultRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, name, salt, verifier, created_at, updated_at FROM vaults WHERE id = ?"
      )
      .get(id) as unknown as VaultRow | undefined;
    return row ? mapVault(row) : null;
  }

  createVault(input: CreateVaultInput): VaultRecord {
    const existing = this.getVault();
    if (existing) {
      throw new Error("Vault already exists");
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO vaults (id, name, salt, verifier, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.name, input.salt, input.verifier, now, now);

    return {
      id,
      name: input.name,
      salt: input.salt,
      verifier: input.verifier,
      createdAt: now,
      updatedAt: now,
    };
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
}
