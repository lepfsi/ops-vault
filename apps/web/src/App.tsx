import {
  resolveOrgKey,
  type MasterKey,
  type SecretMeta,
  type SecretType,
} from "@ops-vault/core";
import { Button, Card } from "@ops-vault/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { AcceptInvitePage } from "./components/AcceptInvitePage";
import { AddSecretForm } from "./components/AddSecretForm";
import { AuthPanel } from "./components/AuthPanel";
import { ClaimSharePage } from "./components/ClaimSharePage";
import { GeneratorsView } from "./components/GeneratorsView";
import { HomeDashboard } from "./components/HomeDashboard";
import { SecretDetailDrawer } from "./components/SecretDetailDrawer";
import { SecretList } from "./components/SecretList";
import { SettingsView } from "./components/SettingsView";
import { SharesPage } from "./components/SharesPage";
import { WorkspacePanel } from "./components/WorkspacePanel";
import {
  AppShell,
  type MainSection,
  type OrgNav,
  type SettingsTab,
  type WorkspaceMode,
} from "./components/layout/AppShell";
import { LockScreen } from "./components/layout/LockScreen";
import { useHotkeys } from "./hooks/useHotkeys";
import { useTheme } from "./hooks/useTheme";
import { useVaultSession } from "./hooks/useVaultSession";
import * as api from "./lib/api";
import { type VaultFilter } from "./lib/secretMeta";

function parseHashRoute():
  | { kind: "claim"; token: string }
  | { kind: "invite"; token: string }
  | null {
  const h = window.location.hash.replace(/^#/, "");
  const claim = h.match(/^\/?claim\/([a-f0-9]+)/i);
  if (claim) return { kind: "claim", token: claim[1]! };
  const inv = h.match(/^\/?invite\/([a-f0-9]+)/i);
  if (inv) return { kind: "invite", token: inv[1]! };
  return null;
}

/** One-shot meta load for Home counts/folders without mounting SecretList. */
function HomeMetaLoader({
  refreshToken,
  onCounts,
  onMeta,
}: {
  refreshToken: number;
  onCounts: (c: Partial<Record<VaultFilter, number>>) => void;
  onMeta: (m: {
    folders: { id: string; name: string; count: number }[];
    tags: string[];
  }) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [{ items: list }, { folders }, { tags }] = await Promise.all([
          api.listSecrets({ workspaceId: null }),
          api.listFolders(),
          api.listTags(),
        ]);
        if (cancelled) return;
        const counts: Partial<Record<VaultFilter, number>> = {
          all: list.length,
        };
        for (const it of list) {
          counts[it.type] = (counts[it.type] ?? 0) + 1;
        }
        const fcounts: Record<string, number> = {};
        for (const f of folders) fcounts[f.id] = 0;
        for (const it of list) {
          if (it.folderId && fcounts[it.folderId] !== undefined) {
            fcounts[it.folderId]!++;
          }
        }
        onCounts(counts);
        onMeta({
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            count: fcounts[f.id] ?? 0,
          })),
          tags,
        });
      } catch {
        /* ignore — home still usable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, onCounts, onMeta]);
  return null;
}

export default function App() {
  const session = useVaultSession();
  const { theme, toggle: toggleTheme } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  const [refreshToken, setRefreshToken] = useState(0);
  const [creatingExtra, setCreatingExtra] = useState(false);
  const [route, setRoute] = useState(parseHashRoute);

  const [section, setSection] = useState<MainSection>("home");
  const [filter, setFilter] = useState<VaultFilter>("all");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("account");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<SecretMeta | null>(null);
  const [counts, setCounts] = useState<Partial<Record<VaultFilter, number>>>({
    all: 0,
  });
  const [folders, setFolders] = useState<
    { id: string; name: string; count: number }[]
  >([]);
  const [tags, setTags] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<OrgNav[]>([]);
  const [focusOrgId, setFocusOrgId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("personal");
  const [addType, setAddType] = useState<SecretType | undefined>(undefined);
  const [orgKey, setOrgKey] = useState<MasterKey | null>(null);
  const [orgGroups, setOrgGroups] = useState<
    Array<{ id: string; name: string }>
  >([]);

  const unlocked =
    session.phase === "unlocked" && !!session.key && !!session.vault;

  const onCounts = useCallback(
    (c: Partial<Record<VaultFilter, number>>) => setCounts(c),
    []
  );
  const onMeta = useCallback(
    (m: {
      folders: { id: string; name: string; count: number }[];
      tags: string[];
    }) => {
      setFolders(m.folders);
      setTags(m.tags);
    },
    []
  );

  // Resolve org vault key (local → server package sealed with master key)
  useEffect(() => {
    if (workspaceMode !== "org" || !focusOrgId || !session.key) {
      setOrgKey(null);
      setOrgGroups([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const key = await resolveOrgKey(focusOrgId, session.key!, async () => {
        try {
          const { sealedKey } = await api.getWorkspaceOrgKey(focusOrgId);
          return sealedKey;
        } catch {
          return null;
        }
      });
      if (!cancelled) setOrgKey(key);
      try {
        const { groups } = await api.listGroups(focusOrgId);
        if (!cancelled) setOrgGroups(groups);
      } catch {
        if (!cancelled) setOrgGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceMode, focusOrgId, session.key]);

  useEffect(() => {
    const onHash = () => setRoute(parseHashRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useHotkeys({
    enabled: unlocked && !creatingExtra,
    onSearch: () => {
      setSection("vault");
      searchRef.current?.focus();
      searchRef.current?.select();
    },
    onNew: () => {
      setSection("vault");
      setShowAdd(true);
      setSelected(null);
    },
    onEscape: () => {
      setShowAdd(false);
      setSelected(null);
    },
  });

  // Load orgs for sidebar / home — never wipe list on transient API errors
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    void (async () => {
      try {
        const { workspaces } = await api.listWorkspaces();
        if (cancelled) return;
        setOrgs(
          workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            memberCount: w.memberCount,
            role: w.role,
          }))
        );
      } catch {
        /* keep previous orgs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, refreshToken]);

  const authPanel = (
    <AuthPanel
      key={
        session.vault && !creatingExtra
          ? `unlock-${session.vault.id}`
          : "auth-gate"
      }
      phase={
        session.phase === "error"
          ? "locked"
          : session.phase === "unlocking"
            ? "unlocking"
            : session.vault && !creatingExtra
              ? "locked"
              : "setup"
      }
      hasLocalVault={Boolean(session.vault) && !creatingExtra}
      vaultName={session.vault?.name}
      vaultEmail={session.vault?.email}
      hasRecovery={Boolean(session.vault?.recovery)}
      lastEmail={session.lastEmail}
      error={session.error}
      onLogin={async (email, password) => {
        await session.login(email, password);
        setCreatingExtra(false);
        setSection("home");
        setRefreshToken((n) => n + 1);
      }}
      onRegister={async (email, password, opts) => {
        await session.register(email, password, opts);
        setCreatingExtra(false);
        setSection("home");
        setRefreshToken((n) => n + 1);
      }}
      onUnlock={async (password) => {
        await session.unlock(password);
        setSection("home");
        setRefreshToken((n) => n + 1);
      }}
      onUnlockRecovery={session.unlockRecovery}
      onSwitchAccount={() => {
        session.signOut();
        setCreatingExtra(false);
      }}
    />
  );

  if (route?.kind === "claim") {
    return (
      <LockScreen
        footer={
          <button
            type="button"
            className="text-cyan-600 hover:underline dark:text-cyan-500"
            onClick={() => {
              window.location.hash = "";
              setRoute(null);
            }}
          >
            Back to OpsVault
          </button>
        }
      >
        <ClaimSharePage
          token={route.token}
          masterKey={session.key}
          unlocked={unlocked}
          onError={session.setError}
          onImported={() => {
            setRefreshToken((n) => n + 1);
            window.location.hash = "";
            setRoute(null);
          }}
          onNeedUnlock={() => undefined}
        />
        {session.error && (
          <p className="mt-3 text-center text-sm text-red-500">
            {session.error}
          </p>
        )}
        {!unlocked && <div className="mt-4">{authPanel}</div>}
      </LockScreen>
    );
  }

  if (route?.kind === "invite") {
    return (
      <LockScreen
        footer={
          <button
            type="button"
            className="text-cyan-600 hover:underline dark:text-cyan-500"
            onClick={() => {
              window.location.hash = "";
              setRoute(null);
            }}
          >
            Back to OpsVault
          </button>
        }
      >
        <AcceptInvitePage
          token={route.token}
          unlocked={unlocked}
          onError={session.setError}
          onAccepted={(workspaceId) => {
            window.location.hash = "";
            setRoute(null);
            setFocusOrgId(workspaceId);
            setWorkspaceMode("org");
            setSection("orgs");
            setRefreshToken((n) => n + 1);
          }}
          onNeedUnlock={() => undefined}
        />
        {!unlocked && <div className="mt-4">{authPanel}</div>}
      </LockScreen>
    );
  }

  const showLock =
    session.phase === "setup" ||
    session.phase === "locked" ||
    session.phase === "unlocking" ||
    session.phase === "error" ||
    creatingExtra;

  if (session.phase === "loading") {
    return (
      <LockScreen>
        <p className="text-center text-sm text-[var(--ov-muted)]">Loading…</p>
      </LockScreen>
    );
  }

  if (showLock) {
    return (
      <LockScreen
        footer={
          creatingExtra && session.vault ? (
            <Button variant="ghost" onClick={() => setCreatingExtra(false)}>
              Cancel
            </Button>
          ) : session.phase === "error" ? (
            <button
              type="button"
              onClick={() => void session.refreshVault()}
              className="text-cyan-600 hover:underline dark:text-cyan-500"
            >
              Retry
            </button>
          ) : null
        }
      >
        {creatingExtra ? (
          <AuthPanel
            phase={session.phase === "unlocking" ? "unlocking" : "setup"}
            hasLocalVault={false}
            lastEmail={session.lastEmail}
            error={session.error}
            onLogin={async (email, password) => {
              await session.login(email, password);
              setCreatingExtra(false);
              setSection("home");
              setRefreshToken((n) => n + 1);
            }}
            onRegister={async (email, password, opts) => {
              await session.register(email, password, opts);
              setCreatingExtra(false);
              setSection("home");
              setRefreshToken((n) => n + 1);
            }}
            onUnlock={async () => undefined}
            onSwitchAccount={() => setCreatingExtra(false)}
          />
        ) : (
          authPanel
        )}
      </LockScreen>
    );
  }

  if (!session.key || !session.vault) {
    return null;
  }

  const defaultAddType: SecretType | undefined =
    addType ?? (filter !== "all" ? filter : undefined);

  function goHome() {
    setWorkspaceMode("personal");
    setSection("home");
    setShowAdd(false);
    setSelected(null);
    setFilter("all");
    setFolderId(null);
    setTag(null);
    setSearch("");
    setFocusOrgId(null);
  }

  function goPersonalVault() {
    setWorkspaceMode("personal");
    setSection("vault");
    setFocusOrgId(null);
  }

  function enterOrg(id: string) {
    // Org is a separate context — personal vault stays untouched
    setWorkspaceMode("org");
    setFocusOrgId(id);
    setSection("orgs");
    setShowAdd(false);
    setSelected(null);
  }

  function exitOrg() {
    setWorkspaceMode("personal");
    setFocusOrgId(null);
    setSection("home");
  }

  const activeOrg = orgs.find((o) => o.id === focusOrgId) ?? null;

  async function handleNewFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    try {
      await api.createFolder(name.trim());
      setRefreshToken((n) => n + 1);
    } catch (err) {
      session.setError(
        err instanceof Error ? err.message : "Folder create failed"
      );
    }
  }

  return (
    <>
      <AppShell
        vaultName={session.vault.name}
        vaultEmail={session.vault.email}
        section={section}
        settingsTab={settingsTab}
        workspaceMode={workspaceMode}
        activeOrg={activeOrg}
        filter={filter}
        folderId={folderId}
        tag={tag}
        folders={folders}
        tags={tags}
        orgs={orgs}
        counts={counts}
        search={search}
        searchRef={searchRef}
        theme={theme}
        onHome={goHome}
        onPersonalVault={goPersonalVault}
        onSection={(s) => {
          // Only home / personal vault types force personal mode
          if (s === "home" || s === "vault") {
            setWorkspaceMode("personal");
          }
          // generators, settings, orgs keep current workspace mode
          setSection(s);
        }}
        onSettingsTab={setSettingsTab}
        onFilter={setFilter}
        onFolder={setFolderId}
        onTag={setTag}
        onSearch={setSearch}
        onLock={session.lock}
        onSignOut={session.signOut}
        onAdd={() => {
          setAddType(undefined);
          setShowAdd(true);
          setSelected(null);
          if (workspaceMode === "org") {
            setSection("orgs");
          } else {
            setWorkspaceMode("personal");
            setSection("vault");
          }
        }}
        onNewFolder={() => void handleNewFolder()}
        onToggleTheme={toggleTheme}
        onSelectOrg={enterOrg}
        onExitOrg={exitOrg}
        onSecretDropped={async (secretId, dropFolderId) => {
          try {
            await api.updateSecret(secretId, { folderId: dropFolderId });
            setRefreshToken((n) => n + 1);
          } catch (err) {
            session.setError(
              err instanceof Error ? err.message : "Move failed"
            );
          }
        }}
      >
        {session.error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {session.error}
            <button
              type="button"
              className="ml-3 text-xs underline opacity-80"
              onClick={() => session.setError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {section === "home" && workspaceMode === "personal" && (
          <HomeDashboard
            vaultName={session.vault.name}
            secretCount={counts.all ?? 0}
            masterKey={session.key}
            orgs={orgs}
            onOpenVault={goPersonalVault}
            onNewItem={() => {
              setAddType("password");
              goPersonalVault();
              setShowAdd(true);
            }}
            onNewNote={() => {
              setAddType("note");
              goPersonalVault();
              setShowAdd(true);
            }}
            onOpenOrgs={() => setSection("orgs")}
            onSelectOrg={enterOrg}
            onOpenGenerators={() => setSection("generators")}
            onError={session.setError}
            onOpenSecretId={(id) => {
              void (async () => {
                try {
                  const item = await api.getSecret(id);
                  setSelected(item);
                } catch (err) {
                  session.setError(
                    err instanceof Error ? err.message : "Open failed"
                  );
                }
              })();
            }}
          />
        )}

        {section === "shares" && (
          <SharesPage
            masterKey={session.key}
            workspaceId={workspaceMode === "org" ? focusOrgId : null}
            onError={session.setError}
          />
        )}

        {section === "generators" && <GeneratorsView />}

        {section === "orgs" && (
          <div className="space-y-6">
            {workspaceMode === "org" && focusOrgId && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {activeOrg?.name ?? "Organization"} vault
                    </h2>
                    <p className="text-sm text-[var(--ov-muted)]">
                      Org ecosystem · shared / private / groups
                      {!orgKey && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">
                          · initializing key…
                        </span>
                      )}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" onClick={exitOrg}>
                    Personal vault
                  </Button>
                </div>

                {showAdd && (
                  <Card className="border-[var(--ov-border)] p-5">
                    <AddSecretForm
                      masterKey={session.key}
                      orgKey={orgKey}
                      workspaceId={focusOrgId}
                      groups={orgGroups}
                      defaultType={defaultAddType}
                      folders={folders}
                      onCreated={() => {
                        setRefreshToken((n) => n + 1);
                        setShowAdd(false);
                        setAddType(undefined);
                      }}
                      onError={session.setError}
                      onClose={() => {
                        setShowAdd(false);
                        setAddType(undefined);
                      }}
                    />
                  </Card>
                )}

                <SecretList
                  refreshToken={refreshToken}
                  filter={filter}
                  search={search}
                  folderId={folderId}
                  tag={tag}
                  workspaceId={focusOrgId}
                  selectedId={selected?.id}
                  onSelect={setSelected}
                  onError={session.setError}
                  onMoved={() => setRefreshToken((n) => n + 1)}
                />
              </div>
            )}

            <WorkspacePanel
              masterKey={session.key}
              onError={session.setError}
              focusId={focusOrgId}
              onEnteredOrg={(id) => {
                enterOrg(id);
              }}
            />
          </div>
        )}

        {section === "vault" && workspaceMode === "personal" && (
          <div className="space-y-5">
            {showAdd && (
              <Card className="border-[var(--ov-border)] p-5">
                <AddSecretForm
                  masterKey={session.key}
                  defaultType={defaultAddType}
                  defaultFolderId={folderId}
                  folders={folders}
                  onCreated={() => {
                    setRefreshToken((n) => n + 1);
                    setShowAdd(false);
                    setAddType(undefined);
                  }}
                  onError={session.setError}
                  onClose={() => {
                    setShowAdd(false);
                    setAddType(undefined);
                  }}
                />
              </Card>
            )}

            <SecretList
              refreshToken={refreshToken}
              filter={filter}
              search={search}
              folderId={folderId}
              tag={tag}
              workspaceId={null}
              selectedId={selected?.id}
              onSelect={setSelected}
              onError={session.setError}
              onMoved={() => setRefreshToken((n) => n + 1)}
              onCounts={onCounts}
              onMeta={onMeta}
            />
          </div>
        )}

        {section === "settings" && (
          <SettingsView
            tab={settingsTab}
            onTab={setSettingsTab}
            masterKey={session.key}
            vault={session.vault}
            onImported={() => {
              setRefreshToken((n) => n + 1);
              void session.refreshVault();
            }}
            onRecoveryUpdated={() => void session.refreshVault()}
            onRekeyed={(newKey) => {
              session.replaceKey(newKey);
              void session.refreshVault();
              setRefreshToken((n) => n + 1);
            }}
            onError={session.setError}
            onVaultDeleted={() => {
              session.signOut();
            }}
            activeOrgId={
              workspaceMode === "org" ? focusOrgId : null
            }
            activeOrgName={activeOrg?.name ?? null}
            onOrgDeleted={() => {
              exitOrg();
              setRefreshToken((n) => n + 1);
            }}
          />
        )}
      </AppShell>

      {/* Lightweight meta refresh on home (no SecretList mount — avoids loops) */}
      {section === "home" && unlocked && (
        <HomeMetaLoader
          refreshToken={refreshToken}
          onCounts={onCounts}
          onMeta={onMeta}
        />
      )}

      <SecretDetailDrawer
        open={!!selected}
        secret={selected}
        masterKey={session.key}
        orgKey={orgKey}
        workspaceId={workspaceMode === "org" ? focusOrgId : null}
        folders={folders}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null);
          setRefreshToken((n) => n + 1);
        }}
        onUpdated={() => {
          setRefreshToken((n) => n + 1);
        }}
        onError={session.setError}
      />
    </>
  );
}
