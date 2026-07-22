export type { MasterKey, SecretItem, SecretType } from "./types.js";

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
