import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--ov-accent)] text-white shadow-sm hover:bg-[var(--ov-accent-hover)] disabled:opacity-60",
  secondary:
    "border border-[var(--ov-accent)]/40 bg-[var(--ov-secondary-soft)] text-[var(--ov-secondary)] hover:bg-[var(--ov-accent-soft)] hover:border-[var(--ov-accent)] disabled:opacity-60 dark:text-[var(--ov-secondary-fg)]",
  ghost:
    "text-[var(--ov-muted)] hover:bg-[var(--ov-hover)] hover:text-[var(--ov-fg)] disabled:opacity-60",
  danger:
    "border border-red-500/40 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300 disabled:opacity-60",
};

export function Button({
  variant = "primary",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition",
        variants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
