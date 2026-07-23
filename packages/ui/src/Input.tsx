import type { InputHTMLAttributes } from "react";
import { cn } from "./cn.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Theme-token form control — no hardcoded white/slate light surfaces. */
export function Input({ label, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <label className="block text-sm">
      {label && (
        <span className="mb-1.5 block text-[var(--ov-muted)]">{label}</span>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2.5 text-sm text-[var(--ov-fg)] outline-none ring-[var(--ov-accent-ring)] placeholder:text-[var(--ov-faint)] focus:border-[var(--ov-accent)]/50 focus:ring-2",
          "disabled:opacity-60",
          "scheme-only-dark:color-scheme:dark",
          className
        )}
        {...rest}
      />
    </label>
  );
}
