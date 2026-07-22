export type {
  ApiKeyPayload,
  MasterKey,
  NotePayload,
  OtpPayload,
  PasswordPayload,
  SecretItem,
  SecretMeta,
  SecretPayload,
  SecretType,
  SnippetPayload,
  SshKeyPayload,
  VaultAuthMaterial,
  VaultRecord,
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
