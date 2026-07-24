import {
  checkPasswordBreached,
  DEFAULT_PASSWORD_POLICY,
  evaluatePasswordPolicy,
  mergePolicy,
  type PasswordPolicy,
} from "@ops-vault/core";
import type { VaultRecordWithRecovery } from "@ops-vault/core";
import { Button, Input } from "@ops-vault/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

interface Props {
  vault: VaultRecordWithRecovery;
  onError: (msg: string) => void;
}

export function PrivacyPanel({ vault, onError }: Props) {
  const [autoLockMin, setAutoLockMin] = useState(() =>
    Number(localStorage.getItem("ops-vault.autoLockMin") ?? "15")
  );
  const [clipboardClear, setClipboardClear] = useState(
    () => localStorage.getItem("ops-vault.clipboardClear") !== "0"
  );
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);
  const [testPwd, setTestPwd] = useState("");
  const [leak, setLeak] = useState<{
    breached: boolean;
    count: number;
  } | null>(null);
  const [leakBusy, setLeakBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { policy: p } = await api.getPasswordPolicy();
      if (p) setPolicy(mergePolicy(p as Partial<PasswordPolicy>));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Load failed");
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, vault.id]);

  useEffect(() => {
    localStorage.setItem("ops-vault.autoLockMin", String(autoLockMin));
  }, [autoLockMin]);
  useEffect(() => {
    localStorage.setItem("ops-vault.clipboardClear", clipboardClear ? "1" : "0");
  }, [clipboardClear]);

  const policyResult = useMemo(
    () => evaluatePasswordPolicy(testPwd || " ", policy),
    [testPwd, policy]
  );

  async function savePolicy() {
    try {
      await api.setPasswordPolicy(policy as unknown as Record<string, unknown>);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Policy save failed");
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

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <h3 className="text-sm font-semibold">Session</h3>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="text-[var(--ov-muted)]">Auto-lock (min)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={autoLockMin}
            onChange={(e) => setAutoLockMin(Number(e.target.value))}
            className="w-20 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-2 py-1 text-right"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--ov-muted)]">
          Clear clipboard after copy
          <input
            type="checkbox"
            checked={clipboardClear}
            onChange={(e) => setClipboardClear(e.target.checked)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <h3 className="text-sm font-semibold">Password policy</h3>
        <label className="flex items-center justify-between text-sm">
          <span className="text-[var(--ov-muted)]">Min length</span>
          <input
            type="number"
            min={8}
            max={64}
            value={policy.minLength}
            onChange={(e) =>
              setPolicy((p) => ({ ...p, minLength: Number(e.target.value) }))
            }
            className="w-20 rounded border border-[var(--ov-border)] bg-[var(--ov-input)] px-2 py-1 text-right"
          />
        </label>
        {(
          [
            ["requireUppercase", "Uppercase"],
            ["requireLowercase", "Lowercase"],
            ["requireDigit", "Digit"],
            ["requireSymbol", "Symbol"],
            ["checkBreaches", "Breach check (HIBP)"],
            ["enforce", "Enforce on create"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center justify-between text-sm text-[var(--ov-muted)]"
          >
            {label}
            <input
              type="checkbox"
              checked={Boolean(policy[key])}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, [key]: e.target.checked }))
              }
            />
          </label>
        ))}
        <Button type="button" variant="secondary" onClick={() => void savePolicy()}>
          Save policy
        </Button>
      </div>

      <div
        id="privacy-breach-check"
        className="space-y-3 rounded-xl border-2 border-[var(--ov-accent)]/40 bg-[var(--ov-accent-soft)] p-5"
      >
        <h3 className="text-base font-semibold text-[var(--ov-fg)]">
          Breach check (HIBP)
        </h3>
        <p className="text-xs text-[var(--ov-muted)]">
          k-anonymity: only a SHA-1 prefix is sent — never the password itself.
        </p>
        <Input
          label="Password to test"
          type="password"
          value={testPwd}
          onChange={(e) => {
            setTestPwd(e.target.value);
            setLeak(null);
          }}
        />
        {testPwd && policyResult.violations.length > 0 && (
          <ul className="text-xs text-amber-600 dark:text-amber-400">
            {policyResult.violations.map((v) => (
              <li key={v.code}>{v.message}</li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          disabled={leakBusy || !testPwd}
          onClick={() => void runLeakCheck()}
        >
          {leakBusy ? "Checking…" : "Check for breaches"}
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
    </div>
  );
}
