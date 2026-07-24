import {
  bytesToBase64,
  rotateMasterPassword,
  wipeKey,
  type MasterKey,
} from "@ops-vault/core";
import {
  Button,
  IconDevice,
  IconFingerprint,
  IconShield,
  IconUsers,
} from "@ops-vault/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../lib/api";
import type { AuditEvent } from "../lib/api";
import { qrDataUrl as clientQrDataUrl } from "../lib/qrcode";

interface Props {
  masterKey: MasterKey;
  onRekeyed: (newKey: MasterKey) => void;
  onError: (msg: string) => void;
}

type TrustedContact = {
  name: string;
  email: string;
  status: "pending" | "active";
  addedAt: string;
};

type DeviceSession = {
  id: string;
  label: string;
  lastSeen: string;
  current: boolean;
};

const TC_KEY = "ops-vault.trustedContact";
const SESS_KEY = "ops-vault.deviceSessions";

function loadTrusted(): TrustedContact | null {
  try {
    const raw = localStorage.getItem(TC_KEY);
    return raw ? (JSON.parse(raw) as TrustedContact) : null;
  } catch {
    return null;
  }
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows browser";
  if (/Mac/i.test(ua)) return "macOS browser";
  if (/Linux/i.test(ua)) return "Linux browser";
  return "This browser";
}

function ensureSession(): DeviceSession[] {
  let list: DeviceSession[] = [];
  try {
    const raw = localStorage.getItem(SESS_KEY);
    if (raw) list = JSON.parse(raw) as DeviceSession[];
  } catch {
    list = [];
  }
  const id =
    localStorage.getItem("ops-vault.deviceId") ||
    crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  localStorage.setItem("ops-vault.deviceId", id);
  const now = new Date().toISOString();
  const existing = list.find((s) => s.id === id);
  if (existing) {
    existing.lastSeen = now;
    existing.current = true;
    existing.label = deviceLabel();
    list = list.map((s) => ({ ...s, current: s.id === id }));
  } else {
    list = [
      { id, label: deviceLabel(), lastSeen: now, current: true },
      ...list.map((s) => ({ ...s, current: false })),
    ].slice(0, 8);
  }
  localStorage.setItem(SESS_KEY, JSON.stringify(list));
  return list;
}

export function SecurityPanel({ masterKey, onRekeyed, onError }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [sum, setSum] = useState<{
    unlockOk: number;
    unlockFail: number;
    exports: number;
    rekeys: number;
  } | null>(null);

  const [tcName, setTcName] = useState("");
  const [tcEmail, setTcEmail] = useState("");
  const [trusted, setTrusted] = useState<TrustedContact | null>(() =>
    loadTrusted()
  );
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [tfEnabled, setTfEnabled] = useState(false);
  const [tfRecoveryLeft, setTfRecoveryLeft] = useState(0);
  const [tfSetup, setTfSetup] = useState<{
    secret: string;
    otpauthUri: string;
    qrDataUrl: string | null;
  } | null>(null);
  const [tfCode, setTfCode] = useState("");
  const [tfBusy, setTfBusy] = useState(false);
  /** Shown once after enable — user must save these. */
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [passkeyNote, setPasskeyNote] = useState(
    () => localStorage.getItem("ops-vault.passkey.note") ?? ""
  );

  const load = useCallback(async () => {
    try {
      const [data, tf] = await Promise.all([
        api.getAudit(30),
        api.getTwoFactorStatus().catch(() => ({
          enabled: false,
          configured: false,
        })),
      ]);
      setEvents(data.events);
      setSum({
        unlockOk: data.summary.unlockOk,
        unlockFail: data.summary.unlockFail,
        exports: data.summary.exports,
        rekeys: data.summary.rekeys,
      });
      setTfEnabled(tf.enabled);
      setTfRecoveryLeft(tf.recoveryRemaining ?? 0);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Audit failed");
    }
  }, [onError]);

  useEffect(() => {
    void load();
    setSessions(ensureSession());
  }, [load]);

  async function start2faSetup() {
    setTfBusy(true);
    setInfo(null);
    setRecoveryCodes(null);
    try {
      const s = await api.setupTwoFactor();
      const qr =
        s.qrDataUrl ||
        clientQrDataUrl(s.otpauthUri) ||
        null;
      setTfSetup({
        secret: s.secret,
        otpauthUri: s.otpauthUri,
        qrDataUrl: qr,
      });
      setTfCode("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "2FA setup failed");
    } finally {
      setTfBusy(false);
    }
  }

  async function confirm2faEnable() {
    setTfBusy(true);
    setInfo(null);
    try {
      const res = await api.enableTwoFactor(tfCode.trim());
      setTfEnabled(true);
      setTfSetup(null);
      setTfCode("");
      setRecoveryCodes(res.recoveryCodes ?? []);
      setTfRecoveryLeft(res.recoveryCodes?.length ?? 0);
      setInfo(
        "Two-factor enabled. Save the recovery codes below — they are shown only once."
      );
      localStorage.removeItem("ops-vault.2fa.enabled");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setTfBusy(false);
    }
  }

  async function confirm2faDisable() {
    setTfBusy(true);
    setInfo(null);
    try {
      await api.disableTwoFactor(tfCode.trim());
      setTfEnabled(false);
      setTfSetup(null);
      setTfCode("");
      setRecoveryCodes(null);
      setTfRecoveryLeft(0);
      setInfo("Two-factor authentication disabled");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Disable failed");
    } finally {
      setTfBusy(false);
    }
  }

  function downloadRecoveryCodes(codes: string[]) {
    const body = [
      "OpsVault 2FA recovery codes",
      "Each code works once (unlock or disable 2FA).",
      "",
      ...codes,
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opsvault-2fa-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRotate(e: FormEvent) {
    e.preventDefault();
    if (newPass !== confirm || newPass.length < 8) return;
    setBusy(true);
    setInfo(null);
    try {
      const secrets = await api.listSecretsFull();
      const { auth, secrets: rotated } = await rotateMasterPassword(
        masterKey,
        newPass,
        secrets
      );
      await api.rekeyVault({
        vaultId: api.getActiveVaultId() ?? undefined,
        salt: bytesToBase64(auth.salt),
        verifier: auth.verifier,
        secrets: rotated,
        clearRecovery: true,
      });
      wipeKey(masterKey);
      onRekeyed(auth.key);
      setNewPass("");
      setConfirm("");
      setInfo("Master password updated. Reconfigure recovery key.");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Rotation failed");
    } finally {
      setBusy(false);
    }
  }

  function saveTrusted(e: FormEvent) {
    e.preventDefault();
    if (!tcEmail.includes("@")) return;
    const next: TrustedContact = {
      name: tcName.trim() || "Trusted contact",
      email: tcEmail.trim().toLowerCase(),
      status: "pending",
      addedAt: new Date().toISOString(),
    };
    localStorage.setItem(TC_KEY, JSON.stringify(next));
    setTrusted(next);
    setInfo("Saved locally as a contact reminder only.");
  }

  function clearTrusted() {
    localStorage.removeItem(TC_KEY);
    setTrusted(null);
  }

  function revokeSession(id: string) {
    const next = sessions.filter((s) => s.id !== id);
    localStorage.setItem(SESS_KEY, JSON.stringify(next));
    setSessions(next);
  }

  const field =
    "w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-sm text-[var(--ov-fg)] outline-none focus:ring-2 ring-[var(--ov-accent-ring)]";

  return (
    <div className="space-y-5">
      {sum && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Unlock OK", sum.unlockOk],
              ["Unlock fail", sum.unlockFail],
              ["Exports", sum.exports],
              ["Rekeys", sum.rekeys],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] px-3 py-2"
            >
              <p className="text-[10px] uppercase text-[var(--ov-faint)]">
                {label}
              </p>
              <p className="text-lg font-semibold">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Trusted contact */}
      <section className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <div className="flex items-center gap-2">
          <IconUsers className="h-4 w-4 text-[var(--ov-accent)]" />
          <h3 className="text-sm font-semibold">Trusted contact</h3>
        </div>
        <p className="text-xs text-[var(--ov-muted)]">
          Local reminder of who can help you offline. This is not a remote
          recovery path — use a recovery key or sealed backup to regain access.
        </p>
        {trusted ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--ov-soft)] px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{trusted.name}</p>
              <p className="text-xs text-[var(--ov-muted)]">
                {trusted.email} · {trusted.status}
              </p>
            </div>
            <Button type="button" variant="ghost" onClick={clearTrusted}>
              Remove
            </Button>
          </div>
        ) : (
          <form onSubmit={saveTrusted} className="grid gap-2 sm:grid-cols-2">
            <input
              className={field}
              placeholder="Name"
              value={tcName}
              onChange={(e) => setTcName(e.target.value)}
            />
            <input
              className={field}
              type="email"
              placeholder="email@example.com"
              value={tcEmail}
              onChange={(e) => setTcEmail(e.target.value)}
              required
            />
            <Button type="submit" className="sm:col-span-2 sm:w-fit">
              Add trusted contact
            </Button>
          </form>
        )}
      </section>

      {/* 2FA / Passkey */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
          <div className="flex items-center gap-2">
            <IconShield className="h-4 w-4 text-[var(--ov-accent)]" />
            <h3 className="text-sm font-semibold">Two-factor (TOTP)</h3>
          </div>
          <p className="text-xs text-[var(--ov-muted)]">
            After master password, scan the QR code (or enter the secret) in
            Google Authenticator, Authy, 1Password, etc.
          </p>

          {recoveryCodes && recoveryCodes.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                Save these recovery codes now (shown once)
              </p>
              <p className="text-[11px] text-[var(--ov-muted)]">
                If you lose your phone, use one of these codes to unlock or to
                disable 2FA. Each code works only once.
              </p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
                {recoveryCodes.map((c) => (
                  <li key={c} className="rounded bg-[var(--ov-soft)] px-2 py-1">
                    {c}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void navigator.clipboard.writeText(recoveryCodes.join("\n"))
                  }
                >
                  Copy all
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => downloadRecoveryCodes(recoveryCodes)}
                >
                  Download .txt
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRecoveryCodes(null)}
                >
                  I saved them
                </Button>
              </div>
            </div>
          )}

          {tfEnabled ? (
            <div className="space-y-2">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Enabled — required at unlock
                {tfRecoveryLeft > 0 && (
                  <span className="ml-1 text-xs text-[var(--ov-muted)]">
                    · {tfRecoveryLeft} recovery code
                    {tfRecoveryLeft === 1 ? "" : "s"} left
                  </span>
                )}
              </p>
              <p className="text-[11px] text-[var(--ov-muted)]">
                To disable: enter a <strong>recovery code</strong> (XXXX-XXXX)
                from when you enabled 2FA, or a current 6-digit app code.
              </p>
              <input
                className={field}
                placeholder="Recovery code or 6-digit TOTP"
                value={tfCode}
                onChange={(e) => setTfCode(e.target.value)}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="danger"
                disabled={tfBusy || tfCode.trim().length < 6}
                onClick={() => void confirm2faDisable()}
              >
                {tfBusy ? "…" : "Disable 2FA"}
              </Button>
            </div>
          ) : tfSetup ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--ov-muted)]">
                Scan the QR code with your authenticator app, then enter a code
                to confirm.
              </p>
              {tfSetup.qrDataUrl ? (
                <div className="flex justify-center rounded-lg bg-white p-3">
                  <img
                    src={tfSetup.qrDataUrl}
                    alt="2FA QR code"
                    width={200}
                    height={200}
                    className="h-[200px] w-[200px]"
                  />
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  QR unavailable (install <code>qrcode</code> on the API). Use
                  the secret below.
                </p>
              )}
              <div className="break-all rounded-lg bg-[var(--ov-soft)] px-2 py-1.5 font-mono text-[11px]">
                {tfSetup.secret}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  className="text-[var(--ov-accent)] hover:underline"
                  onClick={() =>
                    void navigator.clipboard.writeText(tfSetup.secret)
                  }
                >
                  Copy secret
                </button>
                <a
                  href={tfSetup.otpauthUri}
                  className="text-[var(--ov-accent)] hover:underline"
                >
                  Open in authenticator
                </a>
              </div>
              <input
                className={field}
                inputMode="numeric"
                placeholder="6-digit code from app"
                value={tfCode}
                onChange={(e) => setTfCode(e.target.value)}
                maxLength={8}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={tfBusy || tfCode.replace(/\s/g, "").length < 6}
                  onClick={() => void confirm2faEnable()}
                >
                  {tfBusy ? "…" : "Confirm & enable"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={tfBusy}
                  onClick={() => {
                    setTfSetup(null);
                    setTfCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={tfBusy}
              onClick={() => void start2faSetup()}
            >
              {tfBusy ? "…" : "Set up authenticator"}
            </Button>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
          <div className="flex items-center gap-2">
            <IconFingerprint className="h-4 w-4 text-[var(--ov-accent)]" />
            <h3 className="text-sm font-semibold">Passkey</h3>
          </div>
          <p className="text-xs text-[var(--ov-muted)]">
            WebAuthn / platform authenticator for passwordless unlock.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled
            title="Requires WebAuthn registration endpoint"
          >
            Register passkey
          </Button>
          <input
            className={field}
            placeholder="Note (device name)"
            value={passkeyNote}
            onChange={(e) => {
              setPasskeyNote(e.target.value);
              localStorage.setItem("ops-vault.passkey.note", e.target.value);
            }}
          />
        </div>
      </section>

      {/* Sessions / devices */}
      <section className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <div className="flex items-center gap-2">
          <IconDevice className="h-4 w-4 text-[var(--ov-accent)]" />
          <h3 className="text-sm font-semibold">Active sessions & devices</h3>
        </div>
        <p className="text-xs text-[var(--ov-muted)]">
          Local device registry for now. Cross-device revoke ships with the
          session service.
        </p>
        <ul className="divide-y divide-[var(--ov-border)] rounded-lg border border-[var(--ov-border)]">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {s.label}
                  {s.current && (
                    <span className="ml-2 text-[10px] uppercase text-[var(--ov-accent)]">
                      this device
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-[var(--ov-faint)]">
                  Last seen {s.lastSeen.slice(0, 19).replace("T", " ")}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  className="text-xs text-red-500"
                  onClick={() => revokeSession(s.id)}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={(e) => void handleRotate(e)}
        className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5"
      >
        <h3 className="text-sm font-semibold">Change master password</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="New password"
            minLength={8}
            required
            className={field}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm"
            minLength={8}
            required
            className={field}
          />
        </div>
        <Button
          type="submit"
          disabled={busy || newPass !== confirm || newPass.length < 8}
        >
          {busy ? "…" : "Rotate password"}
        </Button>
      </form>

      <div className="rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Audit log</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-[var(--ov-accent)]"
          >
            Refresh
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-[var(--ov-faint)]">No events</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] text-[var(--ov-muted)]">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap gap-x-2 border-b border-[var(--ov-border)] py-1"
              >
                <span className="text-[var(--ov-faint)]">
                  {ev.at.slice(0, 19)}
                </span>
                <span>{ev.action}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {info && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}
    </div>
  );
}

