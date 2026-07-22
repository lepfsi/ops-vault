import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-60",
  secondary:
    "border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-60",
  ghost: "text-slate-300 hover:bg-slate-800/80 disabled:opacity-60",
  danger:
    "border border-red-900/60 text-red-300 hover:bg-red-950/40 disabled:opacity-60",
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
