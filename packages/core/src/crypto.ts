// @noble v2 package exports use explicit .js subpaths.
// randomBytes lives in utils.js (not webcrypto.js — that only exposes async AES).
import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { argon2id } from "@noble/hashes/argon2.js";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
} from "./encoding.js";
import type { MasterKey } from "./types.js";

/** AES-256 key length (bytes). */
export const KEY_LENGTH = 32;

/** AES-GCM nonce length (bytes) — 96-bit, NIST recommended. */
export const NONCE_LENGTH = 12;

/** Salt length for Argon2id (bytes). */
export const SALT_LENGTH = 16;

/**
 * Argon2id parameters — interactive vault unlock balance.
 * Memory is in KiB (64 MiB). Tune upward for higher threat models.
 */
export const ARGON2_PARAMS = {
  t: 3, // iterations
  m: 65536, // 64 MiB
  p: 1, // parallelism (1 = portable / WebWorker-friendly)
  dkLen: KEY_LENGTH,
} as const;

function asMasterKey(bytes: Uint8Array): MasterKey {
  if (bytes.length !== KEY_LENGTH) {
    throw new Error(
      `MasterKey must be ${KEY_LENGTH} bytes, got ${bytes.length}`
    );
  }
  return bytes as MasterKey;
}

/** Cryptographically secure random salt for master-key derivation. */
export function generateSalt(length: number = SALT_LENGTH): Uint8Array {
  return randomBytes(length);
}

/**
 * Derive a 32-byte master key from a password + salt (Argon2id).
 * Zero-knowledge: runs client-side only; salt may be stored server-side.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array
): Promise<MasterKey> {
  if (!password) {
    throw new Error("Password is required");
  }
  if (salt.length < 8) {
    throw new Error("Salt must be at least 8 bytes");
  }

  // argon2id is sync/CPU-heavy — yield to the event loop first
  await Promise.resolve();

  const derived = argon2id(utf8ToBytes(password), salt, { ...ARGON2_PARAMS });
  return asMasterKey(derived);
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Output format (base64): `nonce (12) || ciphertext+tag`
 */
export async function encrypt(
  plaintext: string,
  key: MasterKey
): Promise<string> {
  if (key.length !== KEY_LENGTH) {
    throw new Error("Invalid master key length");
  }

  await Promise.resolve();

  const nonce = randomBytes(NONCE_LENGTH);
  const aes = gcm(key, nonce);
  const ciphertext = aes.encrypt(utf8ToBytes(plaintext));

  const packed = new Uint8Array(nonce.length + ciphertext.length);
  packed.set(nonce, 0);
  packed.set(ciphertext, nonce.length);

  return bytesToBase64(packed);
}

/**
 * Decrypt a payload produced by {@link encrypt}.
 */
export async function decrypt(
  ciphertext: string,
  key: MasterKey
): Promise<string> {
  if (key.length !== KEY_LENGTH) {
    throw new Error("Invalid master key length");
  }

  await Promise.resolve();

  const packed = base64ToBytes(ciphertext);
  if (packed.length < NONCE_LENGTH + 16) {
    // nonce + at least GCM tag
    throw new Error("Ciphertext too short or corrupted");
  }

  const nonce = packed.subarray(0, NONCE_LENGTH);
  const data = packed.subarray(NONCE_LENGTH);
  const aes = gcm(key, nonce);

  try {
    const plain = aes.decrypt(data);
    return bytesToUtf8(plain);
  } catch {
    throw new Error("Decryption failed — wrong key or corrupted data");
  }
}

/** Best-effort wipe of key material (GC may still retain copies). */
export function wipeKey(key: MasterKey): void {
  key.fill(0);
}
