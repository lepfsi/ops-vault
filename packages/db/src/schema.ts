/** SQL schema for OpsVault (ciphertext-only storage). */

/**
 * Table DDL only. Indexes that depend on columns added via migrate()
 * are created in VaultStore.migrate().
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS vaults (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  recovery_email TEXT,
  salt TEXT NOT NULL,
  verifier TEXT NOT NULL,
  recovery_salt TEXT,
  recovery_sealed_key TEXT,
  recovery_created_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  vault_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_folders_vault ON folders(vault_id);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY NOT NULL,
  vault_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  folder_id TEXT,
  workspace_id TEXT,
  owner_vault_id TEXT,
  visibility TEXT DEFAULT 'private',
  encrypted_data TEXT NOT NULL,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_secrets_vault ON secrets(vault_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_events(at DESC);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  owner_vault_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'invited',
  invite_token TEXT,
  accepted_at TEXT,
  accepted_vault_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ws_members ON workspace_members(workspace_id);
-- idx_ws_invite_token created in migrate() after invite_token column exists on old DBs

CREATE TABLE IF NOT EXISTS secret_shares (
  id TEXT PRIMARY KEY NOT NULL,
  secret_id TEXT,
  vault_id TEXT NOT NULL,
  workspace_id TEXT,
  scope TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  package_json TEXT,
  recipient_email TEXT,
  note TEXT,
  access_token TEXT,
  expires_at TEXT,
  max_views INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_vault ON secret_shares(vault_id);
-- idx_shares_token created in migrate() after access_token column exists on old DBs

CREATE TABLE IF NOT EXISTS vault_settings (
  vault_id TEXT PRIMARY KEY NOT NULL,
  password_policy_json TEXT,
  smtp_json TEXT,
  two_factor_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE
);

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
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ws_groups ON workspace_groups(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_group_members (
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (group_id, member_id),
  FOREIGN KEY (group_id) REFERENCES workspace_groups(id) ON DELETE CASCADE
);
`;
