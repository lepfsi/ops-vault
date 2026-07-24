import {
  createRecoveryBundle,
  type MasterKey,
  type VaultRecordWithRecovery,
} from "@ops-vault/core";
import { Button, Input } from "@ops-vault/ui";
import { useState, type FormEvent } from "react";
import * as api from "../lib/api";
import { DangerZone } from "./DangerZone";

interface Props {
  vault: VaultRecordWithRecovery;
  masterKey: MasterKey;
  onUpdated: () => void;
  onError: (msg: string) => void;
  onVaultDeleted?: () => void;
  activeOrgId?: string | null;
  activeOrgName?: string | null;
  onOrgDeleted?: () => void;
}

export function AccountPanel({
  vault,
  masterKey,
  onUpdated,
  onError,
  onVaultDeleted,
  activeOrgId,
  activeOrgName,
  onOrgDeleted,
}: Props) {
  const [email, setEmail] = useState(vault.email ?? "");
  const [recoveryEmail, setRecoveryEmail] = useState(
    vault.recoveryEmail ?? ""
  );
  const [name, setName] = useState(vault.name);
  const [recoveryPass, setRecoveryPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setInfo(null);
    try {
      await api.updateAccount({
        email: email.trim() || null,
        recoveryEmail: recoveryEmail.trim() || null,
        name: name.trim(),
      });
      setInfo("Saved");
      onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function setupRecoveryKey(e: FormEvent) {
    e.preventDefault();
    if (recoveryPass.length < 12) return;
    setBusy(true);
    setInfo(null);
    try {
      const bundle = await createRecoveryBundle(masterKey, recoveryPass);
      await api.setRecovery({ recovery: bundle });
      setRecoveryPass("");
      setInfo("Recovery key configured");
      onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Recovery setup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void saveAccount(e)}
        className="space-y-4 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5"
      >
        <h3 className="text-sm font-semibold text-[var(--ov-fg)]">Account</h3>
        <Input
          label="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Login email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <Input
          label="Recovery email"
          type="email"
          value={recoveryEmail}
          onChange={(e) => setRecoveryEmail(e.target.value)}
          placeholder="backup@company.com"
        />
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </form>

      <form
        onSubmit={(e) => void setupRecoveryKey(e)}
        className="space-y-4 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5"
      >
        <h3 className="text-sm font-semibold text-[var(--ov-fg)]">
          Recovery key
        </h3>
        <p className="text-xs text-[var(--ov-muted)]">
          {vault.recovery
            ? "Configured — replace with a new passphrase if needed."
            : "Required to unlock if the master password is lost."}
        </p>
        <Input
          label="Recovery passphrase"
          type="password"
          value={recoveryPass}
          onChange={(e) => setRecoveryPass(e.target.value)}
          minLength={12}
          placeholder="Min. 12 characters"
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || recoveryPass.length < 12}
        >
          {vault.recovery ? "Replace recovery key" : "Set recovery key"}
        </Button>
      </form>

      {info && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
      )}

      <DangerZone
        vaultId={vault.id}
        vaultName={vault.name}
        orgId={activeOrgId}
        orgName={activeOrgName}
        onError={onError}
        onVaultDeleted={() => onVaultDeleted?.()}
        onOrgDeleted={() => onOrgDeleted?.()}
      />
    </div>
  );
}
