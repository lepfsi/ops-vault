import { useState } from "react";
import { AddSecretForm } from "./components/AddSecretForm";
import { AuthPanel } from "./components/AuthPanel";
import { BackupPanel } from "./components/BackupPanel";
import { SecretList } from "./components/SecretList";
import { SecurityPanel } from "./components/SecurityPanel";
import { useVaultSession } from "./hooks/useVaultSession";

export default function App() {
  const session = useVaultSession();
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="min-h-screen bg-[#0b0f14] text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-400/80">
              DailyOps
            </p>
            <h1 className="text-xl font-semibold tracking-tight">OpsVault</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
              zero-knowledge · local-first
            </span>
            {session.phase === "unlocked" && (
              <button
                type="button"
                onClick={session.lock}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Verrouiller
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        {session.phase === "loading" && (
          <p className="text-sm text-slate-400">Connexion à l’API…</p>
        )}

        {(session.phase === "setup" ||
          session.phase === "locked" ||
          session.phase === "unlocking" ||
          session.phase === "error") && (
          <AuthPanel
            phase={session.phase === "error" ? "locked" : session.phase}
            isSetup={!session.vault}
            vaultName={session.vault?.name}
            error={session.error}
            onSetup={session.setup}
            onUnlock={session.unlock}
          />
        )}

        {session.phase === "error" && (
          <button
            type="button"
            onClick={() => void session.refreshVault()}
            className="text-sm text-cyan-400 hover:underline"
          >
            Réessayer
          </button>
        )}

        {session.phase === "unlocked" && session.key && session.vault && (
          <>
            <p className="text-sm text-emerald-400">
              Coffre déverrouillé — clé en mémoire uniquement.
              <span className="ml-2 text-slate-500">({session.vault.name})</span>
            </p>

            <AddSecretForm
              masterKey={session.key}
              onCreated={() => setRefreshToken((n) => n + 1)}
              onError={session.setError}
            />

            {session.error && (
              <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                {session.error}
              </p>
            )}

            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-slate-500">
                Secrets
              </h2>
              <SecretList
                masterKey={session.key}
                refreshToken={refreshToken}
                onError={session.setError}
              />
            </section>

            <BackupPanel
              masterKey={session.key}
              vault={session.vault}
              onImported={() => {
                setRefreshToken((n) => n + 1);
                void session.refreshVault();
              }}
              onError={session.setError}
              onRecoveryUpdated={() => void session.refreshVault()}
            />

            <SecurityPanel
              masterKey={session.key}
              onRekeyed={(newKey) => {
                session.replaceKey(newKey);
                void session.refreshVault();
                setRefreshToken((n) => n + 1);
              }}
              onError={session.setError}
            />
          </>
        )}
      </main>
    </div>
  );
}
