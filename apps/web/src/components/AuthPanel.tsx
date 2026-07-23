import { Button, Card, Input } from "@ops-vault/ui";
import { useState, type FormEvent } from "react";
import type { VaultPhase } from "../hooks/useVaultSession";

type AuthMode = "signin" | "signup" | "unlock" | "recovery" | "forgot";

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
  onSwitchAccount,
}: Props) {
  const [mode, setMode] = useState<AuthMode>(
    hasLocalVault ? "unlock" : "signin"
  );
  const [email, setEmail] = useState(lastEmail || "");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [name, setName] = useState("OpsVault");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rememberBrowser, setRememberBrowser] = useState(
    () => localStorage.getItem("ops-vault.rememberBrowser") === "1"
  );
  const busy = phase === "unlocking" || phase === "loading";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "forgot") return;
    localStorage.setItem(
      "ops-vault.rememberBrowser",
      rememberBrowser ? "1" : "0"
    );
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

  return (
    <Card className="border-[var(--ov-border)] bg-[var(--ov-panel)] p-5 shadow-lg">
      {mode === "unlock" || mode === "recovery" ? (
        <div className="mb-4 text-center">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ov-fg)]">
            {mode === "recovery" ? "Recovery key" : vaultName || "Unlock"}
          </h2>
        </div>
      ) : mode === "forgot" ? (
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Forgot password
          </h2>
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
        <div className="space-y-3 text-sm text-[var(--ov-muted)]">
          <p>
            OpsVault is zero-knowledge: the server never stores your master
            password and cannot reset it.
          </p>
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              If you set a <strong className="text-[var(--ov-fg)]">recovery key</strong>,
              use it below to unlock, then change your master password.
            </li>
            <li>
              Contact your{" "}
              <strong className="text-[var(--ov-fg)]">trusted contact</strong>{" "}
              if you configured one (Settings → Security).
            </li>
            <li>
              Without recovery, only a sealed backup + its export password can
              restore data.
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            {hasRecovery && onUnlockRecovery && (
              <Button type="button" onClick={() => setMode("recovery")}>
                Use recovery key
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMode(hasLocalVault ? "unlock" : "signin")}
            >
              Back
            </Button>
          </div>
        </div>
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

      {mode !== "forgot" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {(mode === "signin" || mode === "unlock") && (
            <button
              type="button"
              className="text-[var(--ov-muted)] hover:underline"
              onClick={() => setMode("forgot")}
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
                className="text-[var(--ov-accent)] hover:underline"
                onClick={() => setMode("recovery")}
              >
                Recovery key
              </button>
            )}
          {mode === "recovery" && (
            <button
              type="button"
              className="text-[var(--ov-accent)] hover:underline"
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
