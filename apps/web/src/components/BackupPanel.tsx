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
import { Button } from "@ops-vault/ui";
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

  const field =
    "w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-sm text-[var(--ov-fg)] outline-none focus:ring-2 focus:ring-[var(--ov-accent-ring)]";

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
        setInfo("Sealed export downloaded");
      } else {
        blob = new Blob([backupToJson(backup)], { type: "application/json" });
        filename = `ops-vault-backup-${dateStamp()}.json`;
        setInfo("Export downloaded");
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
      setInfo(`Imported ${result.imported} secret(s)`);
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
      setInfo("Recovery key saved");
      onRecoveryUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Recovery setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleTestRecovery() {
    if (!vault.recovery) {
      onError("No recovery configured");
      return;
    }
    setBusy(true);
    try {
      const key = await unlockWithRecovery(vault.recovery, recoveryPass);
      wipeKey(key);
      setInfo("Recovery passphrase valid");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-[var(--ov-fg)]">Backup</h3>
        <p className="mt-1 text-sm text-[var(--ov-muted)]">
          Portable zero-knowledge export. Optional seal password.
        </p>
      </div>

      <div className="grid gap-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--ov-muted)]">
            Export password (optional)
          </span>
          <input
            type="password"
            value={exportPass}
            onChange={(e) => setExportPass(e.target.value)}
            className={field}
            placeholder="Empty = unsealed"
          />
        </label>
        <div className="flex items-end">
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleExport()}
            className="w-full"
          >
            Export vault
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ov-muted)]">
              Import password (if sealed)
            </span>
            <input
              type="password"
              value={importPass}
              onChange={(e) => setImportPass(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-[var(--ov-muted)]">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
            />
            Replace existing vault
          </label>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="block w-full text-sm text-[var(--ov-muted)]"
          onChange={(e) => void handleImportFile(e)}
          disabled={busy}
        />
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-4">
        <p className="text-sm text-[var(--ov-muted)]">
          Recovery key —{" "}
          {vault.recovery ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              configured
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">missing</span>
          )}
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="password"
            value={recoveryPass}
            onChange={(e) => setRecoveryPass(e.target.value)}
            placeholder="Recovery passphrase (≥12)"
            className={field}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy || recoveryPass.length < 12}
            onClick={() => void handleCreateRecovery()}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !vault.recovery || recoveryPass.length < 12}
            onClick={() => void handleTestRecovery()}
          >
            Test
          </Button>
        </div>
      </div>

      {info && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}
    </section>
  );
}

function dateStamp() {
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
