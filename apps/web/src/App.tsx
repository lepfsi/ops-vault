import {
  bytesToBase64,
  decrypt,
  deriveMasterKey,
  encrypt,
  generateSalt,
  wipeKey,
  type MasterKey,
} from "@ops-vault/core";
import { useState, type FormEvent } from "react";

type Status = "idle" | "deriving" | "ready" | "error";

export default function App() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [demoPlain, setDemoPlain] = useState("ssh-ed25519 AAAA... demo-key");
  const [demoCipher, setDemoCipher] = useState<string | null>(null);
  const [demoRoundtrip, setDemoRoundtrip] = useState<string | null>(null);
  const [key, setKey] = useState<MasterKey | null>(null);
  const [saltB64, setSaltB64] = useState<string | null>(null);

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("deriving");
    setDemoCipher(null);
    setDemoRoundtrip(null);

    try {
      if (key) wipeKey(key);

      const salt = generateSalt();
      const master = await deriveMasterKey(password, salt);
      setKey(master);
      setSaltB64(bytesToBase64(salt));
      setStatus("ready");
      setPassword("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unlock failed");
    }
  }

  async function handleEncryptDemo() {
    if (!key) return;
    setError(null);
    try {
      const cipher = await encrypt(demoPlain, key);
      setDemoCipher(cipher);
      const plain = await decrypt(cipher, key);
      setDemoRoundtrip(plain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Crypto demo failed");
    }
  }

  function handleLock() {
    if (key) wipeKey(key);
    setKey(null);
    setSaltB64(null);
    setDemoCipher(null);
    setDemoRoundtrip(null);
    setStatus("idle");
  }

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
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
            zero-knowledge · local-first
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/30">
          <h2 className="mb-1 text-lg font-medium">Déverrouiller le coffre</h2>
          <p className="mb-6 text-sm text-slate-400">
            La clé maître est dérivée en local (Argon2id). Rien n’est envoyé en
            clair.
          </p>

          {status !== "ready" ? (
            <form onSubmit={handleUnlock} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block text-slate-300">
                  Mot de passe maître
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none ring-cyan-500/40 focus:ring-2"
                  placeholder="••••••••••••"
                  required
                  minLength={8}
                />
              </label>
              <button
                type="submit"
                disabled={status === "deriving"}
                className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:cursor-wait disabled:opacity-60"
              >
                {status === "deriving"
                  ? "Dérivation Argon2id…"
                  : "Déverrouiller"}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-emerald-400">
                Coffre déverrouillé — clé en mémoire uniquement.
              </p>
              {saltB64 && (
                <p className="break-all font-mono text-xs text-slate-500">
                  salt (demo): {saltB64}
                </p>
              )}
              <button
                type="button"
                onClick={handleLock}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Verrouiller
              </button>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </section>

        {status === "ready" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="mb-1 text-lg font-medium">Demo crypto</h2>
            <p className="mb-4 text-sm text-slate-400">
              AES-256-GCM via <code className="text-cyan-300">@ops-vault/core</code>
            </p>
            <textarea
              value={demoPlain}
              onChange={(e) => setDemoPlain(e.target.value)}
              rows={3}
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none ring-cyan-500/40 focus:ring-2"
            />
            <button
              type="button"
              onClick={handleEncryptDemo}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white"
            >
              Chiffrer → déchiffrer
            </button>
            {demoCipher && (
              <div className="mt-4 space-y-2 text-xs">
                <p className="text-slate-400">Ciphertext (base64)</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-cyan-200/90">
                  {demoCipher}
                </pre>
                <p className="text-slate-400">Round-trip</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-emerald-300">
                  {demoRoundtrip}
                </pre>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
