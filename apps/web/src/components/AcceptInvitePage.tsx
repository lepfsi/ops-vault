import {
  openOrgKeyFromToken,
  storeOrgKeyLocal,
} from "@ops-vault/core";
import { Button, Card, CardDescription, CardTitle } from "@ops-vault/ui";
import { useEffect, useState } from "react";
import * as api from "../lib/api";

interface Props {
  token: string;
  unlocked: boolean;
  onError: (msg: string) => void;
  onAccepted: (workspaceId: string) => void;
  onNeedUnlock: () => void;
}

export function AcceptInvitePage({
  token,
  unlocked,
  onError,
  onAccepted,
  onNeedUnlock,
}: Props) {
  const [info, setInfo] = useState<{
    email: string;
    role: string;
    status: string;
    workspaceName: string;
    workspaceId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { invite } = await api.getInvite(token);
        setInfo(invite);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Invite invalid");
      }
    })();
  }, [token, onError]);

  async function accept() {
    if (!unlocked) {
      onNeedUnlock();
      return;
    }
    setBusy(true);
    try {
      const result = await api.acceptInvite(token);
      if (result.sealedOrgKey) {
        try {
          const orgKey = await openOrgKeyFromToken(
            result.sealedOrgKey,
            token
          );
          storeOrgKeyLocal(result.workspaceId, orgKey);
          // Persist for this vault under master key (multi-device)
          // master key not available here — local store is enough until re-open
        } catch {
          onError(
            "Joined org but vault key could not be opened — use Initialize org vault key as admin"
          );
        }
      }
      setDone(true);
      onAccepted(result.workspaceId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md p-6">
      <CardTitle>Organization invite</CardTitle>
      <CardDescription>
        Accept to join the org vault ecosystem with your account.
      </CardDescription>

      {info && (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            Organization: <strong>{info.workspaceName}</strong>
          </p>
          <p>
            Role: <strong>{info.role}</strong>
          </p>
          <p className="text-[var(--ov-muted)]">Invited as {info.email}</p>
        </div>
      )}

      {!done && info?.status === "invited" && (
        <div className="mt-4">
          {!unlocked && (
            <p className="mb-2 text-sm text-amber-600 dark:text-amber-400">
              Unlock your personal vault first.
            </p>
          )}
          <Button
            type="button"
            disabled={busy || !unlocked}
            onClick={() => void accept()}
          >
            {busy ? "…" : "Accept & open org vault"}
          </Button>
        </div>
      )}

      {done && (
        <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
          You are a member. Use the header switcher to enter the org vault.
        </p>
      )}
    </Card>
  );
}
