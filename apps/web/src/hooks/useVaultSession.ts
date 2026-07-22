import {
  createVaultAuth,
  unlockVault,
  wipeKey,
  type MasterKey,
  type VaultRecord,
} from "@ops-vault/core";
import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";

export type VaultPhase =
  | "loading"
  | "setup"
  | "locked"
  | "unlocking"
  | "unlocked"
  | "error";

export function useVaultSession() {
  const [phase, setPhase] = useState<VaultPhase>("loading");
  const [vault, setVault] = useState<VaultRecord | null>(null);
  const [key, setKey] = useState<MasterKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshVault = useCallback(async () => {
    setError(null);
    try {
      const { vault: v } = await api.getVault();
      setVault(v);
      setPhase(v ? "locked" : "setup");
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de joindre l’API (port 8787 ?)"
      );
    }
  }, []);

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  const setup = useCallback(
    async (password: string, name = "OpsVault") => {
      setError(null);
      setPhase("unlocking");
      try {
        const auth = await createVaultAuth(password);
        const { vault: v } = await api.createVault({
          name,
          salt: auth.saltB64,
          verifier: auth.verifier,
        });
        setVault(v);
        setKey(auth.key);
        setPhase("unlocked");
      } catch (err) {
        setPhase("setup");
        setError(err instanceof Error ? err.message : "Setup failed");
      }
    },
    []
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!vault) return;
      setError(null);
      setPhase("unlocking");
      try {
        if (key) wipeKey(key);
        const master = await unlockVault(password, vault.salt, vault.verifier);
        setKey(master);
        setPhase("unlocked");
      } catch (err) {
        setPhase("locked");
        setError(err instanceof Error ? err.message : "Unlock failed");
      }
    },
    [vault, key]
  );

  const lock = useCallback(() => {
    if (key) wipeKey(key);
    setKey(null);
    setPhase(vault ? "locked" : "setup");
  }, [key, vault]);

  return {
    phase,
    vault,
    key,
    error,
    setError,
    setup,
    unlock,
    lock,
    refreshVault,
  };
}
