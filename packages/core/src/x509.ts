/**
 * Minimal DER / X.509 TBSCertificate parser (no external ASN.1 deps).
 * Extracts: serial, issuer, subject, notBefore, notAfter.
 */

export interface X509Parsed {
  serialNumber: string;
  issuer: string;
  subject: string;
  notBefore: string;
  notAfter: string;
}

type DerNode = {
  tag: number;
  length: number;
  headerLen: number;
  content: Uint8Array;
  full: Uint8Array;
};

function readLength(
  der: Uint8Array,
  offset: number
): { length: number; headerLen: number } {
  const first = der[offset]!;
  if (first < 0x80) {
    return { length: first, headerLen: 1 };
  }
  const n = first & 0x7f;
  let length = 0;
  for (let i = 0; i < n; i++) {
    length = (length << 8) | der[offset + 1 + i]!;
  }
  return { length, headerLen: 1 + n };
}

function readNode(der: Uint8Array, offset: number): DerNode {
  const tag = der[offset]!;
  const { length, headerLen } = readLength(der, offset + 1);
  const contentStart = offset + 1 + headerLen;
  const content = der.subarray(contentStart, contentStart + length);
  const full = der.subarray(offset, contentStart + length);
  return { tag, length, headerLen: 1 + headerLen, content, full };
}

function children(seq: DerNode): DerNode[] {
  const out: DerNode[] = [];
  let o = 0;
  const c = seq.content;
  while (o < c.length) {
    const n = readNode(c, o);
    out.push(n);
    o += n.headerLen + n.length;
  }
  return out;
}

function decodePrintable(bytes: Uint8Array): string {
  // UTF8String / PrintableString / IA5String / BMPString (best-effort)
  try {
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join("");
  }
}

function oidToString(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const first = bytes[0]!;
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    const b = bytes[i]!;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

const OID_NAMES: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "1.2.840.113549.1.9.1": "emailAddress",
};

function parseName(nameNode: DerNode): string {
  // Name ::= SEQUENCE OF RelativeDistinguishedName
  // RDN ::= SET OF AttributeTypeAndValue
  const rdns = children(nameNode);
  const parts: string[] = [];
  for (const rdn of rdns) {
    if (rdn.tag !== 0x31) continue; // SET
    for (const atv of children(rdn)) {
      if (atv.tag !== 0x30) continue;
      const fields = children(atv);
      if (fields.length < 2) continue;
      const oid = fields[0]!.tag === 0x06 ? oidToString(fields[0]!.content) : "";
      const valNode = fields[1]!;
      const label = OID_NAMES[oid] ?? oid;
      const value = decodePrintable(valNode.content);
      parts.push(`${label}=${value}`);
    }
  }
  return parts.join(", ");
}

function parseTime(node: DerNode): string {
  // UTCTime (0x17) YYMMDDHHMMSSZ or GeneralizedTime (0x18)
  const s = decodePrintable(node.content);
  if (node.tag === 0x17 && s.length >= 12) {
    const yy = Number(s.slice(0, 2));
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    const mo = s.slice(2, 4);
    const dd = s.slice(4, 6);
    const hh = s.slice(6, 8);
    const mi = s.slice(8, 10);
    const ss = s.slice(10, 12);
    return `${year}-${mo}-${dd}T${hh}:${mi}:${ss}Z`;
  }
  if (node.tag === 0x18 && s.length >= 14) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
  }
  return s;
}

function serialToHex(node: DerNode): string {
  // INTEGER may be negative-encoded; take content bytes as hex
  return Array.from(node.content)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(":");
}

/**
 * Parse DER-encoded X.509 certificate.
 * Throws if structure is unexpected.
 */
export function parseX509Der(der: Uint8Array): X509Parsed {
  const cert = readNode(der, 0);
  if (cert.tag !== 0x30) throw new Error("Certificate is not a SEQUENCE");

  const top = children(cert);
  if (top.length < 1) throw new Error("Empty certificate");

  // TBSCertificate is first element
  const tbs = top[0]!;
  if (tbs.tag !== 0x30) throw new Error("TBSCertificate missing");

  const fields = children(tbs);
  // Optional [0] EXPLICIT version
  let i = 0;
  if (fields[0] && (fields[0].tag & 0xe0) === 0xa0) {
    i = 1;
  }

  const serial = fields[i++];
  i++; // signature AlgorithmIdentifier
  const issuer = fields[i++];
  const validity = fields[i++];
  const subject = fields[i++];

  if (!serial || !issuer || !validity || !subject) {
    throw new Error("TBSCertificate fields incomplete");
  }

  const validityChildren = children(validity);
  if (validityChildren.length < 2) {
    throw new Error("Validity SEQUENCE incomplete");
  }

  return {
    serialNumber: serialToHex(serial),
    issuer: parseName(issuer),
    subject: parseName(subject),
    notBefore: parseTime(validityChildren[0]!),
    notAfter: parseTime(validityChildren[1]!),
  };
}
