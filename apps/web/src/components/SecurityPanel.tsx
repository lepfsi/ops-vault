import {
  bytesToBase64,
  rotateMasterPassword,
  wipeKey,
  type MasterKey,
} from "@ops-vault/core";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as api from "../lib/api";
import type { AuditEvent } from "../lib/api";

interface Props {
  masterKey: MasterKey;
  onRekeyed: (newKey: MasterKey) => void;
  onError: (msg: string) => void;
}

export function SecurityPanel({ masterKey, onRekeyed, onError }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [note, setNote] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  type Summary = {
    unlockOk: number;
    unlockFail: number;
    exports: number;
    imports: number;
    rekeys: number;
    secretReads: number;
  };

  const [sum, setSum] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getAudit(40);
      setEvents(data.events);
      setSum(data.summary);
      setNote(data.note);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Audit load failed");
    }
  }, [onError]);

  useEffect(() => {
    void load();
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
        salt: bytesToBase64(auth.salt),
        verifier: auth.verifier,
        secrets: rotated,
        clearRecovery: true,
      });
      wipeKey(masterKey);
      onRekeyed(auth.key);
      setNewPass("");
      setConfirm("");
      setInfo(
        "Mot de passe maître changé. Ancien MDP invalide sur ce serveur. Recréez une recovery key."
      );
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Rotation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-amber-900/40 bg-slate-900/50 p-5">
      <div>
        <h3 className="text-base font-medium text-amber-200/90">
          Sécurité — peut-on savoir si le MDP a été cramé ?
        </h3>
        <div className="mt-2 space-y-2 text-sm text-slate-400">
          <p>
            <strong className="text-slate-200">Non, pas en offline.</strong> Si
            quelqu’un a volé la base (salt + verifier + ciphertexts) et brute-force
            Argon2id chez lui,{" "}
            <em className="text-amber-200/80">
              aucune trace n’apparaît ici
            </em>
            . C’est le modèle zero-knowledge (Bitwarden, 1Password offline dump
            = même limite).
          </p>
          <p>
            <strong className="text-slate-200">Oui, en partie en online.</strong>{" "}
            Si l’attaquant utilise <em>cette</em> API (export, lecture secret,
            unlock via l’UI), les événements ci-dessous le montrent.
          </p>
          <p className="text-xs text-slate-500">{note}</p>
        </div>
      </div>

      {sum && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Unlock OK" value={sum.unlockOk} warn={false} />
          <Stat
            label="Unlock fail"
            value={sum.unlockFail}
            warn={sum.unlockFail > 5}
          />
          <Stat label="Exports" value={sum.exports} warn={sum.exports > 0} />
          <Stat label="Imports" value={sum.imports} warn={false} />
          <Stat label="Rekeys" value={sum.rekeys} warn={false} />
          <Stat
            label="Lectures secret"
            value={sum.secretReads}
            warn={false}
          />
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-300">Journal d’audit</h4>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-cyan-400 hover:underline"
          >
            Actualiser
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun événement encore.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-400">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap gap-x-2 border-b border-slate-800/80 py-1"
              >
                <span className="text-slate-600">{ev.at.slice(0, 19)}</span>
                <span className="text-cyan-400/90">{ev.action}</span>
                {ev.detail && (
                  <span className="truncate text-slate-500">{ev.detail}</span>
                )}
                {ev.ip && <span className="text-slate-600">{ev.ip}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => void handleRotate(e)}
        className="space-y-3 border-t border-slate-800 pt-4"
      >
        <h4 className="text-sm font-medium text-slate-300">
          Changer le mot de passe maître (rekey)
        </h4>
        <p className="text-xs text-slate-500">
          Rechiffre tous les secrets sous une nouvelle clé. Un dump volé avec
          l’ancien MDP ne déchiffre plus les données actuelles.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="Nouveau MDP (≥8)"
            minLength={8}
            required
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirmation"
            minLength={8}
            required
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || newPass !== confirm || newPass.length < 8}
          className="rounded-lg border border-amber-700/60 bg-amber-950/40 px-4 py-2 text-sm text-amber-100 hover:bg-amber-900/40 disabled:opacity-50"
        >
          {busy ? "Rechiffrement…" : "Rotation du MDP maître"}
        </button>
      </form>

      {info && (
        <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          {info}
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        warn
          ? "border-amber-800/50 bg-amber-950/20"
          : "border-slate-800 bg-slate-950/50"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`text-lg font-semibold ${
          warn ? "text-amber-300" : "text-slate-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
