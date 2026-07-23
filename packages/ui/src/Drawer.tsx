import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "./cn.js";
import { IconClose } from "./Icons.js";

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  widthClass = "w-full max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-[101] flex h-full max-h-dvh flex-col border-l border-[var(--ov-border)] bg-[var(--ov-panel)] shadow-2xl",
          widthClass
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--ov-border)] px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-base font-semibold text-[var(--ov-fg)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-[var(--ov-muted)]">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ov-muted)] transition hover:bg-[var(--ov-hover)] hover:text-[var(--ov-fg)]"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer && (
          <footer className="shrink-0 border-t border-[var(--ov-border)] px-5 py-3">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
