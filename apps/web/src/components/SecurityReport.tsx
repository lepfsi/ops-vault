import {
  checkPasswordBreached,
  decryptPayload,
  evaluatePasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
  type MasterKey,
  type PasswordPayload,
} from "@ops-vault/core";
import { Button, Input } from "@ops-vault/ui";
import {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import * as api from "../lib/api";

export type SecurityReportHandle = {
  runScan: () => void;
  focus: () => void;
};

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

export const SecurityReport = forwardRef<SecurityReportHandle, Props>(
  function SecurityReport({ masterKey, onError, onOpenSecret }, ref) {
    const [busy, setBusy] = useState(false);
    const [findings, setFindings] = useState<Finding[] | null>(null);
    const [scanned, setScanned] = useState(0);
    const [testPwd, setTestPwd] = useState("");
    const [leak, setLeak] = useState<{
      breached: boolean;
      count: number;
    } | null>(null);
    const [leakBusy, setLeakBusy] = useState(false);
    const [highlight, setHighlight] = useState(false);

    async function runScan() {
      setBusy(true);
      setFindings(null);
      setHighlight(true);
      window.setTimeout(() => setHighlight(false), 2000);
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
              issues.push(v.message);
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

    async function runLeakCheck() {
      if (!testPwd) return;
      setLeakBusy(true);
      setLeak(null);
      try {
        const r = await checkPasswordBreached(testPwd);
        setLeak({ breached: r.breached, count: r.count });
      } catch (err) {
        onError(err instanceof Error ? err.message : "HIBP failed");
      } finally {
        setLeakBusy(false);
      }
    }

    useImperativeHandle(ref, () => ({
      runScan: () => void runScan(),
      focus: () => {
        setHighlight(true);
        window.setTimeout(() => setHighlight(false), 2000);
      },
    }));

    const critical =
      findings?.filter((f) => f.severity === "critical").length ?? 0;
    const warn = findings?.filter((f) => f.severity === "warn").length ?? 0;
    const ok = findings?.filter((f) => f.severity === "ok").length ?? 0;
    const policyResult = evaluatePasswordPolicy(
      testPwd || " ",
      DEFAULT_PASSWORD_POLICY
    );

    return (
      <div
        id="password-health-report"
        className={`space-y-4 rounded-xl border p-5 transition ${
          highlight
            ? "border-[var(--ov-accent)] bg-[var(--ov-accent-soft)] ring-2 ring-[var(--ov-accent-ring)]"
            : "border-[var(--ov-border)] bg-[var(--ov-panel)]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--ov-fg)]">
              Breach check & password health
            </h3>
            <p className="mt-0.5 text-xs text-[var(--ov-muted)]">
              Quick HIBP test or full vault scan. Ciphertexts stay local.
            </p>
          </div>
          <Button type="button" disabled={busy} onClick={() => void runScan()}>
            {busy ? `Scanning… ${scanned}` : "Run full vault scan"}
          </Button>
        </div>

        {/* Single-password HIBP tester */}
        <div className="space-y-2 rounded-lg border border-[var(--ov-accent)]/30 bg-[var(--ov-soft)] p-4">
          <p className="text-sm font-medium text-[var(--ov-fg)]">
            Quick breach check
          </p>
          <Input
            label="Test any password"
            type="password"
            value={testPwd}
            onChange={(e) => {
              setTestPwd(e.target.value);
              setLeak(null);
            }}
            placeholder="Paste or type a password"
          />
          {testPwd && policyResult.violations.length > 0 && (
            <ul className="text-xs text-amber-600 dark:text-amber-400">
              {policyResult.violations.map((v) => (
                <li key={v.code}>· {v.message}</li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={leakBusy || !testPwd}
            onClick={() => void runLeakCheck()}
          >
            {leakBusy ? "Checking…" : "Check HIBP"}
          </Button>
          {leak && (
            <p
              className={
                leak.breached
                  ? "text-sm font-medium text-red-600 dark:text-red-400"
                  : "text-sm font-medium text-emerald-600 dark:text-emerald-400"
              }
            >
              {leak.breached
                ? `Exposed in ${leak.count.toLocaleString()} known breaches — do not use`
                : "Not found in known breaches"}
            </p>
          )}
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
);

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
