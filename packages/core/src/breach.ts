import { sha1 } from "@noble/hashes/legacy.js";

/**
 * Have I Been Pwned — k-anonymity range API.
 * Only the first 5 hex chars of SHA-1 are sent; never the password itself.
 * @see https://haveibeenpwned.com/API/v3#PwnedPasswords
 */
export async function checkPasswordBreached(
  password: string,
  fetchImpl: typeof fetch = fetch
): Promise<{
  breached: boolean;
  count: number;
  /** First 5 hex of SHA-1 (safe to log). */
  prefix: string;
}> {
  const hashHex = toHex(sha1(new TextEncoder().encode(password))).toUpperCase();
  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  const res = await fetchImpl(
    `https://api.pwnedpasswords.com/range/${prefix}`,
    {
      headers: {
        "Add-Padding": "true",
        "User-Agent": "OpsVault-DailyOps",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`HIBP unavailable (${res.status})`);
  }
  const body = await res.text();
  const lines = body.split("\n");
  for (const line of lines) {
    const [suf, countStr] = line.trim().split(":");
    if (suf?.toUpperCase() === suffix) {
      return {
        breached: true,
        count: Number(countStr) || 0,
        prefix,
      };
    }
  }
  return { breached: false, count: 0, prefix };
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
