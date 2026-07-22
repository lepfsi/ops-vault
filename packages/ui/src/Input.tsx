import type { InputHTMLAttributes } from "react";
import { cn } from "./cn.js";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, id, ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <label className="block text-sm">
      {label && (
        <span className="mb-1.5 block text-slate-300">{label}</span>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none ring-cyan-500/40 placeholder:text-slate-600 focus:ring-2",
          className
        )}
        {...rest}
      />
    </label>
  );
}
