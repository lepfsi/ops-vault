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
  | "need_2fa"
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
  /** Master key held while waiting for TOTP (not yet granted to app). */
  const pendingKeyRef = useRef<MasterKey | null>(null);

  const clearPendingKey = useCallback(() => {
    if (pendingKeyRef.current) {
      wipeKey(pendingKeyRef.current);
      pendingKeyRef.current = null;
    }
  }, []);

  const maybeRequire2fa = useCallback(
    async (
      master: MasterKey,
      v: VaultRecordWithRecovery
    ): Promise<"unlocked" | "need_2fa"> => {
      try {
        const { enabled } = await api.getTwoFactorStatus();
        if (!enabled) {
          clearPendingKey();
          setKey(master);
          unlockedRef.current = true;
          unlockedVaultIdRef.current = v.id;
          setPhase("unlocked");
          return "unlocked";
        }
      } catch {
        // Status unreachable after password OK — fail open so vault still works.
        clearPendingKey();
        setKey(master);
        unlockedRef.current = true;
        unlockedVaultIdRef.current = v.id;
        setPhase("unlocked");
        return "unlocked";
      }
      // Hold key until TOTP succeeds
      clearPendingKey();
      pendingKeyRef.current = master;
      setKey(null);
      unlockedRef.current = false;
      unlockedVaultIdRef.current = null;
      setPhase("need_2fa");
      return "need_2fa";
    },
    [clearPendingKey]
  );

  const selectVault = useCallback(async (id: string) => {
    setKey((prev) => {
      if (prev) wipeKey(prev);
      return null;
    });
    clearPendingKey();
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
        } else if (pendingKeyRef.current) {
          setPhase("need_2fa");
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
      clearPendingKey();
      setPhase("setup");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "API unreachable";
      if (msg.includes("Not found") || msg.includes("404")) {
        api.setActiveVaultId(null);
        localStorage.removeItem(LS_KEY);
        setVault(null);
        setVaults([]);
        clearPendingKey();
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
        clearPendingKey();
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

  const login = useCallback(
    async (email: string, password: string) => {
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
        const gate = await maybeRequire2fa(master, v);
        if (gate === "unlocked") {
          void api.reportUnlock("ok", v.id).catch(() => undefined);
        }
      } catch (err) {
        unlockedRef.current = false;
        unlockedVaultIdRef.current = null;
        clearPendingKey();
        setPhase("setup");
        setError(err instanceof Error ? err.message : "Sign-in failed");
        void api
          .reportUnlock("fail", email.trim().toLowerCase())
          .catch(() => undefined);
      }
    },
    [maybeRequire2fa, clearPendingKey]
  );

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
        clearPendingKey();
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
        clearPendingKey();
        const master = await unlockVault(password, vault.salt, vault.verifier);
        const gate = await maybeRequire2fa(master, vault);
        if (gate === "unlocked") {
          void api.reportUnlock("ok", vault.id).catch(() => undefined);
        }
      } catch (err) {
        unlockedRef.current = false;
        unlockedVaultIdRef.current = null;
        clearPendingKey();
        setPhase("locked");
        setError(err instanceof Error ? err.message : "Invalid password");
        void api.reportUnlock("fail", vault.id).catch(() => undefined);
      }
    },
    [vault, key, maybeRequire2fa, clearPendingKey]
  );

  const unlockRecovery = useCallback(
    async (recoveryPassword: string) => {
      if (!vault?.recovery) {
        setError("No recovery key configured for this vault");
        return;
      }
      setError(null);
      setPhase("unlocking");
      try {
        if (key) wipeKey(key);
        clearPendingKey();
        const master = await unlockWithRecovery(
          vault.recovery,
          recoveryPassword
        );
        const gate = await maybeRequire2fa(master, vault);
        if (gate === "unlocked") {
          void api
            .reportUnlock("ok", `recovery:${vault.id}`)
            .catch(() => undefined);
        }
      } catch (err) {
        unlockedRef.current = false;
        unlockedVaultIdRef.current = null;
        clearPendingKey();
        setPhase("locked");
        setError(err instanceof Error ? err.message : "Recovery failed");
        void api
          .reportUnlock("fail", `recovery:${vault.id}`)
          .catch(() => undefined);
      }
    },
    [vault, key, maybeRequire2fa, clearPendingKey]
  );

  /** Complete unlock after password + TOTP. */
  const verify2fa = useCallback(async (code: string) => {
    setError(null);
    setPhase("unlocking");
    try {
      await api.verifyTwoFactor(code);
      const master = pendingKeyRef.current;
      if (!master) {
        setPhase("locked");
        setError("Session expired — enter your password again");
        return;
      }
      pendingKeyRef.current = null;
      setKey(master);
      unlockedRef.current = true;
      unlockedVaultIdRef.current = vault?.id ?? null;
      setPhase("unlocked");
      if (vault) {
        void api.reportUnlock("ok", `2fa:${vault.id}`).catch(() => undefined);
      }
    } catch (err) {
      setPhase("need_2fa");
      setError(err instanceof Error ? err.message : "Invalid authenticator code");
    }
  }, [vault]);

  const cancel2fa = useCallback(() => {
    clearPendingKey();
    setKey(null);
    unlockedRef.current = false;
    unlockedVaultIdRef.current = null;
    setPhase(vault ? "locked" : "setup");
    setError(null);
  }, [vault]);

  /**
   * Load vault by email for recovery (forgot password) without unlocking.
   * Returns whether a recovery key exists.
   */
  const prepareRecovery = useCallback(async (email: string) => {
    setError(null);
    try {
      const { vault: v } = await api.loginAccount(email.trim());
      api.setActiveVaultId(v.id);
      localStorage.setItem(LS_KEY, v.id);
      localStorage.setItem(LS_EMAIL, email.trim().toLowerCase());
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
      setPhase("locked");
      return { hasRecovery: Boolean(v.recovery), vaultName: v.name };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account not found");
      throw err;
    }
  }, []);

  /** Restore vault from sealed/plain backup file (forgot-password path). */
  const importBackupRestore = useCallback(
    async (backupJson: string, exportPassword?: string) => {
      setError(null);
      setPhase("unlocking");
      try {
        const { parseBackupJson } = await import("@ops-vault/core");
        const backup = await parseBackupJson(
          backupJson,
          exportPassword && exportPassword.length > 0
            ? exportPassword
            : undefined
        );
        const result = await api.importVault({ backup, force: true });
        api.setActiveVaultId(result.vault.id);
        localStorage.setItem(LS_KEY, result.vault.id);
        setVault(result.vault);
        // Import does not give master key — user must unlock with the
        // password that was used when the backup was created.
        unlockedRef.current = false;
        unlockedVaultIdRef.current = null;
        clearPendingKey();
        setKey(null);
        setPhase("locked");
        setVaults([
          {
            id: result.vault.id,
            name: result.vault.name,
            email: result.vault.email,
            hasRecovery: Boolean(result.vault.recovery),
            hasRecoveryEmail: Boolean(result.vault.recoveryEmail),
            secretCount: result.imported,
            createdAt: result.vault.createdAt,
            updatedAt: result.vault.updatedAt,
          },
        ]);
        return result;
      } catch (err) {
        setPhase(vault ? "locked" : "setup");
        setError(err instanceof Error ? err.message : "Import failed");
        throw err;
      }
    },
    [vault]
  );

  const lock = useCallback(() => {
    if (key) wipeKey(key);
    setKey(null);
    clearPendingKey();
    unlockedRef.current = false;
    unlockedVaultIdRef.current = null;
    setPhase(vault ? "locked" : "setup");
  }, [key, vault]);

  const signOut = useCallback(() => {
    if (key) wipeKey(key);
    setKey(null);
    clearPendingKey();
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
      clearPendingKey();
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
    verify2fa,
    cancel2fa,
    prepareRecovery,
    importBackupRestore,
    lock,
    signOut,
    refreshVault,
    replaceKey,
    selectVault,
  };
}
