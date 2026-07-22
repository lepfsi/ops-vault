import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToBase64 } from "./encoding.js";
import type { CertificatePayload } from "./types.js";

const PEM_RE =
  /-----BEGIN ([A-Z0-9 ]+)-----([A-Za-z0-9+/=\s]+)-----END \1-----/g;

export interface PemBlock {
  label: string;
  der: Uint8Array;
  pem: string;
}

/** Extract PEM blocks from a blob (cert, chain, or key). */
export function extractPemBlocks(text: string): PemBlock[] {
  const blocks: PemBlock[] = [];
  const normalized = text.replace(/\r\n/g, "\n");
  const re = new RegExp(PEM_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const label = m[1]!.trim();
    const b64 = m[2]!.replace(/\s+/g, "");
    const der = base64ToUint8(b64);
    blocks.push({
      label,
      der,
      pem: `-----BEGIN ${label}-----\n${wrap64(b64)}\n-----END ${label}-----`,
    });
  }
  return blocks;
}

function base64ToUint8(b64: string): Uint8Array {
  const cleaned = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const pad = cleaned.length % 4 === 0 ? 0 : 4 - (cleaned.length % 4);
  const padded = cleaned + "=".repeat(pad);
  // Prefer atob when available
  if (typeof atob === "function") {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Pure decoder
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const outLen = Math.floor((padded.replace(/=/g, "").length * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < padded.length; i += 4) {
    const n =
      (alphabet.indexOf(padded[i]!) << 18) |
      (alphabet.indexOf(padded[i + 1]!) << 12) |
      ((padded[i + 2] === "=" ? 0 : alphabet.indexOf(padded[i + 2]!)) << 6) |
      (padded[i + 3] === "=" ? 0 : alphabet.indexOf(padded[i + 3]!));
    if (o < outLen) out[o++] = (n >> 16) & 255;
    if (o < outLen && padded[i + 2] !== "=") out[o++] = (n >> 8) & 255;
    if (o < outLen && padded[i + 3] !== "=") out[o++] = n & 255;
  }
  return out;
}

function wrap64(s: string): string {
  return s.match(/.{1,64}/g)?.join("\n") ?? s;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Parse PEM certificate material into a payload.
 * Full ASN.1 X.509 field extraction is deferred; we validate PEM,
 * fingerprint the DER, and store the PEM for later crypto use.
 */
export function parseCertificatePem(pemText: string): CertificatePayload {
  const blocks = extractPemBlocks(pemText);
  if (blocks.length === 0) {
    throw new Error("No PEM blocks found (expected -----BEGIN CERTIFICATE-----)");
  }

  const cert =
    blocks.find((b) => b.label.includes("CERTIFICATE") && !b.label.includes("REQUEST")) ??
    blocks[0]!;
  const key = blocks.find(
    (b) =>
      b.label.includes("PRIVATE KEY") ||
      b.label.includes("RSA PRIVATE KEY") ||
      b.label.includes("EC PRIVATE KEY")
  );

  const fingerprintSha256 = toHex(sha256(cert.der));

  return {
    pem: cert.pem,
    privateKeyPem: key?.pem,
    fingerprintSha256,
    derLength: cert.der.length,
    label: cert.label,
    notes: key
      ? `PEM certificate + private key (${key.label})`
      : `PEM ${cert.label}`,
  };
}

/** Quick structural check for certificate secrets. */
export function isLikelyCertificatePem(text: string): boolean {
  return (
    text.includes("BEGIN CERTIFICATE") ||
    text.includes("BEGIN TRUSTED CERTIFICATE")
  );
}

export function certificateSummary(payload: CertificatePayload): string {
  const parts = [
    payload.label ?? "CERTIFICATE",
    payload.fingerprintSha256
      ? `sha256:${payload.fingerprintSha256.slice(0, 16)}…`
      : null,
    payload.notAfter ? `exp ${payload.notAfter}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

// re-export helper used by payload builders
export { bytesToBase64 };
