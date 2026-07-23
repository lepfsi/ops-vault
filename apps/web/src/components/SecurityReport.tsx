import {
  checkPasswordBreached,
  decryptPayload,
  evaluatePasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
  type MasterKey,
  type PasswordPayload,
} from "@ops-vault/core";
import { Button } from "@ops-vault/ui";
import { useState } from "react";
import * as api from "../lib/api";

interface Props {
  masterKey: MasterKey;
  onError: (msg: string) => void;
  onOpenSecret?: (id: string) => void;
}

type Finding = {
  id: string;
  title: string;
  host?: string | null;
  issues: string[];
  severity: "critical" | "warn" | "ok";
};

export function SecurityReport({ masterKey, onError, onOpenSecret }: Props) {
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [scanned, setScanned] = useState(0);

  async function run() {
    setBusy(true);
    setFindings(null);
    try {
      const { items } = await api.listSecrets();
      const passwords = items.filter((i) => i.type === "password");
      const out: Finding[] = [];
      let n = 0;
      for (const meta of passwords) {
        n++;
        setScanned(n);
        try {
          const full = await api.getSecret(meta.id);
          const p = (await decryptPayload(
            full.encryptedData,
            masterKey
          )) as PasswordPayload;
          const issues: string[] = [];
          const pol = evaluatePasswordPolicy(
            p.password || "",
            DEFAULT_PASSWORD_POLICY
          );
          for (const v of pol.violations) {
            if (v.severity === "error") issues.push(v.message);
            else issues.push(v.message);
          }
          if ((p.password?.length ?? 0) < 12) {
            if (!issues.some((m) => m.toLowerCase().includes("length"))) {
              issues.push("Shorter than 12 characters");
            }
          }
          try {
            const br = await checkPasswordBreached(p.password || "");
            if (br.breached) {
              issues.push(
                `Exposed in ${br.count.toLocaleString()} known breach(es) (HIBP)`
              );
            }
          } catch {
            /* network optional */
          }
          out.push({
            id: meta.id,
            title: meta.title,
            host: meta.url,
            issues,
            severity: issues.some((i) => i.includes("Exposed"))
              ? "critical"
              : issues.length
                ? "warn"
                : "ok",
          });
        } catch {
          out.push({
            id: meta.id,
            title: meta.title,
            host: meta.url,
            issues: ["Could not decrypt / analyze"],
            severity: "warn",
          });
        }
      }
      out.sort((a, b) => {
        const rank = { critical: 0, warn: 1, ok: 2 };
        return rank[a.severity] - rank[b.severity];
      });
      setFindings(out);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  const critical = findings?.filter((f) => f.severity === "critical").length ?? 0;
  const warn = findings?.filter((f) => f.severity === "warn").length ?? 0;
  const ok = findings?.filter((f) => f.severity === "ok").length ?? 0;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ov-fg)]">
            Password health report
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ov-muted)]">
            Local policy + Have I Been Pwned (k-anonymity). Ciphertexts never
            leave decrypted beyond this browser.
          </p>
        </div>
        <Button type="button" disabled={busy} onClick={() => void run()}>
          {busy ? `Scanning… ${scanned}` : "Run full scan"}
        </Button>
      </div>

      {findings && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Exposed" value={critical} tone="critical" />
            <Stat label="Weak / policy" value={warn} tone="warn" />
            <Stat label="Healthy" value={ok} tone="ok" />
          </div>
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {findings.map((f) => (
              <li
                key={f.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  f.severity === "critical"
                    ? "border-red-500/40 bg-red-500/10"
                    : f.severity === "warn"
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-[var(--ov-border)] bg-[var(--ov-soft)]"
                }`}
              >
                <button
                  type="button"
                  className="font-medium text-[var(--ov-fg)] hover:underline"
                  onClick={() => onOpenSecret?.(f.id)}
                >
                  {f.title}
                </button>
                {f.issues.length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    No issues detected
                  </p>
                ) : (
                  <ul className="mt-1 text-xs text-[var(--ov-muted)]">
                    {f.issues.map((i) => (
                      <li key={i}>· {i}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "critical" | "warn" | "ok";
}) {
  const color =
    tone === "critical"
      ? "text-red-600 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
  return (
    <div className="rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] px-3 py-2">
      <p className="text-[10px] uppercase text-[var(--ov-faint)]">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
