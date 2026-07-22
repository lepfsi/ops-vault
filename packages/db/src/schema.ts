/** SQL schema for OpsVault (ciphertext-only storage). */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  verifier TEXT NOT NULL,
  recovery_salt TEXT,
  recovery_sealed_key TEXT,
  recovery_created_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY NOT NULL,
  vault_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_secrets_vault ON secrets(vault_id);
`;
