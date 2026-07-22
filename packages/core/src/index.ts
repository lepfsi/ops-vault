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
  encryptedData: string; // toujours chiffré
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

// === À implémenter juste après ===
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  throw new Error("Not implemented yet – next step");
}

export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  throw new Error("Not implemented yet – next step");
}

export async function decrypt(
  ciphertext: string,
  key: CryptoKey
): Promise<string> {
  throw new Error("Not implemented yet – next step");
}
