export type SecretType =
  | "password"
  | "ssh_key"
  | "api_key"
  | "certificate"
  | "note"
  | "otp"
  | "snippet";

export interface SecretItem {
  id: string;
  vaultId: string;
  type: SecretType;
  title: string;
  /** Always ciphertext (base64); never store plaintext here. */
  encryptedData: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

/** Metadata only — safe to list without ciphertext. */
export type SecretMeta = Omit<SecretItem, "encryptedData">;

/**
 * 32-byte AES-256 key derived from the master password (Argon2id).
 * Branded for API clarity; cast to plain Uint8Array at crypto boundaries
 * (noble/TS 5.9 Uint8Array generic variance).
 */
export type MasterKey = Uint8Array & { readonly __brand: "MasterKey" };

/** Ensure SecretItem always carries vault ownership (server-side FK). */
export type SecretVaultId = SecretItem["vaultId"];

/** Server-stored vault record (no password, no master key). */
export interface VaultRecord {
  id: string;
  name: string;
  /** Argon2id salt (base64). */
  salt: string;
  /** AES-GCM ciphertext of a fixed verifier string. */
  verifier: string;
  createdAt: string;
  updatedAt: string;
}

/** Material produced client-side when creating a vault. */
export interface VaultAuthMaterial {
  salt: Uint8Array;
  saltB64: string;
  verifier: string;
  key: MasterKey;
}

export interface PasswordPayload {
  username?: string;
  password: string;
  url?: string;
  notes?: string;
}

export interface OtpPayload {
  /** Base32 TOTP secret. */
  secret: string;
  issuer?: string;
  label?: string;
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  digits?: 6 | 7 | 8;
  period?: number;
}

export interface NotePayload {
  body: string;
}

export interface SshKeyPayload {
  privateKey: string;
  publicKey?: string;
  passphrase?: string;
  comment?: string;
}

export interface ApiKeyPayload {
  key: string;
  header?: string;
  notes?: string;
}

export interface SnippetPayload {
  language?: string;
  code: string;
}

/** X.509 / PEM certificate material (fields beyond PEM are best-effort). */
export interface CertificatePayload {
  pem: string;
  privateKeyPem?: string;
  fingerprintSha256?: string;
  derLength?: number;
  label?: string;
  subject?: string;
  issuer?: string;
  notBefore?: string;
  notAfter?: string;
  serialNumber?: string;
  notes?: string;
}

export type SecretPayload =
  | PasswordPayload
  | OtpPayload
  | NotePayload
  | SshKeyPayload
  | ApiKeyPayload
  | SnippetPayload
  | CertificatePayload
  | Record<string, unknown>;

/** Secret entry inside a portable backup (no server ids). */
export interface VaultBackupSecret {
  type: SecretType;
  title: string;
  encryptedData: string;
  tags?: string[];
}

/** Portable vault backup — still zero-knowledge (ciphertexts only). */
export interface VaultBackupV1 {
  format: "ops-vault-backup";
  version: 1;
  exportedAt: string;
  vault: {
    name: string;
    salt: string;
    verifier: string;
  };
  secrets: VaultBackupSecret[];
}

/**
 * Backup sealed with a separate export passphrase.
 * Outer layer protects salt/verifier in transit; inner secrets stay master-key ciphertext.
 */
export interface VaultSealedBackupV1 {
  format: "ops-vault-sealed-backup";
  version: 1;
  exportedAt: string;
  salt: string;
  payload: string;
}

/** Recovery bundle: master key sealed under a recovery passphrase. */
export interface RecoveryBundle {
  salt: string;
  sealedKey: string;
  createdAt: string;
}

/** Extended vault record with optional recovery material (multi-admin later). */
export interface VaultRecordWithRecovery extends VaultRecord {
  recovery?: RecoveryBundle | null;
}
