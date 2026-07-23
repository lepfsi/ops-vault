/** Ensure a clickable absolute URL for open-in-browser. */
export function toBrowseUrl(url: string): string {
  const t = url.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(t)) return `https://${t}`;
  return t;
}

/** Hostname for list display. */
export function displayHost(url?: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(toBrowseUrl(url));
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || url;
  }
}
