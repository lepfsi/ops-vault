import type {
  RecoveryBundle,
  SecretItem,
  SecretMeta,
  SecretType,
  VaultBackupV1,
  VaultRecord,
  VaultRecordWithRecovery,
} from "@ops-vault/core";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `HTTP ${res.status}`
    );
  }
  return data;
}

export async function getHealth(): Promise<{
  ok: boolean;
  vault: { id: string; name: string; hasRecovery?: boolean } | null;
  secrets: number;
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
  salt: string;
  verifier: string;
  recovery?: RecoveryBundle | null;
}): Promise<{ vault: VaultRecord }> {
  return request("/vault", {
    method: "POST",
    body: JSON.stringify(body),
  });
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
}): Promise<{ vault: VaultRecord; imported: number }> {
  return request("/vault/import", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listSecrets(): Promise<{ items: SecretMeta[] }> {
  return request("/secrets");
}

export async function getSecret(id: string): Promise<SecretItem> {
  return request(`/secrets/${id}`);
}

export async function createSecret(body: {
  type: SecretType;
  title: string;
  encryptedData: string;
  tags?: string[];
}): Promise<SecretItem> {
  return request("/secrets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteSecret(id: string): Promise<{ ok: boolean }> {
  return request(`/secrets/${id}`, { method: "DELETE" });
}
