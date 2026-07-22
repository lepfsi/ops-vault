export type {
  ApiKeyPayload,
  CertificatePayload,
  MasterKey,
  NotePayload,
  OtpPayload,
  PasswordPayload,
  RecoveryBundle,
  SecretItem,
  SecretMeta,
  SecretPayload,
  SecretType,
  SecretVaultId,
  SnippetPayload,
  SshKeyPayload,
  VaultAuthMaterial,
  VaultBackupSecret,
  VaultBackupV1,
  VaultRecord,
  VaultRecordWithRecovery,
  VaultSealedBackupV1,
} from "./types.js";

export {
  ARGON2_PARAMS,
  KEY_LENGTH,
  NONCE_LENGTH,
  SALT_LENGTH,
  decrypt,
  deriveMasterKey,
  encrypt,
  generateSalt,
  wipeKey,
} from "./crypto.js";

export {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
} from "./encoding.js";

export {
  VAULT_VERIFIER_PLAINTEXT,
  createVaultAuth,
  unlockVault,
} from "./vault-auth.js";

export type { TotpCode } from "./otp.js";
export {
  createOtpPayload,
  generateOtpSecret,
  generateTotp,
  otpauthUri,
  verifyTotp,
} from "./otp.js";

export { decryptPayload, encryptPayload } from "./secrets.js";

export {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  SEALED_BACKUP_FORMAT,
  assertVaultBackup,
  backupToJson,
  buildVaultBackup,
  isSealedBackup,
  isVaultBackup,
  parseBackupJson,
  sealBackup,
  unsealBackup,
  validateSecretType,
} from "./backup.js";

export {
  certificateSummary,
  extractPemBlocks,
  isLikelyCertificatePem,
  parseCertificatePem,
} from "./certificate.js";

export { createRecoveryBundle, unlockWithRecovery } from "./recovery.js";
