import { decrypt, encrypt, wipeKey } from "./crypto.js";
import { decryptPayload, encryptPayload } from "./secrets.js";
import { createVaultAuth } from "./vault-auth.js";
import type {
  MasterKey,
  SecretItem,
  SecretPayload,
  VaultAuthMaterial,
} from "./types.js";

export interface RotatedSecret {
  id: string;
  encryptedData: string;
}

export interface PasswordRotationResult {
  auth: VaultAuthMaterial;
  secrets: RotatedSecret[];
}

/**
 * Change master password: derive new key, re-encrypt every secret payload.
 * Old password becomes useless against the new vault material
 * (attackers who only have an old dump keep old data only).
 */
export async function rotateMasterPassword(
  oldKey: MasterKey,
  newPassword: string,
  secrets: Array<Pick<SecretItem, "id" | "encryptedData">>
): Promise<PasswordRotationResult> {
  const auth = await createVaultAuth(newPassword);
  const rotated: RotatedSecret[] = [];

  try {
    for (const s of secrets) {
      const plain = await decryptPayload<SecretPayload>(
        s.encryptedData,
        oldKey
      );
      const encryptedData = await encryptPayload(plain, auth.key);
      rotated.push({ id: s.id, encryptedData });
    }
    return { auth, secrets: rotated };
  } catch (err) {
    wipeKey(auth.key);
    throw err;
  }
}

/**
 * Optional canary blob: encrypt a known marker under the master key.
 * After unlock, decrypting it proves the key still matches vault material.
 * Does NOT detect offline password cracking of a stolen dump.
 */
export const VAULT_CANARY_PLAINTEXT = "ops-vault-canary-v1";

export async function createVaultCanary(key: MasterKey): Promise<string> {
  return encrypt(VAULT_CANARY_PLAINTEXT, key);
}

export async function verifyVaultCanary(
  canaryCiphertext: string,
  key: MasterKey
): Promise<boolean> {
  try {
    const plain = await decrypt(canaryCiphertext, key);
    return plain === VAULT_CANARY_PLAINTEXT;
  } catch {
    return false;
  }
}
