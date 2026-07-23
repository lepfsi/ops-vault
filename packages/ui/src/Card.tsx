import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5 text-[var(--ov-fg)] shadow-xl shadow-black/10",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      className={cn(
        "mb-1 text-lg font-medium text-[var(--ov-fg)]",
        className
      )}
    >
      {children}
    </h2>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("mb-4 text-sm text-[var(--ov-muted)]", className)}>
      {children}
    </p>
  );
}
