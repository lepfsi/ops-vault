import {
  estimatePasswordEntropy,
  generatePassword,
  type PasswordGenOptions,
} from "@ops-vault/core";
import { Button, IconCopy } from "@ops-vault/ui";
import { useMemo, useState } from "react";

interface Props {
  onUse: (password: string) => void;
  compact?: boolean;
}

export function PasswordGenerator({ onUse, compact }: Props) {
  const [opts, setOpts] = useState<PasswordGenOptions>({
    length: 20,
    uppercase: true,
    lowercase: true,
    digits: true,
    symbols: true,
    avoidAmbiguous: true,
  });
  const [value, setValue] = useState(() =>
    generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
      avoidAmbiguous: true,
    })
  );
  const [copied, setCopied] = useState(false);

  const entropy = useMemo(
    () => estimatePasswordEntropy(value, opts),
    [value, opts]
  );

  function regen(next?: PasswordGenOptions) {
    const o = next ?? opts;
    setValue(generatePassword(o));
    setCopied(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      className={
        compact
          ? "space-y-2 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] p-3"
          : "space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)] p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ov-muted)]">
          Générateur
        </p>
        <span className="text-[11px] tabular-nums text-[var(--ov-faint)]">
          ~{entropy} bits
        </span>
      </div>

      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-[var(--ov-border)] bg-[var(--ov-input)] px-2.5 py-2 font-mono text-sm">
          {value}
        </code>
        <Button type="button" variant="ghost" onClick={() => void copy()}>
          <IconCopy className="h-4 w-4" />
        </Button>
      </div>

      <label className="block text-xs text-[var(--ov-muted)]">
        Longueur · {opts.length}
        <input
          type="range"
          min={12}
          max={48}
          value={opts.length ?? 20}
          onChange={(e) => {
            const length = Number(e.target.value);
            const next = { ...opts, length };
            setOpts(next);
            regen(next);
          }}
          className="mt-1 w-full"
        />
      </label>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--ov-muted)]">
        {(
          [
            ["uppercase", "A-Z"],
            ["lowercase", "a-z"],
            ["digits", "0-9"],
            ["symbols", "#$%"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={Boolean(opts[key])}
              onChange={(e) => {
                const next = { ...opts, [key]: e.target.checked };
                setOpts(next);
                try {
                  regen(next);
                } catch {
                  /* need at least one set */
                }
              }}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => regen()}>
          Régénérer
        </Button>
        <Button type="button" onClick={() => onUse(value)}>
          Utiliser
        </Button>
        {copied && (
          <span className="self-center text-xs text-emerald-600 dark:text-emerald-400">
            Copié
          </span>
        )}
      </div>
    </div>
  );
}
