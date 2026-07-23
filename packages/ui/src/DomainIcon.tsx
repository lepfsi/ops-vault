import { cn } from "./cn.js";

function monogram(host: string): string {
  const clean = host.replace(/^www\./, "");
  const parts = clean.split(".").filter(Boolean);
  if (parts.length >= 2) {
    const name = parts[parts.length - 2]!;
    return name.slice(0, 2).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || "??";
}

function hueFromHost(host: string): number {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) % 360;
  return h;
}

/**
 * Domain monogram badge (no external favicon network calls — avoids failed links).
 */
export function DomainIcon({
  host,
  className,
  size = 36,
}: {
  host?: string | null;
  className?: string;
  size?: number;
}) {
  const h = (host ?? "").replace(/^www\./, "") || "";

  if (!h) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-lg bg-[var(--ov-soft)] text-xs font-semibold text-[var(--ov-muted)]",
          className
        )}
        style={{ width: size, height: size }}
      >
        —
      </span>
    );
  }

  const letters = monogram(h);
  const hue = hueFromHost(h);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-[11px] font-bold tracking-wide text-white",
        className
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(145deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 50% 32%))`,
      }}
      title={h}
    >
      {letters}
    </span>
  );
}
