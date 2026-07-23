import { randomBytes } from "@noble/ciphers/utils.js";

export interface PasswordGenOptions {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  digits?: boolean;
  symbols?: boolean;
  /** Avoid ambiguous chars: 0OIl1 */
  avoidAmbiguous?: boolean;
}

const SETS = {
  uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  uppercaseAmb: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijkmnopqrstuvwxyz",
  lowercaseAmb: "abcdefghijklmnopqrstuvwxyz",
  digits: "23456789",
  digitsAmb: "0123456789",
  symbols: "!@#$%&*+-_=?",
};

/**
 * Cryptographically strong password generator (CSPRNG via @noble).
 */
export function generatePassword(opts: PasswordGenOptions = {}): string {
  const length = Math.min(128, Math.max(8, opts.length ?? 20));
  const upper = opts.uppercase !== false;
  const lower = opts.lowercase !== false;
  const digits = opts.digits !== false;
  const symbols = opts.symbols === true;
  const amb = opts.avoidAmbiguous !== false;

  let alphabet = "";
  const required: string[] = [];
  if (upper) {
    const s = amb ? SETS.uppercase : SETS.uppercaseAmb;
    alphabet += s;
    required.push(pick(s));
  }
  if (lower) {
    const s = amb ? SETS.lowercase : SETS.lowercaseAmb;
    alphabet += s;
    required.push(pick(s));
  }
  if (digits) {
    const s = amb ? SETS.digits : SETS.digitsAmb;
    alphabet += s;
    required.push(pick(s));
  }
  if (symbols) {
    alphabet += SETS.symbols;
    required.push(pick(SETS.symbols));
  }
  if (!alphabet) {
    throw new Error("At least one character set required");
  }

  const chars = [...required];
  while (chars.length < length) {
    chars.push(pick(alphabet));
  }
  // Fisher–Yates with CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

/** Entropy estimate (bits) for UI. */
export function estimatePasswordEntropy(
  password: string,
  opts: PasswordGenOptions = {}
): number {
  let pool = 0;
  if (opts.uppercase !== false) pool += 26;
  if (opts.lowercase !== false) pool += 26;
  if (opts.digits !== false) pool += 10;
  if (opts.symbols) pool += SETS.symbols.length;
  if (pool === 0) pool = 26;
  return Math.round(password.length * Math.log2(pool));
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

/**
 * Uniform integer in [0, max). Works for any max ≥ 1 (not only max ≤ 256).
 * Previous 1-byte rejection loop hung forever when max > 256 (e.g. usernames).
 */
function randomInt(max: number): number {
  if (!Number.isFinite(max) || max <= 1) return 0;
  const m = Math.floor(max);
  // Number of random bits needed
  let bits = 1;
  while (2 ** bits < m) bits++;
  const bytes = Math.ceil(bits / 8);
  const range = 2 ** (bytes * 8);
  const limit = range - (range % m);
  // Rejection sampling — always terminates when limit > 0 (m ≥ 1)
  for (;;) {
    const buf = randomBytes(bytes);
    let x = 0;
    for (let i = 0; i < bytes; i++) {
      x = (x << 8) | (buf[i] ?? 0);
    }
    // Use unsigned 32-bit ops for small byte counts
    x = x >>> 0;
    if (x < limit) return x % m;
  }
}

const EFF_WORDS = [
  "alpha", "anchor", "autumn", "badge", "bamboo", "beacon", "blizzard",
  "bronze", "canyon", "cedar", "cipher", "cobalt", "comet", "coral",
  "delta", "ember", "falcon", "forest", "glacier", "harbor", "horizon",
  "ivory", "jade", "kernel", "lagoon", "lantern", "maple", "meadow",
  "nebula", "nickel", "nova", "ocean", "onyx", "orchid", "otter",
  "pine", "plasma", "quartz", "raven", "river", "sable", "sapphire",
  "shadow", "sierra", "silver", "solar", "spark", "stone", "summit",
  "thunder", "tide", "timber", "ultra", "valley", "velvet", "vertex",
  "violet", "volt", "willow", "winter", "xenon", "yellow", "zenith",
  "azure", "brisk", "crisp", "dusk", "echo", "flint", "grove", "haze",
  "iris", "jolt", "kite", "lunar", "mint", "north", "orbit", "prism",
  "quest", "ridge", "swift", "torch", "umbra", "vapor", "wave", "zephyr",
];

export interface PassphraseOptions {
  words?: number;
  separator?: string;
  capitalize?: boolean;
  numberSuffix?: boolean;
}

/** Diceware-style passphrase (local wordlist, CSPRNG). */
export function generatePassphrase(opts: PassphraseOptions = {}): string {
  const n = Math.min(12, Math.max(3, opts.words ?? 5));
  const sep = opts.separator ?? "-";
  const words: string[] = [];
  for (let i = 0; i < n; i++) {
    let w = EFF_WORDS[randomInt(EFF_WORDS.length)]!;
    if (opts.capitalize !== false) {
      w = w.charAt(0).toUpperCase() + w.slice(1);
    }
    words.push(w);
  }
  let out = words.join(sep);
  if (opts.numberSuffix !== false) {
    out += sep + String(10 + randomInt(90));
  }
  return out;
}

export type UsernameStyle = "name.num" | "word_num" | "emailish" | "handle";

export interface UsernameOptions {
  style?: UsernameStyle;
  base?: string;
}

/** Random usernames for account creation. */
export function generateUsername(opts: UsernameOptions = {}): string {
  const style = opts.style ?? "handle";
  const base =
    (opts.base?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ||
      EFF_WORDS[randomInt(EFF_WORDS.length)]!) +
    EFF_WORDS[randomInt(EFF_WORDS.length)]!;
  const num = 10 + randomInt(990);
  switch (style) {
    case "name.num":
      return `${base.slice(0, 8)}.${num}`;
    case "word_num":
      return `${EFF_WORDS[randomInt(EFF_WORDS.length)]}_${num}`;
    case "emailish":
      return `${EFF_WORDS[randomInt(EFF_WORDS.length)]}${num}`;
    default:
      return `${base.slice(0, 10)}${num}`;
  }
}

export function estimatePassphraseEntropy(wordCount: number): number {
  const bitsPerWord = Math.log2(EFF_WORDS.length);
  return Math.round(wordCount * bitsPerWord + Math.log2(90));
}
