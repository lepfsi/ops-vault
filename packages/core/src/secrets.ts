import { decrypt, encrypt } from "./crypto.js";
import type { MasterKey, SecretPayload } from "./types.js";

/** Encrypt a typed secret payload to base64 ciphertext. */
export async function encryptPayload(
  payload: SecretPayload,
  key: MasterKey
): Promise<string> {
  return encrypt(JSON.stringify(payload), key);
}

/** Decrypt ciphertext back to a typed payload. */
export async function decryptPayload<T extends SecretPayload = SecretPayload>(
  encryptedData: string,
  key: MasterKey
): Promise<T> {
  const json = await decrypt(encryptedData, key);
  return JSON.parse(json) as T;
}
