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
  const [totpEnabled, setTotpEnabled] = useState(
    () => localStorage.getItem("ops-vault.2fa.enabled") === "1"
  );
  const [passkeyNote, setPasskeyNote] = useState(
    () => localStorage.getItem("ops-vault.passkey.note") ?? ""
  );

  const load = useCallback(async () => {
    try {
      const data = await api.getAudit(30);
      setEvents(data.events);
      setSum({
        unlockOk: data.summary.unlockOk,
        unlockFail: data.summary.unlockFail,
        exports: data.summary.exports,
        rekeys: data.summary.rekeys,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Audit failed");
    }
  }, [onError]);

  useEffect(() => {
    void load();
    setSessions(ensureSession());
  }, [load]);

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
    setInfo(
      "Trusted contact saved locally. Full recovery workflow ships with the server-side invite step."
    );
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
          Someone who can help you recover access. They never receive your
          master password — only a recovery assist flow.
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
            Second factor for unlock. TOTP secrets already live in your vault;
            account-level 2FA gate is staged for the auth service.
          </p>
          <label className="flex items-center justify-between text-sm text-[var(--ov-muted)]">
            Require 2FA at unlock
            <input
              type="checkbox"
              checked={totpEnabled}
              onChange={(e) => {
                setTotpEnabled(e.target.checked);
                localStorage.setItem(
                  "ops-vault.2fa.enabled",
                  e.target.checked ? "1" : "0"
                );
              }}
            />
          </label>
          <p className="text-[11px] text-[var(--ov-faint)]">
            Preference stored — enforcement lands with server sessions.
          </p>
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

