import { useState, type FormEvent } from "react";
import type { VaultPhase } from "../hooks/useVaultSession";

interface Props {
  phase: VaultPhase;
  /** True when no vault exists yet on the API. */
  isSetup: boolean;
  vaultName?: string;
  error: string | null;
  onSetup: (password: string, name: string) => Promise<void>;
  onUnlock: (password: string) => Promise<void>;
}

export function AuthPanel({
  phase,
  isSetup,
  vaultName,
  error,
  onSetup,
  onUnlock,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("OpsVault");
  const busy = phase === "unlocking" || phase === "loading";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isSetup) {
      if (password !== confirm) return;
      await onSetup(password, name);
    } else {
      await onUnlock(password);
    }
    setPassword("");
    setConfirm("");
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/30">
      <h2 className="mb-1 text-lg font-medium">
        {isSetup ? "Créer le coffre" : "Déverrouiller"}
      </h2>
      <p className="mb-6 text-sm text-slate-400">
        {isSetup
          ? "Le mot de passe maître ne quitte jamais ce navigateur. Seuls salt + vérificateur chiffré sont envoyés à l’API."
          : `Coffre « ${vaultName ?? "OpsVault"} » — Argon2id + AES-GCM en local.`}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSetup && (
          <label className="block text-sm">
            <span className="mb-1.5 block text-slate-300">Nom du coffre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-500/40 focus:ring-2"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="mb-1.5 block text-slate-300">Mot de passe maître</span>
          <input
            type="password"
            autoComplete={isSetup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-500/40 focus:ring-2"
            placeholder="••••••••••••"
            required
            minLength={8}
          />
        </label>

        {isSetup && (
          <label className="block text-sm">
            <span className="mb-1.5 block text-slate-300">Confirmation</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-500/40 focus:ring-2"
              required
              minLength={8}
            />
            {confirm && password !== confirm && (
              <span className="mt-1 block text-xs text-amber-400">
                Les mots de passe ne correspondent pas
              </span>
            )}
          </label>
        )}

        <button
          type="submit"
          disabled={busy || (isSetup && password !== confirm)}
          className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "Dérivation Argon2id…"
            : isSetup
              ? "Créer & déverrouiller"
              : "Déverrouiller"}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
