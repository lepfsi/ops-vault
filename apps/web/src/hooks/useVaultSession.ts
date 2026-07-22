import {
  createVaultAuth,
  unlockVault,
  wipeKey,
  type MasterKey,
  type VaultRecordWithRecovery,
} from "@ops-vault/core";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [vault, setVault] = useState<VaultRecordWithRecovery | null>(null);
  const [key, setKey] = useState<MasterKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlockedRef = useRef(false);

  const refreshVault = useCallback(async () => {
    setError(null);
    try {
      const { vault: v } = await api.getVault();
      setVault(v);
      if (unlockedRef.current && v) {
        setPhase("unlocked");
      } else {
        setPhase(v ? "locked" : "setup");
        unlockedRef.current = false;
      }
    } catch (err) {
      setPhase("error");
      unlockedRef.current = false;
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
        setVault(v as VaultRecordWithRecovery);
        setKey(auth.key);
        unlockedRef.current = true;
        setPhase("unlocked");
      } catch (err) {
        setPhase("setup");
        unlockedRef.current = false;
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
        unlockedRef.current = true;
        setPhase("unlocked");
      } catch (err) {
        unlockedRef.current = false;
        setPhase("locked");
        setError(err instanceof Error ? err.message : "Unlock failed");
      }
    },
    [vault, key]
  );

  const lock = useCallback(() => {
    if (key) wipeKey(key);
    setKey(null);
    unlockedRef.current = false;
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
