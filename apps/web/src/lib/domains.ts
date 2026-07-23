import type { SecretMeta } from "@ops-vault/core";
import { displayHost, toBrowseUrl } from "./url";

/** Unique hosts stored on password-type secrets. */
export function knownPasswordHosts(items: SecretMeta[]): string[] {
  const set = new Set<string>();
  for (const it of items) {
    if (it.type !== "password") continue;
    const h = displayHost(it.url);
    if (h) set.add(h.toLowerCase());
  }
  return [...set].sort();
}

/** Secrets that match a site host (exact or registrable parent). */
export function secretsForHost(
  items: SecretMeta[],
  host: string
): SecretMeta[] {
  const h = host.replace(/^www\./, "").toLowerCase();
  if (!h) return [];
  return items.filter((it) => {
    if (it.type !== "password" || !it.url) return false;
    const itemHost = displayHost(it.url)?.toLowerCase();
    if (!itemHost) return false;
    return itemHost === h || itemHost.endsWith(`.${h}`) || h.endsWith(`.${itemHost}`);
  });
}

/**
 * Parse a URL or host string the user is visiting.
 * Foundation for future browser-extension autofill.
 */
export function normalizeVisitHost(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  try {
    return new URL(toBrowseUrl(t)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return t.replace(/^www\./, "").toLowerCase() || null;
  }
}

export type LoginSuggestMode = "fill" | "save" | "none";

/**
 * Heuristic for login UX:
 * - known domain → offer fill
 * - unknown domain with typed password → offer save
 */
export function loginSuggestMode(
  host: string | null,
  known: string[],
  typedPasswordLength: number
): LoginSuggestMode {
  if (!host) return typedPasswordLength >= 8 ? "save" : "none";
  const hit = known.some(
    (k) => k === host || host.endsWith(`.${k}`) || k.endsWith(`.${host}`)
  );
  if (hit) return "fill";
  if (typedPasswordLength >= 8) return "save";
  return "none";
}
