import type {
  FolderItem,
  RecoveryBundle,
  SecretItem,
  SecretMeta,
  SecretType,
  VaultBackupV1,
  VaultRecord,
  VaultRecordWithRecovery,
} from "@ops-vault/core";

const BASE = "/api";

let activeVaultId: string | null = null;

export function setActiveVaultId(id: string | null) {
  activeVaultId = id;
  if (id) localStorage.setItem("ops-vault.activeVaultId", id);
  else localStorage.removeItem("ops-vault.activeVaultId");
}

export function getActiveVaultId(): string | null {
  if (activeVaultId) return activeVaultId;
  const stored = localStorage.getItem("ops-vault.activeVaultId");
  activeVaultId = stored;
  return stored;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const vid = getActiveVaultId();
  if (vid) headers["X-Vault-Id"] = vid;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error(
      "API unreachable. From monorepo root run: pnpm dev  (or pnpm dev:api). Default API port 8790 — set OPS_VAULT_API_PORT if needed."
    );
  }

  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    reason?: string;
  };
  if (!res.ok) {
    const apiMsg = data.error ?? data.reason;
    // Vite proxy often returns 500 HTML when upstream is down
    if (res.status === 500 || res.status === 502 || res.status === 504) {
      throw new Error(
        apiMsg ??
          "API proxy failed (502/504). Restart API: pnpm dev:api — after db changes also: pnpm --filter @ops-vault/db build"
      );
    }
    throw new Error(apiMsg ?? `HTTP ${res.status}`);
  }
  return data;
}

export interface VaultSummary {
  id: string;
  name: string;
  email?: string | null;
  hasRecovery: boolean;
  hasRecoveryEmail?: boolean;
  secretCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function registerAccount(body: {
  email: string;
  recoveryEmail?: string;
  name?: string;
  salt: string;
  verifier: string;
  recovery?: RecoveryBundle | null;
}): Promise<{ vault: VaultRecordWithRecovery }> {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function loginAccount(email: string): Promise<{
  vault: VaultRecordWithRecovery;
}> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function updateAccount(body: {
  email?: string | null;
  recoveryEmail?: string | null;
  name?: string;
}): Promise<{ vault: VaultRecordWithRecovery }> {
  return request("/vault/account", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function listVaults(): Promise<{ vaults: VaultSummary[] }> {
  return request("/vaults");
}

export async function getVaultById(
  id: string
): Promise<{ vault: VaultRecordWithRecovery }> {
  return request(`/vaults/${id}`);
}

export async function getHealth(): Promise<{
  ok: boolean;
  vaultCount: number;
  vaults: Array<{
    id: string;
    name: string;
    hasRecovery?: boolean;
    secrets: number;
  }>;
}> {
  return request("/health");
}

export async function getVault(): Promise<{
  vault: VaultRecordWithRecovery | null;
}> {
  return request("/vault");
}

export async function createVault(body: {
  name: string;
  email?: string;
  recoveryEmail?: string;
  salt: string;
  verifier: string;
  recovery?: RecoveryBundle | null;
}): Promise<{ vault: VaultRecordWithRecovery }> {
  return request("/vaults", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteVault(id: string): Promise<{ ok: boolean }> {
  return request(`/vaults/${id}`, { method: "DELETE" });
}

export async function deleteWorkspace(
  workspaceId: string
): Promise<{ ok: boolean }> {
  return request(`/workspaces/${workspaceId}`, { method: "DELETE" });
}

export async function setRecovery(body: {
  recovery: RecoveryBundle | null;
}): Promise<{ vault: VaultRecordWithRecovery }> {
  return request("/vault/recovery", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function exportVault(): Promise<VaultBackupV1> {
  return request("/vault/export");
}

export async function importVault(body: {
  backup: VaultBackupV1;
  force?: boolean;
  replaceVaultId?: string;
}): Promise<{ vault: VaultRecord; imported: number }> {
  return request("/vault/import", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listSecrets(opts?: {
  workspaceId?: string | null;
}): Promise<{ items: SecretMeta[] }> {
  const q =
    opts?.workspaceId != null && opts.workspaceId !== ""
      ? `?workspaceId=${encodeURIComponent(opts.workspaceId)}`
      : "";
  return request(`/secrets${q}`);
}

export async function getSecret(id: string): Promise<SecretItem> {
  return request(`/secrets/${id}`);
}

export async function createSecret(body: {
  type: SecretType;
  title: string;
  encryptedData: string;
  url?: string | null;
  folderId?: string | null;
  tags?: string[];
  workspaceId?: string | null;
  visibility?: "private" | "org";
  groupId?: string | null;
}): Promise<SecretItem> {
  return request("/secrets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getWorkspaceOrgKey(
  workspaceId: string
): Promise<{ sealedKey: string | null }> {
  return request(`/workspaces/${workspaceId}/org-key`);
}

export async function putWorkspaceOrgKey(
  workspaceId: string,
  sealedKey: string
): Promise<{ ok: boolean }> {
  return request(`/workspaces/${workspaceId}/org-key`, {
    method: "PUT",
    body: JSON.stringify({ sealedKey }),
  });
}

export async function listGroups(workspaceId: string): Promise<{
  groups: Array<{ id: string; name: string; memberCount: number }>;
}> {
  return request(`/workspaces/${workspaceId}/groups`);
}

export async function createGroup(
  workspaceId: string,
  name: string
): Promise<{ group: { id: string; name: string } }> {
  return request(`/workspaces/${workspaceId}/groups`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function addGroupMember(
  workspaceId: string,
  groupId: string,
  memberId: string
): Promise<{ ok: boolean }> {
  return request(`/workspaces/${workspaceId}/groups/${groupId}/members`, {
    method: "POST",
    body: JSON.stringify({ memberId }),
  });
}

export async function removeGroupMember(
  workspaceId: string,
  groupId: string,
  memberId: string
): Promise<{ ok: boolean }> {
  return request(
    `/workspaces/${workspaceId}/groups/${groupId}/members/${memberId}`,
    { method: "DELETE" }
  );
}

export async function updateSecret(
  id: string,
  body: {
    title?: string;
    encryptedData?: string;
    url?: string | null;
    folderId?: string | null;
    tags?: string[];
  }
): Promise<SecretItem> {
  return request(`/secrets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteSecret(id: string): Promise<{ ok: boolean }> {
  return request(`/secrets/${id}`, { method: "DELETE" });
}

export async function listFolders(): Promise<{ folders: FolderItem[] }> {
  return request("/folders");
}

export async function createFolder(name: string): Promise<{ folder: FolderItem }> {
  return request("/folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(id: string): Promise<{ ok: boolean }> {
  return request(`/folders/${id}`, { method: "DELETE" });
}

export async function listTags(): Promise<{ tags: string[] }> {
  return request("/tags");
}

export async function listWorkspaces(): Promise<{
  workspaces: Array<{
    id: string;
    name: string;
    ownerVaultId: string | null;
    memberCount: number;
    createdAt: string;
    role?: string;
  }>;
}> {
  return request("/workspaces");
}

export async function createWorkspace(name: string): Promise<{
  workspace: { id: string; name: string; createdAt: string };
}> {
  return request("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function joinWorkspace(token: string): Promise<{
  ok: boolean;
  workspaceId: string;
  role: string;
  email: string;
  sealedOrgKey?: string | null;
}> {
  return request("/workspaces/join", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
  role?: "admin" | "member" | "viewer",
  sealedOrgKey?: string | null
): Promise<{
  member: {
    id: string;
    email: string;
    role: string;
    status: string;
    inviteToken: string;
  };
}> {
  return request(`/workspaces/${workspaceId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role, sealedOrgKey }),
  });
}

export async function listWorkspaceMembers(workspaceId: string): Promise<{
  members: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
  }>;
}> {
  return request(`/workspaces/${workspaceId}/members`);
}

export async function updateMember(
  workspaceId: string,
  memberId: string,
  body: {
    role?: "admin" | "member" | "viewer";
    revoke?: boolean;
    sealedOrgKey?: string | null;
  }
): Promise<{ ok: boolean }> {
  return request(`/workspaces/${workspaceId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function setMemberSealedOrgKey(
  workspaceId: string,
  memberId: string,
  sealedOrgKey: string
): Promise<{ ok: boolean }> {
  return updateMember(workspaceId, memberId, { sealedOrgKey });
}

export async function getInvite(token: string): Promise<{
  invite: {
    email: string;
    role: string;
    status: string;
    workspaceName: string;
    workspaceId: string;
  };
}> {
  return request(`/invites/${token}`);
}

export async function acceptInvite(token: string): Promise<{
  ok: boolean;
  workspaceId: string;
  role: string;
  email: string;
  sealedOrgKey: string | null;
}> {
  return request(`/invites/${token}/accept`, { method: "POST", body: "{}" });
}

export async function createShare(body: {
  secretId?: string | null;
  vaultId: string;
  workspaceId?: string | null;
  scope: "workspace" | "external";
  title: string;
  type: string;
  packageJson?: string | null;
  recipientEmail?: string | null;
  note?: string | null;
  expiresAt?: string | null;
  maxViews?: number | null;
}): Promise<{
  share: { id: string; accessToken: string; createdAt: string };
}> {
  return request("/shares", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function notifyShareEmail(body: {
  to: string;
  title: string;
  claimUrl: string;
  sharePassword: string;
  scope?: string;
  expiresAt?: string | null;
  maxViews?: number | null;
}): Promise<{ sent: boolean; reason?: string }> {
  return request("/shares/notify", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getMailStatus(): Promise<{
  configured: boolean;
  source?: "vault" | "env" | null;
  host: string | null;
  from: string | null;
  port?: number | null;
  hasPassword?: boolean;
}> {
  return request("/mail/status");
}

export type SmtpPublic = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPassword: boolean;
};

export async function getSmtpSettings(): Promise<{
  smtp: SmtpPublic;
  envFallback: {
    configured: boolean;
    host: string | null;
    from: string | null;
  };
}> {
  return request("/settings/smtp");
}

export async function putSmtpSettings(body: {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
  clear?: boolean;
}): Promise<{ ok: boolean; smtp: SmtpPublic }> {
  return request("/settings/smtp", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function testSmtp(to?: string): Promise<{
  sent: boolean;
  to?: string;
  reason?: string;
}> {
  return request("/settings/smtp/test", {
    method: "POST",
    body: JSON.stringify({ to: to || undefined }),
  });
}

export async function listShares(): Promise<{
  shares: Array<{
    id: string;
    secretId?: string | null;
    scope: string;
    title: string;
    type: string;
    recipientEmail: string | null;
    createdAt: string;
    accessToken: string | null;
    expiresAt: string | null;
    maxViews: number | null;
    viewCount: number;
    status: string;
  }>;
}> {
  return request("/shares");
}

export async function deleteShare(id: string): Promise<{ ok: boolean }> {
  return request(`/shares/${id}`, { method: "DELETE" });
}

export async function claimShare(token: string): Promise<{
  share: {
    id: string;
    title: string;
    type: string;
    package: unknown;
    viewsRemaining: number | null;
  };
}> {
  return request(`/shares/claim/${token}`, { method: "POST", body: "{}" });
}

export async function getPasswordPolicy(): Promise<{
  policy: Record<string, unknown> | null;
}> {
  return request("/vault/policy");
}

export async function setPasswordPolicy(
  policy: Record<string, unknown>
): Promise<{ ok: boolean }> {
  return request("/vault/policy", {
    method: "PUT",
    body: JSON.stringify({ policy }),
  });
}

export async function reportUnlock(result: "ok" | "fail", detail?: string) {
  return request<{ ok: boolean }>("/vault/session", {
    method: "POST",
    body: JSON.stringify({ result, detail }),
  });
}

export async function rekeyVault(body: {
  vaultId?: string;
  salt: string;
  verifier: string;
  secrets: Array<{ id: string; encryptedData: string }>;
  clearRecovery?: boolean;
}): Promise<{ vault: VaultRecordWithRecovery }> {
  return request("/vault/rekey", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listSecretsFull(): Promise<SecretItem[]> {
  const { items } = await listSecrets();
  const full: SecretItem[] = [];
  for (const meta of items) {
    full.push(await getSecret(meta.id));
  }
  return full;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  detail?: string;
  ip?: string;
  userAgent?: string;
}

export async function getAudit(limit = 40): Promise<{
  events: AuditEvent[];
  summary: {
    unlockOk: number;
    unlockFail: number;
    exports: number;
    imports: number;
    rekeys: number;
    secretReads: number;
  };
  note: string;
}> {
  return request(`/audit?limit=${limit}`);
}
