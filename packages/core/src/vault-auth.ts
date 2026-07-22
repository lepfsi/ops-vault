import {
  decrypt,
  deriveMasterKey,
  encrypt,
  generateSalt,
  wipeKey,
} from "./crypto.js";
import { base64ToBytes, bytesToBase64 } from "./encoding.js";
import type { MasterKey, VaultAuthMaterial } from "./types.js";

/**
 * Fixed plaintext sealed with the master key.
 * Server stores only the ciphertext; unlocking proves password knowledge.
 */
export const VAULT_VERIFIER_PLAINTEXT = "ops-vault-auth-v1";

/**
 * Create salt + encrypted verifier from a master password (client-side only).
 */
export async function createVaultAuth(
  password: string
): Promise<VaultAuthMaterial> {
  const salt = generateSalt();
  const key = await deriveMasterKey(password, salt);
  const verifier = await encrypt(VAULT_VERIFIER_PLAINTEXT, key);
  return {
    salt,
    saltB64: bytesToBase64(salt),
    verifier,
    key,
  };
}

/**
 * Unlock with password + stored salt/verifier.
 * Returns master key on success; throws on wrong password.
 */
export async function unlockVault(
  password: string,
  saltB64: string,
  verifierCiphertext: string
): Promise<MasterKey> {
  const salt = base64ToBytes(saltB64);
  const key = await deriveMasterKey(password, salt);

  try {
    const plain = await decrypt(verifierCiphertext, key);
    if (plain !== VAULT_VERIFIER_PLAINTEXT) {
      wipeKey(key);
      throw new Error("Invalid vault verifier");
    }
    return key;
  } catch (err) {
    wipeKey(key);
    if (err instanceof Error && err.message === "Invalid vault verifier") {
      throw err;
    }
    throw new Error("Wrong master password or corrupted vault");
  }
}
