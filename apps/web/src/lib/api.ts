import type {
  SecretItem,
  SecretMeta,
  SecretType,
  VaultRecord,
} from "@ops-vault/core";

const BASE = "/api";

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
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
  vault: { id: string; name: string } | null;
  secrets: number;
}> {
  return request("/health");
}

export async function getVault(): Promise<{ vault: VaultRecord | null }> {
  return request("/vault");
}

export async function createVault(body: {
  name: string;
  salt: string;
  verifier: string;
}): Promise<{ vault: VaultRecord }> {
  return request("/vault", {
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
