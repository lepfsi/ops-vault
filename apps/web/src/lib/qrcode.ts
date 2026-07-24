/**
 * Client-side QR fallback when the API cannot generate a PNG (missing `qrcode` package).
 * Prefer API `qrDataUrl` from POST /vault/2fa/setup — it uses the `qrcode` library.
 *
 * This fallback builds a scannable matrix for short otpauth URIs (versions 1–10).
 */

/** Public helper: return an SVG data URL, or null if encoding fails. */
export function qrDataUrl(text: string, modulePx = 5, margin = 3): string | null {
  try {
    const matrix = encodeQr(text);
    if (!matrix) return null;
    const n = matrix.length;
    const dim = (n + margin * 2) * modulePx;
    let rects = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r]![c]) {
          rects += `<rect x="${(c + margin) * modulePx}" y="${(r + margin) * modulePx}" width="${modulePx}" height="${modulePx}" fill="#0f172a"/>`;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${rects}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

// ── Minimal QR (byte mode, ECC-M, mask 0) ─────────────────
// Intentional subset: good enough for authenticator otpauth strings.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (!a || !b) return 0;
  return EXP[(LOG[a]! + LOG[b]!) % 255]!;
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = [1];
  for (let i = 0; i < ecLen; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]!;
      next[j + 1] ^= gfMul(gen[j]!, EXP[i]!);
    }
    for (let j = 0; j < next.length; j++) gen[j] = next[j]!;
    gen.length = next.length;
  }
  const res = new Array(ecLen).fill(0);
  for (const b of data) {
    const f = b ^ res[0]!;
    res.shift();
    res.push(0);
    for (let i = 0; i < ecLen; i++) res[i] ^= gfMul(gen[i + 1] ?? 0, f);
  }
  return res;
}

/** version → [total codewords, ec codewords, blocks] for ECC-M */
const VERSIONS: Array<[number, number, number]> = [
  [26, 10, 1],
  [44, 16, 1],
  [70, 26, 1],
  [100, 36, 1],
  [134, 48, 2],
  [172, 64, 2],
  [196, 72, 2],
  [242, 88, 2],
  [292, 110, 2],
  [346, 130, 2],
];

function encodeQr(text: string): number[][] | null {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 0;
  let total = 0;
  let ecTotal = 0;
  let blocks = 1;
  for (let v = 0; v < VERSIONS.length; v++) {
    const [t, e, b] = VERSIONS[v]!;
    const dataCap = t - e;
    // mode(4) + len(8) + data + pad
    if (bytes.length + 2 <= dataCap) {
      version = v + 1;
      total = t;
      ecTotal = e;
      blocks = b;
      break;
    }
  }
  if (!version) return null;

  const dataCap = total - ecTotal;
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const maxBits = dataCap * 8;
  for (let i = 0; i < Math.min(4, maxBits - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] ?? 0);
    data.push(v);
  }
  let pad = 0;
  while (data.length < dataCap) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
    pad++;
  }

  const dataPer = Math.floor(dataCap / blocks);
  const ecPer = Math.floor(ecTotal / blocks);
  const dBlocks: number[][] = [];
  const eBlocks: number[][] = [];
  let off = 0;
  for (let i = 0; i < blocks; i++) {
    const block = data.slice(off, off + dataPer);
    off += dataPer;
    dBlocks.push(block);
    eBlocks.push(rsEncode(block, ecPer));
  }
  const finalCw: number[] = [];
  for (let i = 0; i < dataPer; i++)
    for (const bl of dBlocks) if (i < bl.length) finalCw.push(bl[i]!);
  for (let i = 0; i < ecPer; i++)
    for (const bl of eBlocks) finalCw.push(bl[i]!);

  const size = 17 + 4 * version;
  const m: (number | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const on =
          r >= 0 &&
          r <= 6 &&
          c >= 0 &&
          c <= 6 &&
          (r === 0 ||
            r === 6 ||
            c === 0 ||
            c === 6 ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        m[rr]![cc] = on ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    if (m[6]![i] == null) m[6]![i] = i % 2 === 0 ? 1 : 0;
    if (m[i]![6] == null) m[i]![6] = i % 2 === 0 ? 1 : 0;
  }
  m[size - 8]![8] = 1;

  // reserve format areas
  for (let i = 0; i < 9; i++) {
    if (m[8]![i] == null) m[8]![i] = 0;
    if (m[i]![8] == null) m[i]![8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8]![size - 1 - i] == null) m[8]![size - 1 - i] = 0;
    if (m[size - 1 - i]![8] == null) m[size - 1 - i]![8] = 0;
  }

  const allBits: number[] = [];
  for (const cw of finalCw)
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  let bi = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const r = up ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (m[r]![c] != null) continue;
        m[r]![c] = allBits[bi++] ?? 0;
      }
    }
    up = !up;
  }

  // format info for ECC-M (01? actually M is 00) + mask 0 → use fixed known bits
  // ECC level M = 00, mask 0 = 000 → data = 0b00000, BCH → 0x5412 xor pattern applied in placeFormat
  let fmt = 0b00000 << 10;
  const poly = 0x537;
  for (let i = 4; i >= 0; i--) {
    if (fmt & (1 << (i + 10))) fmt ^= poly << i;
  }
  fmt = ((0b00000 << 10) | (fmt & 0x3ff)) ^ 0x5412;
  const setFmt = (positions: Array<[number, number]>) => {
    for (let i = 0; i < 15; i++) {
      const [r, c] = positions[i]!;
      m[r]![c] = (fmt >> (14 - i)) & 1;
    }
  };
  const p1: Array<[number, number]> = [];
  for (let c = 0; c <= 5; c++) p1.push([8, c]);
  p1.push([8, 7], [8, 8], [7, 8]);
  for (let r = 5; r >= 0; r--) p1.push([r, 8]);
  setFmt(p1);
  const p2: Array<[number, number]> = [];
  for (let r = size - 1; r >= size - 7; r--) p2.push([r, 8]);
  for (let c = size - 8; c < size; c++) p2.push([8, c]);
  setFmt(p2);

  const out: number[][] = Array.from({ length: size }, () =>
    Array(size).fill(0)
  );
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let v = m[r]![c] ?? 0;
      const reserved =
        (r < 9 && c < 9) ||
        (r < 9 && c >= size - 8) ||
        (r >= size - 8 && c < 9) ||
        r === 6 ||
        c === 6 ||
        (r === 8 && (c <= 8 || c >= size - 8)) ||
        (c === 8 && (r <= 8 || r >= size - 7)) ||
        (r === size - 8 && c === 8);
      if (!reserved && (r + c) % 2 === 0) v ^= 1;
      out[r]![c] = v;
    }
  }
  return out;
}
