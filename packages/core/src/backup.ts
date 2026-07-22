import {
  decrypt,
  deriveMasterKey,
  encrypt,
  generateSalt,
  wipeKey,
} from "./crypto.js";
import { base64ToBytes, bytesToBase64 } from "./encoding.js";
import type {
  SecretItem,
  SecretType,
  VaultBackupSecret,
  VaultBackupV1,
  VaultRecord,
  VaultSealedBackupV1,
} from "./types.js";

export const BACKUP_FORMAT = "ops-vault-backup" as const;
export const SEALED_BACKUP_FORMAT = "ops-vault-sealed-backup" as const;
export const BACKUP_VERSION = 1 as const;

/** Build a portable backup (ciphertexts + vault auth material only). */
export function buildVaultBackup(
  vault: Pick<VaultRecord, "name" | "salt" | "verifier">,
  secrets: Array<
    Pick<SecretItem, "type" | "title" | "encryptedData" | "tags">
  >
): VaultBackupV1 {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    vault: {
      name: vault.name,
      salt: vault.salt,
      verifier: vault.verifier,
    },
    secrets: secrets.map(
      (s): VaultBackupSecret => ({
        type: s.type,
        title: s.title,
        encryptedData: s.encryptedData,
        tags: s.tags,
      })
    ),
  };
}

/** Seal a backup with an export passphrase (Argon2id + AES-GCM). */
export async function sealBackup(
  backup: VaultBackupV1,
  exportPassword: string
): Promise<VaultSealedBackupV1> {
  if (!exportPassword || exportPassword.length < 8) {
    throw new Error("Export password must be at least 8 characters");
  }
  const salt = generateSalt();
  const key = await deriveMasterKey(exportPassword, salt);
  try {
    const payload = await encrypt(JSON.stringify(backup), key);
    return {
      format: SEALED_BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: backup.exportedAt,
      salt: bytesToBase64(salt),
      payload,
    };
  } finally {
    wipeKey(key);
  }
}

/** Unseal a sealed backup with the export passphrase. */
export async function unsealBackup(
  sealed: VaultSealedBackupV1,
  exportPassword: string
): Promise<VaultBackupV1> {
  const salt = base64ToBytes(sealed.salt);
  const key = await deriveMasterKey(exportPassword, salt);
  try {
    const json = await decrypt(sealed.payload, key);
    const backup = JSON.parse(json) as VaultBackupV1;
    assertVaultBackup(backup);
    return backup;
  } finally {
    wipeKey(key);
  }
}

export function isVaultBackup(value: unknown): value is VaultBackupV1 {
  if (!value || typeof value !== "object") return false;
  const v = value as VaultBackupV1;
  return (
    v.format === BACKUP_FORMAT &&
    v.version === BACKUP_VERSION &&
    typeof v.vault?.salt === "string" &&
    typeof v.vault?.verifier === "string" &&
    Array.isArray(v.secrets)
  );
}

export function isSealedBackup(value: unknown): value is VaultSealedBackupV1 {
  if (!value || typeof value !== "object") return false;
  const v = value as VaultSealedBackupV1;
  return (
    v.format === SEALED_BACKUP_FORMAT &&
    v.version === BACKUP_VERSION &&
    typeof v.salt === "string" &&
    typeof v.payload === "string"
  );
}

export function assertVaultBackup(value: unknown): asserts value is VaultBackupV1 {
  if (!isVaultBackup(value)) {
    throw new Error("Invalid OpsVault backup format");
  }
  for (const s of value.secrets) {
    if (!s.type || !s.title || !s.encryptedData) {
      throw new Error("Backup contains invalid secret entries");
    }
  }
}

/**
 * Parse JSON text: either plain backup or sealed backup.
 * If sealed, exportPassword is required.
 */
export async function parseBackupJson(
  text: string,
  exportPassword?: string
): Promise<VaultBackupV1> {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Backup file is not valid JSON");
  }

  if (isVaultBackup(raw)) {
    assertVaultBackup(raw);
    return raw;
  }

  if (isSealedBackup(raw)) {
    if (!exportPassword) {
      throw new Error("This backup is sealed — export password required");
    }
    return unsealBackup(raw, exportPassword);
  }

  throw new Error("Unrecognized backup format");
}

export function backupToJson(
  backup: VaultBackupV1 | VaultSealedBackupV1,
  pretty = true
): string {
  return JSON.stringify(backup, null, pretty ? 2 : undefined);
}

export function validateSecretType(type: string): type is SecretType {
  return (
    type === "password" ||
    type === "ssh_key" ||
    type === "api_key" ||
    type === "certificate" ||
    type === "note" ||
    type === "otp" ||
    type === "snippet"
  );
}
