import { OpsVaultLogo } from "@ops-vault/ui";
import type { ReactNode } from "react";

export function LockScreen({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--ov-bg)] px-4 py-10 text-[var(--ov-fg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(8,145,178,0.08),_transparent_50%)]"
      />

      <div className="relative mb-8 flex flex-col items-center text-center">
        <OpsVaultLogo className="h-12 w-12" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          OpsVault
        </h1>
      </div>

      <div className="relative w-full max-w-sm">{children}</div>

      {footer && (
        <div className="relative mt-6 w-full max-w-md text-center text-xs text-[var(--ov-faint)]">
          {footer}
        </div>
      )}
    </div>
  );
}
