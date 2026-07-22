/** Base64 / UTF-8 helpers (browser + Node, no Buffer dependency). */

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

export function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const padding = (b64.match(/=+$/) ?? [""])[0].length;
  const outLen = Math.floor((cleaned.length * 3) / 4) - padding;
  const out = new Uint8Array(outLen);

  let o = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const n =
      (B64.indexOf(cleaned[i]!) << 18) |
      (B64.indexOf(cleaned[i + 1]!) << 12) |
      (B64.indexOf(cleaned[i + 2] ?? "A") << 6) |
      B64.indexOf(cleaned[i + 3] ?? "A");

    if (o < outLen) out[o++] = (n >> 16) & 255;
    if (o < outLen) out[o++] = (n >> 8) & 255;
    if (o < outLen) out[o++] = n & 255;
  }
  return out;
}
