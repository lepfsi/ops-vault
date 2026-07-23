import {
  decrypt,
  deriveMasterKey,
  encrypt,
  generateSalt,
  wipeKey,
} from "./crypto.js";
import { base64ToBytes, bytesToBase64 } from "./encoding.js";
import type { NotePayload } from "./types.js";

/**
 * Seal a note body under a secondary PIN (double encryption).
 * Vault AES still wraps the whole payload.
 */
export async function sealNoteWithPin(
  body: string,
  pin: string
): Promise<Pick<NotePayload, "pinSalt" | "pinSealed" | "pinProtected" | "body">> {
  if (!pin || pin.length < 4) {
    throw new Error("PIN must be at least 4 characters");
  }
  const salt = generateSalt();
  const key = await deriveMasterKey(pin, salt);
  try {
    const sealed = await encrypt(body, key);
    return {
      body: "",
      pinProtected: true,
      pinSalt: bytesToBase64(salt),
      pinSealed: sealed,
    };
  } finally {
    wipeKey(key);
  }
}

/** Open a PIN-protected note body. */
export async function openNoteWithPin(
  payload: NotePayload,
  pin: string
): Promise<string> {
  if (!payload.pinProtected || !payload.pinSalt || !payload.pinSealed) {
    return payload.body;
  }
  if (!pin || pin.length < 4) {
    throw new Error("PIN required");
  }
  const salt = base64ToBytes(payload.pinSalt);
  const key = await deriveMasterKey(pin, salt);
  try {
    return await decrypt(payload.pinSealed, key);
  } catch {
    throw new Error("Incorrect note PIN");
  } finally {
    wipeKey(key);
  }
}

export function isNotePinProtected(payload: NotePayload): boolean {
  return Boolean(payload.pinProtected && payload.pinSealed && payload.pinSalt);
}
