import {
  decrypt,
  encrypt,
  deriveMasterKey,
  generateSalt,
  wipeKey,
  KEY_LENGTH,
} from "./crypto.js";
import { base64ToBytes, bytesToBase64 } from "./encoding.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import type { MasterKey } from "./types.js";

const LS_PREFIX = "ops-vault.orgKey.";

/** Fresh 32-byte org vault key (shared ecosystem for org-visible secrets). */
export function generateOrgKey(): MasterKey {
  return randomBytes(KEY_LENGTH) as MasterKey;
}

function ls(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function storeOrgKeyLocal(workspaceId: string, key: MasterKey): void {
  ls()?.setItem(LS_PREFIX + workspaceId, bytesToBase64(key));
}

export function loadOrgKeyLocal(workspaceId: string): MasterKey | null {
  const b64 = ls()?.getItem(LS_PREFIX + workspaceId);
  if (!b64) return null;
  try {
    const bytes = base64ToBytes(b64);
    if (bytes.length !== KEY_LENGTH) return null;
    return bytes as MasterKey;
  } catch {
    return null;
  }
}

export function clearOrgKeyLocal(workspaceId: string): void {
  ls()?.removeItem(LS_PREFIX + workspaceId);
}

/**
 * Seal org key under invite token so joiners can open the org vault ecosystem.
 * Format: saltB64:ciphertext
 */
export async function sealOrgKeyForToken(
  orgKey: MasterKey,
  inviteToken: string
): Promise<string> {
  const salt = generateSalt();
  const wrap = await deriveMasterKey(inviteToken, salt);
  try {
    const sealed = await encrypt(bytesToBase64(orgKey), wrap);
    return `${bytesToBase64(salt)}:${sealed}`;
  } finally {
    wipeKey(wrap);
  }
}

export async function openOrgKeyFromToken(
  sealedPackage: string,
  inviteToken: string
): Promise<MasterKey> {
  const [saltB64, sealed] = sealedPackage.split(":");
  if (!saltB64 || !sealed) throw new Error("Invalid org key package");
  const wrap = await deriveMasterKey(inviteToken, base64ToBytes(saltB64));
  try {
    const keyB64 = await decrypt(sealed, wrap);
    const bytes = base64ToBytes(keyB64);
    if (bytes.length !== KEY_LENGTH) throw new Error("Invalid org key");
    return bytes as MasterKey;
  } finally {
    wipeKey(wrap);
  }
}

/** Seal org key under the member's master key (server stores package per vault). */
export async function sealOrgKeyWithMaster(
  orgKey: MasterKey,
  masterKey: MasterKey
): Promise<string> {
  return encrypt(bytesToBase64(orgKey), masterKey);
}

export async function openOrgKeyWithMaster(
  sealedPackage: string,
  masterKey: MasterKey
): Promise<MasterKey> {
  const keyB64 = await decrypt(sealedPackage, masterKey);
  const bytes = base64ToBytes(keyB64);
  if (bytes.length !== KEY_LENGTH) throw new Error("Invalid org key");
  return bytes as MasterKey;
}

/**
 * Resolve org key: local cache first, then optional server package + master key.
 */
export async function resolveOrgKey(
  workspaceId: string,
  masterKey: MasterKey,
  fetchSealed: () => Promise<string | null>
): Promise<MasterKey | null> {
  const local = loadOrgKeyLocal(workspaceId);
  if (local) return local;
  const sealed = await fetchSealed();
  if (!sealed) return null;
  try {
    const key = await openOrgKeyWithMaster(sealed, masterKey);
    storeOrgKeyLocal(workspaceId, key);
    return key;
  } catch {
    return null;
  }
}
