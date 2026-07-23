import { sha256 } from "@noble/hashes/sha2.js";
import { base64ToBytes } from "./encoding.js";
import type { CertificatePayload } from "./types.js";
import { parseX509Der } from "./x509.js";

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
    const der = base64ToBytes(b64);
    blocks.push({
      label,
      der,
      pem: `-----BEGIN ${label}-----\n${wrap64(b64)}\n-----END ${label}-----`,
    });
  }
  return blocks;
}

function wrap64(s: string): string {
  return s.match(/.{1,64}/g)?.join("\n") ?? s;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Parse PEM certificate material into a payload with X.509 fields when possible.
 */
export function parseCertificatePem(pemText: string): CertificatePayload {
  const blocks = extractPemBlocks(pemText);
  if (blocks.length === 0) {
    throw new Error(
      "No PEM blocks found (expected -----BEGIN CERTIFICATE-----)"
    );
  }

  const cert =
    blocks.find(
      (b) =>
        b.label.includes("CERTIFICATE") && !b.label.includes("REQUEST")
    ) ?? blocks[0]!;
  const key = blocks.find(
    (b) =>
      b.label.includes("PRIVATE KEY") ||
      b.label.includes("RSA PRIVATE KEY") ||
      b.label.includes("EC PRIVATE KEY")
  );

  const fingerprintSha256 = toHex(sha256(cert.der));

  let x509: Partial<CertificatePayload> = {};
  try {
    const parsed = parseX509Der(cert.der);
    x509 = {
      subject: parsed.subject,
      issuer: parsed.issuer,
      notBefore: parsed.notBefore,
      notAfter: parsed.notAfter,
      serialNumber: parsed.serialNumber,
    };
  } catch {
    // PEM valid but ASN.1 incomplete — keep fingerprint only
  }

  return {
    pem: cert.pem,
    privateKeyPem: key?.pem,
    fingerprintSha256,
    derLength: cert.der.length,
    label: cert.label,
    ...x509,
    notes: [
      key ? `private key: ${key.label}` : null,
      x509.subject ? `subject: ${x509.subject}` : null,
      x509.notAfter ? `expires: ${x509.notAfter}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function isLikelyCertificatePem(text: string): boolean {
  return (
    text.includes("BEGIN CERTIFICATE") ||
    text.includes("BEGIN TRUSTED CERTIFICATE")
  );
}

export function certificateSummary(payload: CertificatePayload): string {
  const parts = [
    payload.subject || payload.label || "CERTIFICATE",
    payload.fingerprintSha256
      ? `sha256:${payload.fingerprintSha256.slice(0, 16)}…`
      : null,
    payload.notAfter ? `exp ${payload.notAfter}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
