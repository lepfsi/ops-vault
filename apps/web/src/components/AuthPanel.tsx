import { Button, Card, Input } from "@ops-vault/ui";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { VaultPhase } from "../hooks/useVaultSession";

type AuthMode =
  | "signin"
  | "signup"
  | "unlock"
  | "recovery"
  | "forgot"
  | "totp";

interface Props {
  phase: VaultPhase;
  hasLocalVault: boolean;
  vaultName?: string;
  vaultEmail?: string | null;
  hasRecovery?: boolean;
  lastEmail?: string;
  error: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (
    email: string,
    password: string,
    opts: { recoveryEmail: string; name: string }
  ) => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
  onUnlockRecovery?: (recoveryPassword: string) => Promise<void>;
  onVerify2fa?: (code: string) => Promise<void>;
  onCancel2fa?: () => void;
  onPrepareRecovery?: (
    email: string
  ) => Promise<{ hasRecovery: boolean; vaultName: string }>;
  onImportBackup?: (
    backupJson: string,
    exportPassword?: string
  ) => Promise<void>;
  onSwitchAccount?: () => void;
}

export function AuthPanel({
  phase,
  hasLocalVault,
  vaultName,
  hasRecovery,
  lastEmail = "",
  error,
  onLogin,
  onRegister,
  onUnlock,
  onUnlockRecovery,
  onVerify2fa,
  onCancel2fa,
  onPrepareRecovery,
  onImportBackup,
  onSwitchAccount,
}: Props) {
  const [mode, setMode] = useState<AuthMode>(() => {
    if (phase === "need_2fa") return "totp";
    return hasLocalVault ? "unlock" : "signin";
  });
  const [email, setEmail] = useState(lastEmail || "");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [name, setName] = useState("OpsVault");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [importPass, setImportPass] = useState("");
  const [forgotInfo, setForgotInfo] = useState<string | null>(null);
  const [rememberBrowser, setRememberBrowser] = useState(
    () => localStorage.getItem("ops-vault.rememberBrowser") === "1"
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = phase === "unlocking" || phase === "loading";

  useEffect(() => {
    if (phase === "need_2fa") setMode("totp");
  }, [phase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "forgot") return;
    localStorage.setItem(
      "ops-vault.rememberBrowser",
      rememberBrowser ? "1" : "0"
    );
    if (mode === "totp") {
      await onVerify2fa?.(totpCode.trim());
      setTotpCode("");
      return;
    }
    if (mode === "signup") {
      if (password !== confirm || password.length < 8) return;
      await onRegister(email, password, {
        recoveryEmail: recoveryEmail || email,
        name,
      });
    } else if (mode === "signin") {
      await onLogin(email, password);
    } else if (mode === "recovery") {
      await onUnlockRecovery?.(password);
    } else {
      await onUnlock(password);
    }
    setPassword("");
    setConfirm("");
  }

  async function loadAccountForRecovery() {
    if (!onPrepareRecovery || !email.trim()) return;
    setForgotInfo(null);
    try {
      const r = await onPrepareRecovery(email.trim());
      if (r.hasRecovery) {
        setForgotInfo(
          `Vault “${r.vaultName}” found — enter your recovery passphrase.`
        );
        setMode("recovery");
      } else {
        setForgotInfo(
          `Vault “${r.vaultName}” has no recovery key. Import a sealed backup below, or unlock if you remember the master password.`
        );
      }
    } catch {
      /* error surfaced via props */
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onImportBackup) return;
    setForgotInfo(null);
    try {
      const text = await file.text();
      await onImportBackup(text, importPass || undefined);
      setForgotInfo(
        "Backup restored. Unlock with the master password used when that backup was created."
      );
      setMode("unlock");
      setImportPass("");
    } catch {
      /* error via props */
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card className="border-[var(--ov-border)] bg-[var(--ov-panel)] p-5 shadow-lg">
      {mode === "totp" ? (
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ov-fg)]">
            Two-factor authentication
          </h2>
          <p className="mt-1 text-sm text-[var(--ov-muted)]">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>
      ) : mode === "unlock" || mode === "recovery" ? (
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ov-fg)]">
            {mode === "recovery" ? "Recovery key" : vaultName || "Unlock"}
          </h2>
          {mode === "recovery" && (
            <p className="mt-1 text-sm text-[var(--ov-muted)]">
              Unlock with your recovery passphrase, then set a new master
              password in Settings → Security.
            </p>
          )}
        </div>
      ) : mode === "forgot" ? (
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Recover access
          </h2>
          <p className="mt-1 text-sm text-[var(--ov-muted)]">
            The server cannot reset your master password. Use a recovery key or
            a sealed backup you exported earlier.
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {mode === "signup" ? "Create account" : "Sign in"}
          </h2>
        </div>
      )}

      {!hasLocalVault && (mode === "signin" || mode === "signup") && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-[var(--ov-soft)] p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "signin"
                ? "bg-[var(--ov-panel)] text-[var(--ov-fg)] shadow-sm"
                : "text-[var(--ov-muted)]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "signup"
                ? "bg-[var(--ov-panel)] text-[var(--ov-fg)] shadow-sm"
                : "text-[var(--ov-muted)]"
            }`}
          >
            Create account
          </button>
        </div>
      )}

      {mode === "forgot" ? (
        <div className="space-y-4">
          {/* Path 1 — recovery key */}
          <div className="space-y-2 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] p-3">
            <p className="text-sm font-medium text-[var(--ov-fg)]">
              1. Recovery key
            </p>
            {hasLocalVault && hasRecovery && onUnlockRecovery ? (
              <>
                <p className="text-xs text-[var(--ov-muted)]">
                  A recovery key is configured on this vault.
                </p>
                <Button type="button" onClick={() => setMode("recovery")}>
                  Unlock with recovery key
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs text-[var(--ov-muted)]">
                  Look up your account, then unlock with the recovery passphrase
                  you set in Settings.
                </p>
                <Input
                  label="Account email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
                <Button
                  type="button"
                  disabled={!email.trim() || !onPrepareRecovery || busy}
                  onClick={() => void loadAccountForRecovery()}
                >
                  Find account &amp; use recovery
                </Button>
              </>
            )}
          </div>

          {/* Path 2 — backup import */}
          <div className="space-y-2 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] p-3">
            <p className="text-sm font-medium text-[var(--ov-fg)]">
              2. Restore from backup
            </p>
            <p className="text-xs text-[var(--ov-muted)]">
              Import a JSON backup (sealed exports need the export password).
              Then unlock with the master password from that backup era.
            </p>
            <Input
              label="Export password (if sealed)"
              type="password"
              value={importPass}
              onChange={(e) => setImportPass(e.target.value)}
              placeholder="Optional"
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void handleImportFile(e)}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!onImportBackup || busy}
              onClick={() => fileRef.current?.click()}
            >
              Choose backup file…
            </Button>
          </div>

          {forgotInfo && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {forgotInfo}
            </p>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode(hasLocalVault ? "unlock" : "signin")}
          >
            Back to sign in
          </Button>
        </div>
      ) : mode === "totp" ? (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <Input
            label="Authenticator or recovery code"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="000000 or XXXX-XXXX"
            required
            autoFocus
          />
          <p className="text-[11px] text-[var(--ov-muted)]">
            Lost your phone? Use a one-time recovery code from when you enabled
            2FA (or disable 2FA with it after unlock).
          </p>
          <Button
            type="submit"
            className="w-full"
            disabled={busy || totpCode.trim().length < 6}
          >
            {busy ? "…" : "Verify & unlock"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-[var(--ov-muted)] hover:underline"
            onClick={() => {
              onCancel2fa?.();
              setMode(hasLocalVault ? "unlock" : "signin");
              setTotpCode("");
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          {(mode === "signin" || mode === "signup") && (
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
          )}

          {mode === "signup" && (
            <>
              <Input
                label="Recovery email"
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="Optional"
              />
              <Input
                label="Vault name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </>
          )}

          <Input
            label={
              mode === "recovery" ? "Recovery passphrase" : "Master password"
            }
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "recovery" ? 12 : 8}
          />

          {mode === "signup" && (
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          )}

          {(mode === "signin" || mode === "unlock" || mode === "signup") && (
            <label className="flex items-center gap-2 text-sm text-[var(--ov-muted)]">
              <input
                type="checkbox"
                checked={rememberBrowser}
                onChange={(e) => setRememberBrowser(e.target.checked)}
              />
              Remember this browser
            </label>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={
              busy ||
              (mode === "signup" &&
                (password !== confirm || password.length < 8)) ||
              (mode === "recovery" && password.length < 12)
            }
          >
            {busy
              ? "…"
              : mode === "signup"
                ? "Create account"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "recovery"
                    ? "Unlock with recovery"
                    : "Unlock"}
          </Button>
        </form>
      )}

      {mode !== "forgot" && mode !== "totp" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {(mode === "signin" || mode === "unlock") && (
            <button
              type="button"
              className="text-[var(--ov-accent)] hover:underline"
              onClick={() => {
                setForgotInfo(null);
                setMode("forgot");
              }}
            >
              Forgot password?
            </button>
          )}
          {hasLocalVault &&
            mode === "unlock" &&
            hasRecovery &&
            onUnlockRecovery && (
              <button
                type="button"
                className="text-[var(--ov-muted)] hover:underline"
                onClick={() => setMode("recovery")}
              >
                Recovery key
              </button>
            )}
          {mode === "recovery" && (
            <button
              type="button"
              className="text-[var(--ov-muted)] hover:underline"
              onClick={() => setMode("unlock")}
            >
              Master password
            </button>
          )}
          {hasLocalVault && onSwitchAccount && (
            <button
              type="button"
              className="text-[var(--ov-muted)] hover:underline"
              onClick={() => {
                onSwitchAccount();
                setMode("signin");
              }}
            >
              Switch account
            </button>
          )}
          {!hasLocalVault && mode === "signin" && (
            <button
              type="button"
              className="text-[var(--ov-muted)] hover:underline"
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </Card>
  );
}
