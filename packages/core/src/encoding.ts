/** Base64 / UTF-8 helpers (browser + Node). */

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8ToBytes(str: string): Uint8Array {
  return textEncoder.encode(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  // Prefer platform codecs when available (correct + fast).
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  let out = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < len ? bytes[i + 1]! : 0;
    const c = i + 2 < len ? bytes[i + 2]! : 0;
    const triple = (a << 16) | (b << 8) | c;

    out += B64[(triple >> 18) & 63];
    out += B64[(triple >> 12) & 63];
    out += i + 1 < len ? B64[(triple >> 6) & 63] : "=";
    out += i + 2 < len ? B64[triple & 63] : "=";
  }
  return out;
}

/**
 * Decode standard Base64 to bytes.
 *
 * CRITICAL: padding (`=`) must not be double-counted. We strip non-alphabet
 * chars (including `=`), then `outLen = floor(cleaned.length * 3 / 4)`.
 * The previous implementation subtracted padding again and truncated salts
 * (16 → 14 bytes), which made unlock always fail after page reload.
 */
export function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64.replace(/\s+/g, ""));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  const cleaned = b64.replace(/[^A-Za-z0-9+/]/g, "");
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }

  const outLen = Math.floor((cleaned.length * 3) / 4);
  const out = new Uint8Array(outLen);

  let o = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = B64.indexOf(cleaned[i]!);
    const c1 = B64.indexOf(cleaned[i + 1]!);
    const c2 = i + 2 < cleaned.length ? B64.indexOf(cleaned[i + 2]!) : 0;
    const c3 = i + 3 < cleaned.length ? B64.indexOf(cleaned[i + 3]!) : 0;

    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error("Invalid base64 input");
    }

    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

    if (o < outLen) out[o++] = (n >> 16) & 255;
    if (o < outLen) out[o++] = (n >> 8) & 255;
    if (o < outLen) out[o++] = n & 255;
  }

  return out;
}

/** Round-trip check used by diagnostics. */
export function assertBase64RoundTrip(bytes: Uint8Array): void {
  const again = base64ToBytes(bytesToBase64(bytes));
  if (again.length !== bytes.length) {
    throw new Error(
      `base64 round-trip length mismatch: ${bytes.length} → ${again.length}`
    );
  }
  for (let i = 0; i < bytes.length; i++) {
    if (again[i] !== bytes[i]) {
      throw new Error(`base64 round-trip byte mismatch at ${i}`);
    }
  }
}
