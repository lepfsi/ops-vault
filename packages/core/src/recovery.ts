import {
  decrypt,
  deriveMasterKey,
  encrypt,
  generateSalt,
  KEY_LENGTH,
  wipeKey,
} from "./crypto.js";
import { base64ToBytes, bytesToBase64 } from "./encoding.js";
import type { MasterKey, RecoveryBundle } from "./types.js";

/**
 * Recovery package: master key encrypted under a recovery passphrase.
 * Enables unlock without the primary password (team handoff / break-glass).
 * Server stores only salt + sealed key — never plaintext keys.
 */
export async function createRecoveryBundle(
  masterKey: MasterKey,
  recoveryPassword: string
): Promise<RecoveryBundle> {
  if (!recoveryPassword || recoveryPassword.length < 12) {
    throw new Error("Recovery password must be at least 12 characters");
  }
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error("Invalid master key");
  }

  const salt = generateSalt();
  const recoveryKey = await deriveMasterKey(recoveryPassword, salt);
  try {
    // Seal master key bytes as base64 payload
    const sealed = await encrypt(bytesToBase64(masterKey), recoveryKey);
    return {
      salt: bytesToBase64(salt),
      sealedKey: sealed,
      createdAt: new Date().toISOString(),
    };
  } finally {
    wipeKey(recoveryKey);
  }
}

/** Restore master key from recovery bundle + recovery password. */
export async function unlockWithRecovery(
  bundle: RecoveryBundle,
  recoveryPassword: string
): Promise<MasterKey> {
  const salt = base64ToBytes(bundle.salt);
  const recoveryKey = await deriveMasterKey(recoveryPassword, salt);
  try {
    const keyB64 = await decrypt(bundle.sealedKey, recoveryKey);
    const bytes = base64ToBytes(keyB64);
    if (bytes.length !== KEY_LENGTH) {
      throw new Error("Recovered key has invalid length");
    }
    return bytes as MasterKey;
  } catch (err) {
    if (err instanceof Error && err.message.includes("invalid length")) {
      throw err;
    }
    throw new Error("Wrong recovery password or corrupted recovery bundle");
  } finally {
    wipeKey(recoveryKey);
  }
}
