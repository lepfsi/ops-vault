export type SecretType =
  | "password"
  | "ssh_key"
  | "api_key"
  | "certificate"
  | "note"
  | "otp"
  | "snippet";

export interface SecretItem {
  id: string;
  type: SecretType;
  title: string;
  /** Always ciphertext (base64); never store plaintext here. */
  encryptedData: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

/** 32-byte AES-256 key derived from the master password (Argon2id). */
export type MasterKey = Uint8Array & { readonly __brand: "MasterKey" };
