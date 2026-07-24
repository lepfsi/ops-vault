import type { MasterKey, VaultRecordWithRecovery } from "@ops-vault/core";
import { OpsVaultWordmark, TabPanel, Tabs } from "@ops-vault/ui";
import { AccountPanel } from "./AccountPanel";
import { BackupPanel } from "./BackupPanel";
import { PrivacyPanel } from "./PrivacyPanel";
import { SecurityPanel } from "./SecurityPanel";
import { SmtpPanel } from "./SmtpPanel";
import type { SettingsTab } from "./layout/AppShell";

interface Props {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  masterKey: MasterKey;
  vault: VaultRecordWithRecovery;
  onImported: () => void;
  onRecoveryUpdated: () => void;
  onRekeyed: (key: MasterKey) => void;
  onError: (msg: string) => void;
  onVaultDeleted?: () => void;
  activeOrgId?: string | null;
  activeOrgName?: string | null;
  onOrgDeleted?: () => void;
}

export function SettingsView({
  tab,
  onTab,
  masterKey,
  vault,
  onImported,
  onRecoveryUpdated,
  onRekeyed,
  onError,
  onVaultDeleted,
  activeOrgId,
  activeOrgName,
  onOrgDeleted,
}: Props) {
  const effective: SettingsTab =
    tab === "workspace" ? "account" : tab;

  return (
    <div>
      <Tabs
        className="mb-4"
        value={effective}
        onChange={onTab}
        items={[
          { id: "account", label: "Account" },
          { id: "security", label: "Security" },
          { id: "privacy", label: "Privacy" },
          { id: "mail", label: "Mail" },
          { id: "backup", label: "Backup" },
          { id: "about", label: "About" },
        ]}
      />

      <TabPanel>
        {effective === "account" && (
          <AccountPanel
            vault={vault}
            masterKey={masterKey}
            onUpdated={onRecoveryUpdated}
            onError={onError}
            onVaultDeleted={onVaultDeleted}
            activeOrgId={activeOrgId}
            activeOrgName={activeOrgName}
            onOrgDeleted={onOrgDeleted}
          />
        )}

        {effective === "backup" && (
          <BackupPanel
            masterKey={masterKey}
            vault={vault}
            onImported={onImported}
            onError={onError}
            onRecoveryUpdated={onRecoveryUpdated}
          />
        )}

        {effective === "security" && (
          <SecurityPanel
            masterKey={masterKey}
            onRekeyed={onRekeyed}
            onError={onError}
          />
        )}

        {effective === "privacy" && (
          <PrivacyPanel vault={vault} onError={onError} />
        )}

        {effective === "mail" && <SmtpPanel onError={onError} />}

        {effective === "about" && (
          <div className="space-y-4 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-6 text-sm text-[var(--ov-muted)]">
            <OpsVaultWordmark />
            <div className="space-y-2 leading-relaxed">
              <p>
                <strong className="text-[var(--ov-fg)]">DailyOps</strong> is a
                product suite for technical teams — operations, security
                hygiene, and day-to-day control without surrendering ownership of
                your data.
              </p>
              <p>
                <strong className="text-[var(--ov-fg)]">OpsVault</strong> is the
                zero-knowledge secret vault of that suite: passwords, notes,
                OTP, keys and org workspaces stay encrypted on your device. The
                server stores ciphertext only.
              </p>
              <p className="text-xs text-[var(--ov-faint)]">
                OpsVault v1 · self-hosted · personal vault + organization vaults
              </p>
            </div>
          </div>
        )}
      </TabPanel>
    </div>
  );
}
