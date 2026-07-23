export type {
  ApiKeyPayload,
  CertificatePayload,
  FolderItem,
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
  SecretVisibility,
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
  assertBase64RoundTrip,
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

export type { X509Parsed } from "./x509.js";
export { parseX509Der } from "./x509.js";

export { createRecoveryBundle, unlockWithRecovery } from "./recovery.js";

export type { PasswordRotationResult, RotatedSecret } from "./rotate.js";
export {
  VAULT_CANARY_PLAINTEXT,
  createVaultCanary,
  rotateMasterPassword,
  verifyVaultCanary,
} from "./rotate.js";

export type {
  PassphraseOptions,
  PasswordGenOptions,
  UsernameOptions,
  UsernameStyle,
} from "./password-gen.js";
export {
  estimatePassphraseEntropy,
  estimatePasswordEntropy,
  generatePassphrase,
  generatePassword,
  generateUsername,
} from "./password-gen.js";

export type { ExternalSharePackage, ShareLimits } from "./share.js";
export {
  SHARE_FORMAT,
  SHARE_TTL_PRESETS,
  SHARE_VERSION,
  SHARE_VIEW_PRESETS,
  createExternalShare,
  isExternalSharePackage,
  openExternalShare,
  reencryptPayloadForRecipient,
} from "./share.js";

export type {
  PasswordPolicy,
  PolicyResult,
  PolicyViolation,
} from "./password-policy.js";
export {
  DEFAULT_PASSWORD_POLICY,
  evaluatePasswordPolicy,
  mergePolicy,
} from "./password-policy.js";

export { checkPasswordBreached } from "./breach.js";

export {
  isNotePinProtected,
  openNoteWithPin,
  sealNoteWithPin,
} from "./note-protect.js";

export {
  clearOrgKeyLocal,
  generateOrgKey,
  loadOrgKeyLocal,
  openOrgKeyFromToken,
  openOrgKeyWithMaster,
  resolveOrgKey,
  sealOrgKeyForToken,
  sealOrgKeyWithMaster,
  storeOrgKeyLocal,
} from "./org-key.js";
