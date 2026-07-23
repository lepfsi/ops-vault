import type { SVGProps } from "react";
import { cn } from "./cn.js";

/**
 * OpsVault official mark — Version 1
 * Inline colors (no Tailwind dependency) so the logo always renders.
 */
export function OpsVaultLogo({
  className,
  title = "OpsVault",
  ...rest
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8 shrink-0", className)}
      role="img"
      aria-label={title}
      {...rest}
    >
      <title>{title}</title>
      <path
        d="M20 3.5L33 8.2v9.4c0 7.8-5.1 13.6-13 16.4C12.1 31.2 7 25.4 7 17.6V8.2L20 3.5z"
        fill="#0891b2"
      />
      <path
        d="M20 6.2L30.2 9.9v7.5c0 6.2-4 10.9-10.2 13.3C13.8 28.3 9.8 23.6 9.8 17.4V9.9L20 6.2z"
        fill="#22d3ee"
        fillOpacity="0.35"
      />
      <circle cx="20" cy="16.5" r="3.2" fill="#f8fafc" />
      <path d="M18.4 18.8h3.2L22.4 26h-4.8L18.4 18.8z" fill="#f8fafc" />
    </svg>
  );
}

export function OpsVaultWordmark({
  className,
  showMark = true,
}: {
  className?: string;
  showMark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showMark && <OpsVaultLogo className="h-7 w-7" />}
      <span className="text-lg font-semibold tracking-tight text-[var(--ov-fg,#e8eef5)]">
        Ops
        <span style={{ color: "#0891b2" }}>Vault</span>
        <span className="ml-1.5 text-[10px] font-normal opacity-50">v1</span>
      </span>
    </span>
  );
}
