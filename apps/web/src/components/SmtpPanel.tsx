import { Button, Input } from "@ops-vault/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../lib/api";

interface Props {
  onError: (msg: string) => void;
}

/**
 * Per-vault SMTP for share notification emails (Settings → Mail).
 */
export function SmtpPanel({ onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [envFallback, setEnvFallback] = useState<{
    configured: boolean;
    host: string | null;
    from: string | null;
  } | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [testTo, setTestTo] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSmtpSettings();
      setEnabled(data.smtp.enabled);
      setHost(data.smtp.host);
      setPort(String(data.smtp.port || 587));
      setSecure(data.smtp.secure);
      setUser(data.smtp.user);
      setFrom(data.smtp.from);
      setHasPassword(data.smtp.hasPassword);
      setPass("");
      setEnvFallback(data.envFallback);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load SMTP");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setInfo(null);
    try {
      const { smtp } = await api.putSmtpSettings({
        enabled,
        host: host.trim(),
        port: Number(port) || 587,
        secure: secure || Number(port) === 465,
        user: user.trim(),
        // empty = keep existing password on server
        pass: pass.length > 0 ? pass : undefined,
        from: from.trim() || user.trim(),
      });
      setHasPassword(smtp.hasPassword);
      setPass("");
      setInfo("SMTP settings saved");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function clearSmtp() {
    if (!confirm("Remove vault SMTP settings? Env fallback may still apply.")) {
      return;
    }
    setBusy(true);
    setInfo(null);
    try {
      await api.putSmtpSettings({ clear: true });
      setEnabled(false);
      setHost("");
      setPort("587");
      setSecure(false);
      setUser("");
      setPass("");
      setFrom("");
      setHasPassword(false);
      setInfo("SMTP cleared for this vault");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setInfo(null);
    try {
      const res = await api.testSmtp(testTo.trim() || undefined);
      setInfo(`Test email sent to ${res.to}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-sm text-[var(--ov-fg)]";

  if (loading) {
    return (
      <p className="text-sm text-[var(--ov-muted)]">Loading mail settings…</p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-[var(--ov-fg)]">
          Outbound mail (SMTP)
        </h3>
        <p className="mt-1 text-sm text-[var(--ov-muted)]">
          Used when you create a share with a recipient email. Credentials are
          stored on the server for this vault (not inside the zero-knowledge
          blob). Leave password blank when saving to keep the current one.
        </p>
      </div>

      {envFallback?.configured && (
        <div className="rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] px-3 py-2 text-xs text-[var(--ov-muted)]">
          Server env fallback active
          {envFallback.host ? ` · ${envFallback.host}` : ""}
          {envFallback.from ? ` · from ${envFallback.from}` : ""}. Vault settings
          below take priority when enabled.
        </div>
      )}

      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-[var(--ov-border)]"
          />
          <span>Enable SMTP for this vault</span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[var(--ov-muted)]">Host</span>
            <input
              className={field}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.example.com"
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ov-muted)]">Port</span>
            <input
              className={field}
              value={port}
              onChange={(e) => {
                setPort(e.target.value);
                if (e.target.value === "465") setSecure(true);
              }}
              placeholder="587"
              inputMode="numeric"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              className="rounded border-[var(--ov-border)]"
            />
            <span>TLS/SSL (port 465)</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ov-muted)]">Username</span>
            <input
              className={field}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ov-muted)]">
              Password
              {hasPassword && !pass && (
                <span className="ml-1 text-[var(--ov-faint)]">
                  (saved — leave blank to keep)
                </span>
              )}
            </span>
            <input
              className={field}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder={hasPassword ? "••••••••" : ""}
              autoComplete="new-password"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-[var(--ov-muted)]">From</span>
            <input
              className={field}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="OpsVault <noreply@example.com>"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" disabled={busy}>
            {busy ? "…" : "Save SMTP"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void clearSmtp()}
          >
            Clear
          </Button>
        </div>
      </form>

      <div className="space-y-2 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)] p-4">
        <p className="text-sm font-medium">Send test email</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              type="email"
              placeholder="you@company.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void sendTest()}
          >
            Send test
          </Button>
        </div>
        <p className="text-[11px] text-[var(--ov-faint)]">
          Uses saved settings (save first). Falls back to account email if empty.
        </p>
      </div>

      {info && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}
    </div>
  );
}
