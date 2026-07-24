import { Button } from "@ops-vault/ui";
import { useState } from "react";
import * as api from "../lib/api";

interface Props {
  vaultId: string;
  vaultName: string;
  /** Active org (optional) — owner can delete it here too */
  orgId?: string | null;
  orgName?: string | null;
  onError: (msg: string) => void;
  onVaultDeleted: () => void;
  onOrgDeleted?: () => void;
}

/**
 * Destructive actions — always confirm by typing the resource name.
 */
export function DangerZone({
  vaultId,
  vaultName,
  orgId,
  orgName,
  onError,
  onVaultDeleted,
  onOrgDeleted,
}: Props) {
  const [confirmVault, setConfirmVault] = useState("");
  const [confirmOrg, setConfirmOrg] = useState("");
  const [busy, setBusy] = useState(false);

  async function deleteVault() {
    if (confirmVault !== vaultName) return;
    if (
      !window.confirm(
        `Delete vault « ${vaultName} » and ALL its secrets? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteVault(vaultId);
      onVaultDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete vault failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteOrg() {
    if (!orgId || !orgName || confirmOrg !== orgName) return;
    if (
      !window.confirm(
        `Delete organization « ${orgName} » and all org secrets/groups?`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteWorkspace(orgId);
      setConfirmOrg("");
      onOrgDeleted?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete org failed");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-red-500/30 bg-[var(--ov-input)] px-3 py-2 text-sm text-[var(--ov-fg)]";

  return (
    <section className="space-y-4 rounded-xl border border-red-500/40 bg-red-500/5 p-5">
      <div>
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
          Danger zone
        </h3>
        <p className="mt-0.5 text-xs text-[var(--ov-muted)]">
          Irreversible actions. Type the exact name to confirm.
        </p>
      </div>

      {orgId && orgName && (
        <div className="space-y-2 rounded-lg border border-red-500/25 p-3">
          <p className="text-sm font-medium text-[var(--ov-fg)]">
            Delete organization
          </p>
          <p className="text-xs text-[var(--ov-muted)]">
            Removes shared secrets, groups, and memberships. Type{" "}
            <code className="text-red-600 dark:text-red-400">{orgName}</code>
          </p>
          <input
            className={field}
            value={confirmOrg}
            onChange={(e) => setConfirmOrg(e.target.value)}
            placeholder={orgName}
            autoComplete="off"
          />
          <Button
            type="button"
            variant="danger"
            disabled={busy || confirmOrg !== orgName}
            onClick={() => void deleteOrg()}
          >
            Delete organization
          </Button>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-red-500/25 p-3">
        <p className="text-sm font-medium text-[var(--ov-fg)]">
          Delete this vault / account data
        </p>
        <p className="text-xs text-[var(--ov-muted)]">
          Wipes all personal secrets on the server for this vault. Type{" "}
          <code className="text-red-600 dark:text-red-400">{vaultName}</code>
        </p>
        <input
          className={field}
          value={confirmVault}
          onChange={(e) => setConfirmVault(e.target.value)}
          placeholder={vaultName}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="danger"
          disabled={busy || confirmVault !== vaultName}
          onClick={() => void deleteVault()}
        >
          Delete vault permanently
        </Button>
      </div>
    </section>
  );
}
