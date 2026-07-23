import {
  createVaultAuth,
  unlockVault,
  unlockWithRecovery,
  wipeKey,
  type MasterKey,
  type VaultRecordWithRecovery,
} from "@ops-vault/core";
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type { VaultSummary } from "../lib/api";

export type VaultPhase =
  | "loading"
  | "setup"
  | "locked"
  | "unlocking"
  | "unlocked"
  | "error";

const LS_KEY = "ops-vault.activeVaultId";
const LS_EMAIL = "ops-vault.lastEmail";

export function useVaultSession() {
  const [phase, setPhase] = useState<VaultPhase>("loading");
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [vault, setVault] = useState<VaultRecordWithRecovery | null>(null);
  const [key, setKey] = useState<MasterKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlockedRef = useRef(false);
  const unlockedVaultIdRef = useRef<string | null>(null);

  const selectVault = useCallback(async (id: string) => {
    setKey((prev) => {
      if (prev) wipeKey(prev);
      return null;
    });
    unlockedRef.current = false;
    unlockedVaultIdRef.current = null;
    api.setActiveVaultId(id);
    localStorage.setItem(LS_KEY, id);
    setError(null);
    try {
      const { vault: v } = await api.getVaultById(id);
      setVault(v);
      setPhase("locked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vault unavailable");
      setPhase("error");
    }
  }, []);

  const refreshVault = useCallback(async () => {
    setError(null);
    try {
      // Session is vault-scoped — never load the global vault directory.
      const activeId = api.getActiveVaultId() || localStorage.getItem(LS_KEY);
      if (activeId) {
        api.setActiveVaultId(activeId);
        const { vault: v } = await api.getVaultById(activeId);
        setVault(v);
        setVaults([
          {
            id: v.id,
            name: v.name,
            email: v.email,
            hasRecovery: Boolean(v.recovery),
            hasRecoveryEmail: Boolean(v.recoveryEmail),
            secretCount: 0,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
          },
        ]);
        if (
          unlockedRef.current &&
          unlockedVaultIdRef.current === v.id
        ) {
          setPhase("unlocked");
        } else {
          unlockedRef.current = false;
          unlockedVaultIdRef.current = null;
          setPhase("locked");
        }
        return;
      }

      api.setActiveVaultId(null);
      setVault(null);
      setVaults([]);
      unlockedRef.current = false;
      unlockedVaultIdRef.current = null;
      setPhase("setup");
    } catch (err) {
      // Invalid/stale session → clean sign-in
      const msg = err instanceof Error ? err.message : "API unreachable";
      if (msg.includes("Not found") || msg.includes("404")) {
        api.setActiveVaultId(null);
        localStorage.removeItem(LS_KEY);
        setVault(null);
        setVaults([]);
        setPhase("setup");
        return;
      }
      setPhase("error");
      unlockedRef.current = false;
      setError(msg);
    }
  }, []);

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  /** Create account (email) + vault, unlock immediately. */
  const register = useCallback(
    async (
      email: string,
      password: string,
      opts?: { recoveryEmail?: string; name?: string }
    ) => {
      setError(null);
      setPhase("unlocking");
      try {
        const auth = await createVaultAuth(password);
        const { vault: v } = await api.registerAccount({
          email: email.trim(),
          recoveryEmail: opts?.recoveryEmail?.trim() || email.trim(),
          name: opts?.name?.trim() || "OpsVault",
          salt: auth.saltB64,
          verifier: auth.verifier,
        });
        api.setActiveVaultId(v.id);
        localStorage.setItem(LS_KEY, v.id);
        localStorage.setItem(LS_EMAIL, email.trim().toLowerCase());
        setVault(v);
        setKey(auth.key);
        unlockedRef.current = true;
        unlockedVaultIdRef.current = v.id;
        setPhase("unlocked");
        setVaults([
          {
            id: v.id,
            name: v.name,
            email: v.email,
            hasRecovery: Boolean(v.recovery),
            hasRecoveryEmail: Boolean(v.recoveryEmail),
            secretCount: 0,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
          },
        ]);
      } catch (err) {
        setPhase("setup");
        unlockedRef.current = false;
        setError(err instanceof Error ? err.message : "Registration failed");
      }
    },
    []
  );

  /** Lookup by email then unlock with master password. */
  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setPhase("unlocking");
    try {
      const { vault: v } = await api.loginAccount(email.trim());
      api.setActiveVaultId(v.id);
      localStorage.setItem(LS_KEY, v.id);
      localStorage.setItem(LS_EMAIL, email.trim().toLowerCase());
      setVault(v);
      setKey((prev) => {
        if (prev) wipeKey(prev);
        return null;
      });
      const master = await unlockVault(password, v.salt, v.verifier);
      setKey(master);
      unlockedRef.current = true;
      unlockedVaultIdRef.current = v.id;
      setPhase("unlocked");
      void api.reportUnlock("ok", v.id).catch(() => undefined);
      setVaults([
        {
          id: v.id,
          name: v.name,
          email: v.email,
          hasRecovery: Boolean(v.recovery),
          hasRecoveryEmail: Boolean(v.recoveryEmail),
          secretCount: 0,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        },
      ]);
    } catch (err) {
      unlockedRef.current = false;
      unlockedVaultIdRef.current = null;
      setPhase("setup");
      setError(err instanceof Error ? err.message : "Sign-in failed");
      void api
        .reportUnlock("fail", email.trim().toLowerCase())
        .catch(() => undefined);
    }
  }, []);

  /** Legacy: create vault without email (extra vault while unlocked flow). */
  const setup = useCallback(
    async (password: string, name = "OpsVault", email?: string) => {
      if (email) {
        await register(email, password, { name });
        return;
      }
      setError(null);
      setPhase("unlocking");
      try {
        const auth = await createVaultAuth(password);
        const { vault: v } = await api.createVault({
          name,
          salt: auth.saltB64,
          verifier: auth.verifier,
        });
        api.setActiveVaultId(v.id);
        localStorage.setItem(LS_KEY, v.id);
        setVault(v);
        setKey(auth.key);
        unlockedRef.current = true;
        unlockedVaultIdRef.current = v.id;
        setPhase("unlocked");
        setVaults([
          {
            id: v.id,
            name: v.name,
            email: v.email,
            hasRecovery: Boolean(v.recovery),
            hasRecoveryEmail: Boolean(v.recoveryEmail),
            secretCount: 0,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
          },
        ]);
      } catch (err) {
        setPhase(vaults.length ? "locked" : "setup");
        unlockedRef.current = false;
        setError(err instanceof Error ? err.message : "Setup failed");
      }
    },
    [register, vaults.length]
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
        unlockedVaultIdRef.current = vault.id;
        setPhase("unlocked");
        void api.reportUnlock("ok", vault.id).catch(() => undefined);
      } catch (err) {
        unlockedRef.current = false;
        unlockedVaultIdRef.current = null;
        setPhase("locked");
        setError(err instanceof Error ? err.message : "Invalid password");
        void api.reportUnlock("fail", vault.id).catch(() => undefined);
      }
    },
    [vault, key]
  );

  const unlockRecovery = useCallback(
    async (recoveryPassword: string) => {
      if (!vault?.recovery) {
        setError("No recovery key configured");
        return;
      }
      setError(null);
      setPhase("unlocking");
      try {
        if (key) wipeKey(key);
        const master = await unlockWithRecovery(
          vault.recovery,
          recoveryPassword
        );
        setKey(master);
        unlockedRef.current = true;
        unlockedVaultIdRef.current = vault.id;
        setPhase("unlocked");
        void api
          .reportUnlock("ok", `recovery:${vault.id}`)
          .catch(() => undefined);
      } catch (err) {
        unlockedRef.current = false;
        unlockedVaultIdRef.current = null;
        setPhase("locked");
        setError(err instanceof Error ? err.message : "Recovery failed");
        void api
          .reportUnlock("fail", `recovery:${vault.id}`)
          .catch(() => undefined);
      }
    },
    [vault, key]
  );

  const lock = useCallback(() => {
    if (key) wipeKey(key);
    setKey(null);
    unlockedRef.current = false;
    unlockedVaultIdRef.current = null;
    setPhase(vault ? "locked" : "setup");
  }, [key, vault]);

  const signOut = useCallback(() => {
    if (key) wipeKey(key);
    setKey(null);
    unlockedRef.current = false;
    unlockedVaultIdRef.current = null;
    api.setActiveVaultId(null);
    localStorage.removeItem(LS_KEY);
    setVault(null);
    setPhase("setup");
    setError(null);
  }, [key]);

  useEffect(() => {
    if (phase !== "unlocked") return;
    const min = Number(localStorage.getItem("ops-vault.autoLockMin") ?? "15");
    if (!min || min <= 0) return;
    let timer = window.setTimeout(() => lock(), min * 60_000);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lock(), min * 60_000);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [phase, lock]);

  // Lock when leaving the browser if "Remember this browser" is off
  useEffect(() => {
    if (phase !== "unlocked") return;
    if (localStorage.getItem("ops-vault.rememberBrowser") === "1") return;
    const onHide = () => {
      if (document.visibilityState === "hidden") lock();
    };
    const onPageHide = () => lock();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [phase, lock]);

  const replaceKey = useCallback(
    (newKey: MasterKey) => {
      if (key && key !== newKey) wipeKey(key);
      setKey(newKey);
      unlockedRef.current = true;
      if (vault) unlockedVaultIdRef.current = vault.id;
      setPhase("unlocked");
    },
    [key, vault]
  );

  const createAdditionalVault = useCallback(
    async (password: string, name: string) => {
      await setup(password, name);
    },
    [setup]
  );

  return {
    phase,
    vault,
    vaults,
    key,
    error,
    setError,
    lastEmail: localStorage.getItem(LS_EMAIL) ?? "",
    register,
    login,
    setup,
    createAdditionalVault,
    unlock,
    unlockRecovery,
    lock,
    signOut,
    refreshVault,
    replaceKey,
    selectVault,
  };
}
