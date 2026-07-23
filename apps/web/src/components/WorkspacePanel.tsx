import {
  generateOrgKey,
  loadOrgKeyLocal,
  openOrgKeyFromToken,
  openOrgKeyWithMaster,
  sealOrgKeyForToken,
  sealOrgKeyWithMaster,
  storeOrgKeyLocal,
  type MasterKey,
} from "@ops-vault/core";
import { Button } from "@ops-vault/ui";
import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";

interface Props {
  masterKey?: MasterKey | null;
  onError: (msg: string) => void;
  focusId?: string | null;
  onEnteredOrg?: (id: string) => void;
}

export function WorkspacePanel({
  masterKey,
  onError,
  focusId,
  onEnteredOrg,
}: Props) {
  const [workspaces, setWorkspaces] = useState<
    Array<{
      id: string;
      name: string;
      memberCount: number;
      role?: string;
    }>
  >([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<
    Array<{ id: string; email: string; role: string; status: string }>
  >([]);
  const [groups, setGroups] = useState<
    Array<{ id: string; name: string; memberCount: number }>
  >([]);
  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [joinToken, setJoinToken] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupMemberId, setGroupMemberId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { workspaces: list } = await api.listWorkspaces();
      setWorkspaces(list);
      if (focusId && list.some((w) => w.id === focusId)) {
        setSelected(focusId);
      } else if (selected && !list.some((w) => w.id === selected)) {
        setSelected(null);
        setMembers([]);
        setGroups([]);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Workspaces load failed");
    }
  }, [onError, selected, focusId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    void (async () => {
      try {
        const [{ members: m }, { groups: g }] = await Promise.all([
          api.listWorkspaceMembers(selected),
          api.listGroups(selected),
        ]);
        setMembers(m);
        setGroups(g);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Members load failed");
      }
    })();
  }, [selected, onError]);

  async function ensureOrgKeyUploaded(workspaceId: string, key: MasterKey) {
    if (!masterKey) return;
    const sealed = await sealOrgKeyWithMaster(key, masterKey);
    await api.putWorkspaceOrgKey(workspaceId, sealed);
  }

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { workspace } = await api.createWorkspace(name.trim());
      const orgKey = generateOrgKey();
      storeOrgKeyLocal(workspace.id, orgKey);
      await ensureOrgKeyUploaded(workspace.id, orgKey);
      setName("");
      await load();
      setSelected(workspace.id);
      onEnteredOrg?.(workspace.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!joinToken.trim()) return;
    setBusy(true);
    try {
      let token = joinToken.trim();
      const m = token.match(/invite\/([a-f0-9]+)/i);
      if (m) token = m[1]!;
      const result = await api.joinWorkspace(token);
      if (result.sealedOrgKey && masterKey) {
        try {
          const key = await openOrgKeyFromToken(result.sealedOrgKey, token);
          storeOrgKeyLocal(result.workspaceId, key);
          const sealed = await sealOrgKeyWithMaster(key, masterKey);
          await api.putWorkspaceOrgKey(result.workspaceId, sealed);
        } catch {
          /* key open optional */
        }
      }
      setJoinToken("");
      if (result.workspaceId) onEnteredOrg?.(result.workspaceId);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  async function invite() {
    if (!selected || !email.trim()) return;
    setBusy(true);
    try {
      let orgKey = loadOrgKeyLocal(selected);
      if (!orgKey && masterKey) {
        const { sealedKey } = await api.getWorkspaceOrgKey(selected);
        if (sealedKey) {
          const { openOrgKeyWithMaster } = await import("@ops-vault/core");
          orgKey = await openOrgKeyWithMaster(sealedKey, masterKey);
          storeOrgKeyLocal(selected, orgKey);
        }
      }
      const { member } = await api.inviteWorkspaceMember(
        selected,
        email.trim(),
        role,
        null
      );
      if (orgKey) {
        const sealed = await sealOrgKeyForToken(orgKey, member.inviteToken);
        await api.setMemberSealedOrgKey(selected, member.id, sealed);
      }
      setEmail("");
      const link = `${window.location.origin}${window.location.pathname}#/invite/${member.inviteToken}`;
      setLastInviteLink(link);
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        /* ignore */
      }
      const { members: m } = await api.listWorkspaceMembers(selected);
      setMembers(m);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function setMemberRole(
    memberId: string,
    next: "admin" | "member" | "viewer"
  ) {
    if (!selected) return;
    try {
      await api.updateMember(selected, memberId, { role: next });
      const { members: m } = await api.listWorkspaceMembers(selected);
      setMembers(m);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Role update failed");
    }
  }

  async function revoke(memberId: string) {
    if (!selected) return;
    try {
      await api.updateMember(selected, memberId, { revoke: true });
      const { members: m } = await api.listWorkspaceMembers(selected);
      setMembers(m);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  async function createGroup() {
    if (!selected || !groupName.trim()) return;
    setBusy(true);
    try {
      await api.createGroup(selected, groupName.trim());
      setGroupName("");
      const { groups: g } = await api.listGroups(selected);
      setGroups(g);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Group create failed");
    } finally {
      setBusy(false);
    }
  }

  async function addToGroup() {
    if (!selected || !selectedGroup || !groupMemberId) return;
    try {
      await api.addGroupMember(selected, selectedGroup, groupMemberId);
      const { groups: g } = await api.listGroups(selected);
      setGroups(g);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Add to group failed");
    }
  }

  async function initOrgKey() {
    if (!selected || !masterKey) return;
    setBusy(true);
    try {
      // Try server package first
      const { sealedKey } = await api.getWorkspaceOrgKey(selected);
      if (sealedKey) {
        const key = await openOrgKeyWithMaster(sealedKey, masterKey);
        storeOrgKeyLocal(selected, key);
      } else {
        const orgKey = generateOrgKey();
        storeOrgKeyLocal(selected, orgKey);
        await ensureOrgKeyUploaded(selected, orgKey);
      }
      onEnteredOrg?.(selected);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Init key failed");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "min-w-[160px] flex-1 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-sm text-[var(--ov-fg)]";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Organizations</h3>
        <p className="mt-0.5 text-sm text-[var(--ov-muted)]">
          Create or join an org vault. Groups limit who sees shared secrets.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-4">
          <p className="text-sm font-medium">Create organization</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Unique name"
              className={field}
            />
            <Button type="button" disabled={busy} onClick={() => void create()}>
              Create
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-4">
          <p className="text-sm font-medium">Join with invite</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={joinToken}
              onChange={(e) => setJoinToken(e.target.value)}
              placeholder="Invite token or link"
              className={field}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void join()}
            >
              Join
            </Button>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-[var(--ov-border)] rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)]">
        {workspaces.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[var(--ov-muted)]">
            No organizations yet
          </li>
        )}
        {workspaces.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              onClick={() => {
                setSelected(w.id);
                onEnteredOrg?.(w.id);
              }}
              className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[var(--ov-hover)] ${
                selected === w.id ? "bg-[var(--ov-accent-soft)]" : ""
              }`}
            >
              <span className="font-medium">{w.name}</span>
              <span className="text-xs text-[var(--ov-muted)]">
                {w.role ?? "member"} · {w.memberCount}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="space-y-4">
          {!loadOrgKeyLocal(selected) && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <p className="text-amber-800 dark:text-amber-200">
                Org vault key missing on this device.
              </p>
              <Button
                type="button"
                className="mt-2"
                disabled={busy || !masterKey}
                onClick={() => void initOrgKey()}
              >
                Initialize org vault key
              </Button>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-4">
            <p className="text-sm font-medium">Members</p>
            <ul className="space-y-2 text-sm">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ov-border)] pb-2"
                >
                  <div>
                    <span className="font-medium">{m.email}</span>
                    <span className="ml-2 text-xs text-[var(--ov-faint)]">
                      {m.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="rounded border border-[var(--ov-border)] bg-[var(--ov-input)] px-2 py-1 text-xs"
                      value={m.role}
                      disabled={m.status === "revoked"}
                      onChange={(e) =>
                        void setMemberRole(
                          m.id,
                          e.target.value as "admin" | "member" | "viewer"
                        )
                      }
                    >
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                      <option value="viewer">viewer</option>
                    </select>
                    {m.status !== "revoked" && (
                      <button
                        type="button"
                        className="text-xs text-red-500"
                        onClick={() => void revoke(m.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                className={field}
              />
              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "admin" | "member" | "viewer")
                }
                className="rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-2 py-2 text-sm"
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void invite()}
              >
                Invite
              </Button>
            </div>
            {lastInviteLink && (
              <p className="break-all text-xs text-[var(--ov-accent)]">
                Invite copied: {lastInviteLink}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-4">
            <p className="text-sm font-medium">Groups</p>
            <p className="text-xs text-[var(--ov-muted)]">
              Share secrets with a group only (e.g. Admins — not interns).
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className={field}
              />
              <Button
                type="button"
                disabled={busy}
                onClick={() => void createGroup()}
              >
                Create group
              </Button>
            </div>
            <ul className="space-y-1 text-sm">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedGroup(g.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--ov-hover)] ${
                      selectedGroup === g.id ? "bg-[var(--ov-accent-soft)]" : ""
                    }`}
                  >
                    {g.name}{" "}
                    <span className="text-xs text-[var(--ov-faint)]">
                      · {g.memberCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selectedGroup && (
              <div className="flex flex-wrap gap-2 border-t border-[var(--ov-border)] pt-3">
                <select
                  value={groupMemberId}
                  onChange={(e) => setGroupMemberId(e.target.value)}
                  className="rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-2 py-2 text-sm"
                >
                  <option value="">Select member…</option>
                  {members
                    .filter((m) => m.status === "active" || m.status === "invited")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.email}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void addToGroup()}
                >
                  Add to group
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
