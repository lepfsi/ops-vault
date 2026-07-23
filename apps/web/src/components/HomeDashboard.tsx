import type { MasterKey } from "@ops-vault/core";
import { Button, Card } from "@ops-vault/ui";
import { useRef } from "react";
import type { OrgNav } from "./layout/AppShell";
import { SecurityReport } from "./SecurityReport";

interface Props {
  vaultName: string;
  secretCount: number;
  masterKey: MasterKey;
  orgs: OrgNav[];
  onOpenVault: () => void;
  onNewItem: () => void;
  onNewNote: () => void;
  onOpenOrgs: () => void;
  onSelectOrg: (id: string) => void;
  onOpenGenerators: () => void;
  onError: (msg: string) => void;
  onOpenSecretId?: (id: string) => void;
}

export function HomeDashboard({
  vaultName,
  secretCount,
  masterKey,
  orgs,
  onOpenVault,
  onNewItem,
  onNewNote,
  onOpenOrgs,
  onSelectOrg,
  onOpenGenerators,
  onError,
  onOpenSecretId,
}: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Home</h2>
        <p className="mt-1 text-sm text-[var(--ov-muted)]">
          Personal vault · {vaultName}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-[var(--ov-border)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ov-faint)]">
            Secrets
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {secretCount}
          </p>
          <button
            type="button"
            onClick={onOpenVault}
            className="mt-2 text-xs font-medium text-[var(--ov-accent)] hover:underline"
          >
            Open vault →
          </button>
        </Card>
        <Card className="border-[var(--ov-border)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ov-faint)]">
            Organizations
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {orgs.length}
          </p>
          <button
            type="button"
            onClick={onOpenOrgs}
            className="mt-2 text-xs font-medium text-[var(--ov-accent)] hover:underline"
          >
            Open orgs →
          </button>
        </Card>
        <Card className="border-[var(--ov-border)] bg-[var(--ov-secondary-soft)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ov-accent)]">
            Quick actions
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={onNewItem}>
              Password
            </Button>
            <Button type="button" variant="secondary" onClick={onNewNote}>
              Note
            </Button>
            <Button type="button" variant="ghost" onClick={onOpenGenerators}>
              Generators
            </Button>
          </div>
        </Card>
      </div>

      <div className="rounded-xl border border-[var(--ov-accent)]/35 bg-[var(--ov-accent-soft)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--ov-fg)]">
              Breach check & password health
            </h3>
            <p className="mt-0.5 text-xs text-[var(--ov-muted)]">
              Weak passwords and HIBP exposures — run the report below.
            </p>
          </div>
          <Button
            type="button"
            onClick={() =>
              reportRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            Run health check
          </Button>
        </div>
      </div>

      <div ref={reportRef}>
        <SecurityReport
          masterKey={masterKey}
          onError={onError}
          onOpenSecret={onOpenSecretId}
        />
      </div>

      {orgs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Organizations</h3>
          <ul className="divide-y divide-[var(--ov-border)] rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)]">
            {orgs.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => onSelectOrg(o.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[var(--ov-hover)]"
                >
                  <span className="font-medium">{o.name}</span>
                  <span className="text-xs text-[var(--ov-faint)]">
                    Enter org vault →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
