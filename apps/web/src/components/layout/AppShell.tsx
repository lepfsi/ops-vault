import {
  Button,
  cn,
  IconBuilding,
  IconDice,
  IconDownload,
  IconFolder,
  IconHome,
  IconInfo,
  IconLock,
  IconMoon,
  IconPlus,
  IconSearch,
  IconExternal,
  IconShield,
  IconSun,
  IconTag,
  IconUser,
  IconVault,
  OpsVaultLogo,
} from "@ops-vault/ui";
import type { ReactNode, RefObject } from "react";
import {
  FILTER_ORDER,
  filterIcon,
  filterLabel,
  type VaultFilter,
} from "../../lib/secretMeta";

export type MainSection =
  | "home"
  | "vault"
  | "settings"
  | "orgs"
  | "generators"
  | "shares";

export type SettingsTab =
  | "account"
  | "backup"
  | "security"
  | "privacy"
  | "mail"
  | "workspace"
  | "about";

export type WorkspaceMode = "personal" | "org";

export interface FolderNav {
  id: string;
  name: string;
  count: number;
}

export interface OrgNav {
  id: string;
  name: string;
  memberCount: number;
  role?: string;
}

const SETTINGS_NAV: Array<{
  id: SettingsTab;
  label: string;
  Icon: typeof IconUser;
}> = [
  { id: "account", label: "Account", Icon: IconUser },
  { id: "security", label: "Security", Icon: IconShield },
  { id: "privacy", label: "Privacy", Icon: IconLock },
  { id: "mail", label: "Mail", Icon: IconExternal },
  { id: "backup", label: "Backup", Icon: IconDownload },
  { id: "about", label: "About", Icon: IconInfo },
];

interface Props {
  vaultName: string;
  vaultEmail?: string | null;
  section: MainSection;
  settingsTab?: SettingsTab;
  workspaceMode: WorkspaceMode;
  activeOrg?: OrgNav | null;
  filter: VaultFilter;
  folderId: string | null;
  tag: string | null;
  folders: FolderNav[];
  tags: string[];
  orgs?: OrgNav[];
  counts: Partial<Record<VaultFilter, number>>;
  search: string;
  searchRef?: RefObject<HTMLInputElement | null>;
  theme: "dark" | "light";
  onHome: () => void;
  onPersonalVault: () => void;
  onSection: (s: MainSection) => void;
  onSettingsTab?: (t: SettingsTab) => void;
  onFilter: (f: VaultFilter) => void;
  onFolder: (id: string | null) => void;
  onTag: (tag: string | null) => void;
  onSearch: (q: string) => void;
  onLock: () => void;
  onSignOut?: () => void;
  onAdd: () => void;
  onNewFolder: () => void;
  onToggleTheme: () => void;
  onSecretDropped?: (secretId: string, folderId: string | null) => void;
  onSelectOrg?: (id: string) => void;
  onExitOrg?: () => void;
  children: ReactNode;
}

function initials(email?: string | null, name?: string) {
  if (email?.includes("@")) return email.slice(0, 2).toUpperCase();
  return (name ?? "OV").slice(0, 2).toUpperCase();
}

export function AppShell({
  vaultName,
  vaultEmail,
  section,
  settingsTab = "account",
  workspaceMode,
  activeOrg,
  filter,
  folderId,
  tag,
  folders,
  tags,
  orgs = [],
  counts,
  search,
  searchRef,
  theme,
  onHome,
  onPersonalVault,
  onSection,
  onSettingsTab,
  onFilter,
  onFolder,
  onTag,
  onSearch,
  onLock,
  onSignOut,
  onAdd,
  onNewFolder,
  onToggleTheme,
  onSecretDropped,
  onSelectOrg,
  onExitOrg,
  children,
}: Props) {
  function goSettings(tab: SettingsTab) {
    onSection("settings");
    onSettingsTab?.(tab);
  }

  const headerLabel =
    workspaceMode === "org" && activeOrg
      ? activeOrg.name
      : section === "home"
        ? "Home"
        : section === "orgs"
          ? "Organizations"
          : section === "shares"
        ? "Shares"
        : section === "generators"
            ? "Generators"
            : section === "settings"
              ? "Settings"
              : tag
                ? `#${tag}`
                : folderId
                  ? folders.find((f) => f.id === folderId)?.name ?? "Folder"
                  : filterLabel(filter);

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--ov-bg)] text-[var(--ov-fg)]">
      <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--ov-border)] bg-[var(--ov-sidebar)]">
        <div className="ov-accent-bar h-0.5 w-full shrink-0" />

        <div className="shrink-0 border-b border-[var(--ov-border)] px-3 py-3">
          <button
            type="button"
            onClick={onHome}
            className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-[var(--ov-hover)]"
            title="Home"
          >
            <OpsVaultLogo className="h-8 w-8" />
            <span className="text-[15px] font-semibold tracking-tight">
              Ops<span className="text-[var(--ov-accent)]">Vault</span>
            </span>
          </button>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-3">
          <div className="space-y-0.5">
            <NavBtn
              active={section === "home" && workspaceMode === "personal"}
              onClick={onHome}
              icon={<IconHome className="h-4 w-4" />}
              label="Home"
            />
            <NavBtn
              active={
                section === "vault" &&
                workspaceMode === "personal" &&
                filter === "all" &&
                !folderId &&
                !tag
              }
              onClick={onPersonalVault}
              icon={<IconVault className="h-4 w-4" />}
              label="My vault"
              badge={counts.all}
            />
            <NavBtn
              active={section === "shares"}
              onClick={() => onSection("shares")}
              icon={<IconExternal className="h-4 w-4" />}
              label="Shares"
            />
            <NavBtn
              active={section === "generators"}
              onClick={() => onSection("generators")}
              icon={<IconDice className="h-4 w-4" />}
              label="Generators"
            />
            <NavBtn
              active={section === "orgs" || workspaceMode === "org"}
              onClick={() => onSection("orgs")}
              icon={<IconBuilding className="h-4 w-4" />}
              label="Organizations"
              badge={orgs.length || undefined}
            />
          </div>

          {/* Personal vault types only when in personal mode */}
          {workspaceMode === "personal" && (
            <>
              <div>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ov-faint)]">
                  Types
                </p>
                <div className="space-y-0.5">
                  {FILTER_ORDER.filter((f) => f !== "all").map((f) => {
                    const Icon = filterIcon(f);
                    const active =
                      section === "vault" && filter === f && !folderId && !tag;
                    return (
                      <NavBtn
                        key={f}
                        active={active}
                        onClick={() => {
                          onPersonalVault();
                          onFilter(f);
                          onFolder(null);
                          onTag(null);
                        }}
                        icon={<Icon className="h-4 w-4 opacity-80" />}
                        label={filterLabel(f)}
                        badge={counts[f]}
                      />
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ov-faint)]">
                    Folders
                  </p>
                  <button
                    type="button"
                    onClick={onNewFolder}
                    className="text-xs font-medium text-[var(--ov-accent)] hover:underline"
                  >
                    +
                  </button>
                </div>
                <div className="space-y-0.5">
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        onPersonalVault();
                        onFolder(f.id);
                        onTag(null);
                        onFilter("all");
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sid =
                          e.dataTransfer.getData("text/opsvault-secret");
                        if (sid && onSecretDropped) onSecretDropped(sid, f.id);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                        folderId === f.id
                          ? "bg-[var(--ov-accent-soft)] text-[var(--ov-accent)]"
                          : "text-[var(--ov-muted)] hover:bg-[var(--ov-hover)]"
                      )}
                    >
                      <IconFolder className="h-3.5 w-3.5" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="tabular-nums text-[11px] text-[var(--ov-faint)]">
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {orgs.length > 0 && (
            <div>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ov-faint)]">
                Switch to org
              </p>
              <div className="space-y-0.5">
                {orgs.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onSelectOrg?.(o.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                      workspaceMode === "org" && activeOrg?.id === o.id
                        ? "bg-[var(--ov-accent-soft)] text-[var(--ov-accent)]"
                        : "text-[var(--ov-muted)] hover:bg-[var(--ov-hover)] hover:text-[var(--ov-fg)]"
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--ov-secondary-soft)] text-[10px] font-bold text-[var(--ov-accent)]">
                      {o.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tags.length > 0 && workspaceMode === "personal" && (
            <div>
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ov-faint)]">
                Tags
              </p>
              <div className="space-y-0.5">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onPersonalVault();
                      onTag(tag === t ? null : t);
                      onFolder(null);
                      onFilter("all");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                      tag === t
                        ? "bg-[var(--ov-accent-soft)] text-[var(--ov-accent)]"
                        : "text-[var(--ov-muted)] hover:bg-[var(--ov-hover)]"
                    )}
                  >
                    <IconTag className="h-3.5 w-3.5" />
                    <span className="truncate">{t}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ov-faint)]">
              Settings
            </p>
            <div className="space-y-0.5">
              {SETTINGS_NAV.map((item) => {
                const Icon = item.Icon;
                return (
                  <NavBtn
                    key={item.id}
                    active={section === "settings" && settingsTab === item.id}
                    onClick={() => goSettings(item.id)}
                    icon={<Icon className="h-4 w-4" />}
                    label={item.label}
                  />
                );
              })}
            </div>
          </div>
        </nav>

        <div className="shrink-0 border-t border-[var(--ov-border)] p-2.5">
          <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-[var(--ov-soft)] px-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ov-accent)] text-[11px] font-bold text-white">
              {initials(vaultEmail, vaultName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--ov-fg)]">
                {vaultName}
              </p>
              {vaultEmail && (
                <p className="truncate text-[10px] text-[var(--ov-faint)]">
                  {vaultEmail}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onToggleTheme}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--ov-muted)] hover:bg-[var(--ov-hover)]"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? (
                <IconSun className="h-3.5 w-3.5" />
              ) : (
                <IconMoon className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={onLock}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--ov-muted)] hover:bg-[var(--ov-hover)]"
              title="Lock"
            >
              <IconLock className="h-3.5 w-3.5" />
            </button>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="flex flex-1 items-center justify-center rounded-lg px-2 py-1.5 text-xs text-[var(--ov-muted)] hover:bg-[var(--ov-hover)]"
              >
                Out
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--ov-border)] bg-[var(--ov-header)] px-5 backdrop-blur-md">
          {/* Workspace switcher — personal vs org ecosystem */}
          <div className="shrink-0">
            <select
              value={
                workspaceMode === "org" && activeOrg
                  ? `org:${activeOrg.id}`
                  : "personal"
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "personal") {
                  onExitOrg?.();
                  onPersonalVault();
                } else if (v.startsWith("org:")) {
                  onSelectOrg?.(v.slice(4));
                }
              }}
              className="max-w-[11rem] truncate rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] py-1.5 pl-2.5 pr-7 text-xs font-medium text-[var(--ov-fg)] outline-none focus:ring-2 focus:ring-[var(--ov-accent-ring)] sm:max-w-[14rem] sm:text-sm"
              title="Switch vault ecosystem"
            >
              <option value="personal">Personal vault</option>
              {orgs.map((o) => (
                <option key={o.id} value={`org:${o.id}`}>
                  Org · {o.name}
                </option>
              ))}
            </select>
          </div>
          <h1 className="hidden min-w-0 shrink truncate text-sm font-semibold text-[var(--ov-fg)] md:block md:max-w-[10rem]">
            {headerLabel}
          </h1>
          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ov-faint)]" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={
                workspaceMode === "org" ? "Search org vault…" : "Search vault…"
              }
              className="w-full max-w-md rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] py-2 pl-9 pr-3 text-sm text-[var(--ov-fg)] outline-none placeholder:text-[var(--ov-faint)] focus:border-[var(--ov-accent)]/50 focus:ring-2 focus:ring-[var(--ov-accent-ring)]"
            />
          </div>
          {(section === "vault" ||
            (workspaceMode === "org" && section === "orgs")) && (
            <Button onClick={onAdd} className="shrink-0 gap-1.5">
              <IconPlus className="h-4 w-4" />
              New
            </Button>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-5 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
        active
          ? "bg-[var(--ov-accent-soft)] font-medium text-[var(--ov-accent)]"
          : "text-[var(--ov-muted)] hover:bg-[var(--ov-hover)] hover:text-[var(--ov-fg)]"
      )}
    >
      <span className="text-current opacity-90">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="tabular-nums text-[11px] text-[var(--ov-faint)]">
          {badge}
        </span>
      )}
    </button>
  );
}
