import {
  backupToJson,
  createRecoveryBundle,
  parseBackupJson,
  sealBackup,
  unlockWithRecovery,
  wipeKey,
  type MasterKey,
  type VaultRecordWithRecovery,
} from "@ops-vault/core";
import { useRef, useState, type ChangeEvent } from "react";
import * as api from "../lib/api";

interface Props {
  masterKey: MasterKey;
  vault: VaultRecordWithRecovery;
  onImported: () => void;
  onError: (msg: string) => void;
  onRecoveryUpdated: () => void;
}

export function BackupPanel({
  masterKey,
  vault,
  onImported,
  onError,
  onRecoveryUpdated,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportPass, setExportPass] = useState("");
  const [importPass, setImportPass] = useState("");
  const [recoveryPass, setRecoveryPass] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function handleExport() {
    setBusy(true);
    setInfo(null);
    try {
      const backup = await api.exportVault();
      let blob: Blob;
      let filename: string;

      if (exportPass.length >= 8) {
        const sealed = await sealBackup(backup, exportPass);
        blob = new Blob([backupToJson(sealed)], { type: "application/json" });
        filename = `ops-vault-sealed-${dateStamp()}.json`;
        setInfo("Export scellé téléchargé (mot de passe d’export requis à l’import).");
      } else {
        blob = new Blob([backupToJson(backup)], { type: "application/json" });
        filename = `ops-vault-backup-${dateStamp()}.json`;
        setInfo(
          "Export téléchargé (ciphertexts only — même MDP maître pour ouvrir)."
        );
      }

      downloadBlob(blob, filename);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setInfo(null);
    try {
      const text = await file.text();
      const backup = await parseBackupJson(
        text,
        importPass.length > 0 ? importPass : undefined
      );
      const result = await api.importVault({ backup, force });
      setInfo(
        `Import OK — ${result.imported} secret(s). Rechargez et déverrouillez avec le MDP d’origine du backup.`
      );
      onImported();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleCreateRecovery() {
    setBusy(true);
    setInfo(null);
    try {
      const bundle = await createRecoveryBundle(masterKey, recoveryPass);
      await api.setRecovery({ recovery: bundle });
      setRecoveryPass("");
      setInfo("Clé de recovery enregistrée (salt + master key scellée).");
      onRecoveryUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Recovery setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestRecovery() {
    if (!vault.recovery) {
      onError("Aucune recovery configurée");
      return;
    }
    setBusy(true);
    try {
      const key = await unlockWithRecovery(vault.recovery, recoveryPass);
      wipeKey(key);
      setInfo("Recovery password valide — clé maître restaurable.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <div>
        <h3 className="text-base font-medium">Backup & recovery</h3>
        <p className="mt-1 text-sm text-slate-400">
          Export portable zero-knowledge. Option seal = couche Argon2id + AES-GCM
          avec un mot de passe d’export séparé.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">
            MDP export (optionnel, ≥8)
          </span>
          <input
            type="password"
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="vide = backup non scellé"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleExport()}
            className="w-full rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            Exporter le coffre
          </button>
        </div>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">
              MDP import (si scellé)
            </span>
            <input
              type="password"
              value={importPass}
              onChange={(e) => setImportPass(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Remplacer le coffre existant (force)
          </label>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="mt-3 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-900"
          onChange={(e) => void handleImportFile(e)}
          disabled={busy}
        />
      </div>

      <div className="border-t border-slate-800 pt-4">
        <p className="mb-2 text-sm text-slate-400">
          Recovery key (break-glass) —{" "}
          {vault.recovery ? (
            <span className="text-emerald-400">configurée</span>
          ) : (
            <span className="text-amber-400">absente</span>
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="password"
            value={recoveryPass}
            onChange={(e) => setRecoveryPass(e.target.value)}
            placeholder="Recovery password (≥12)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || recoveryPass.length < 12}
            onClick={() => void handleCreateRecovery()}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Enregistrer
          </button>
          <button
            type="button"
            disabled={busy || !vault.recovery || recoveryPass.length < 12}
            onClick={() => void handleTestRecovery()}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            Tester
          </button>
        </div>
      </div>

      {info && (
        <p className="rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          {info}
        </p>
      )}
    </section>
  );
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
