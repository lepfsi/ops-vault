import {
  decrypt,
  deriveMasterKey,
  encrypt,
  generateSalt,
  wipeKey,
} from "./crypto.js";
import { base64ToBytes, bytesToBase64 } from "./encoding.js";
import type { SecretType } from "./types.js";

export const SHARE_FORMAT = "ops-vault-share" as const;
export const SHARE_VERSION = 2 as const;

/**
 * Portable secret share for external / workspace recipients.
 * Protected by share password; server may also enforce TTL + max views.
 */
export interface ExternalSharePackage {
  format: typeof SHARE_FORMAT;
  version: 1 | 2;
  title: string;
  type: SecretType;
  createdAt: string;
  salt: string;
  sealed: string;
  note?: string;
  /** ISO expiry (client hint; server is authoritative). */
  expiresAt?: string | null;
  /** Max successful opens (client hint). */
  maxViews?: number | null;
}

export interface ShareLimits {
  /** Milliseconds from now, or absolute ISO string. */
  expiresInMs?: number | null;
  expiresAt?: string | null;
  maxViews?: number | null;
}

/**
 * Seal a decrypted secret payload for sharing (password-based).
 * Recipient re-encrypts into their vault after opening (re-chiffrement destinataire).
 */
export async function createExternalShare(input: {
  title: string;
  type: SecretType;
  payload: unknown;
  sharePassword: string;
  note?: string;
  limits?: ShareLimits;
}): Promise<ExternalSharePackage> {
  if (!input.sharePassword || input.sharePassword.length < 8) {
    throw new Error("Share password must be at least 8 characters");
  }
  const salt = generateSalt();
  const key = await deriveMasterKey(input.sharePassword, salt);
  try {
    const sealed = await encrypt(
      JSON.stringify({ payload: input.payload }),
      key
    );
    let expiresAt: string | null | undefined = input.limits?.expiresAt ?? null;
    if (input.limits?.expiresInMs && input.limits.expiresInMs > 0) {
      expiresAt = new Date(
        Date.now() + input.limits.expiresInMs
      ).toISOString();
    }
    return {
      format: SHARE_FORMAT,
      version: SHARE_VERSION,
      title: input.title,
      type: input.type,
      createdAt: new Date().toISOString(),
      salt: bytesToBase64(salt),
      sealed,
      note: input.note,
      expiresAt,
      maxViews: input.limits?.maxViews ?? null,
    };
  } finally {
    wipeKey(key);
  }
}

/** Open share package with password (does not enforce server view limits). */
export async function openExternalShare(
  pkg: ExternalSharePackage,
  sharePassword: string
): Promise<{ title: string; type: SecretType; payload: unknown }> {
  if (pkg.format !== SHARE_FORMAT) {
    throw new Error("Invalid share package format");
  }
  if (pkg.expiresAt && new Date(pkg.expiresAt).getTime() < Date.now()) {
    throw new Error("This share has expired");
  }
  const salt = base64ToBytes(pkg.salt);
  const key = await deriveMasterKey(sharePassword, salt);
  try {
    const json = await decrypt(pkg.sealed, key);
    const body = JSON.parse(json) as { payload: unknown };
    return { title: pkg.title, type: pkg.type, payload: body.payload };
  } catch (err) {
    if (err instanceof Error && err.message.includes("expired")) throw err;
    throw new Error("Wrong share password or corrupted package");
  } finally {
    wipeKey(key);
  }
}

/**
 * After opening a share, re-encrypt payload for the recipient's master key
 * so it can be stored in their vault (destinataire).
 */
export async function reencryptPayloadForRecipient(
  payload: unknown,
  recipientMasterKey: import("./types.js").MasterKey
): Promise<string> {
  // Lazy to avoid circular init; secrets only depends on crypto.
  const secrets = await import("./secrets.js");
  return secrets.encryptPayload(
    payload as import("./types.js").SecretPayload,
    recipientMasterKey
  );
}

export function isExternalSharePackage(
  value: unknown
): value is ExternalSharePackage {
  if (!value || typeof value !== "object") return false;
  const v = value as ExternalSharePackage;
  return (
    v.format === SHARE_FORMAT &&
    (v.version === 1 || v.version === 2) &&
    typeof v.salt === "string" &&
    typeof v.sealed === "string"
  );
}

export const SHARE_TTL_PRESETS = [
  { id: "15m", label: "15 minutes", ms: 15 * 60_000 },
  { id: "1h", label: "1 hour", ms: 3_600_000 },
  { id: "24h", label: "24 hours", ms: 86_400_000 },
  { id: "7d", label: "7 days", ms: 7 * 86_400_000 },
  { id: "30d", label: "30 days", ms: 30 * 86_400_000 },
  { id: "never", label: "No expiry", ms: null },
] as const;

export const SHARE_VIEW_PRESETS = [
  { id: "1", label: "1 view", views: 1 },
  { id: "2", label: "2 views", views: 2 },
  { id: "5", label: "5 views", views: 5 },
  { id: "10", label: "10 views", views: 10 },
  { id: "unlimited", label: "Unlimited", views: null },
] as const;
