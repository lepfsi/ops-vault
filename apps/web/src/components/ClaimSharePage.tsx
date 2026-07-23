import {
  isExternalSharePackage,
  openExternalShare,
  reencryptPayloadForRecipient,
  type MasterKey,
  type SecretType,
} from "@ops-vault/core";
import { Button, Card, CardDescription, CardTitle, Input } from "@ops-vault/ui";
import { useState } from "react";
import * as api from "../lib/api";

interface Props {
  token: string;
  masterKey: MasterKey | null;
  unlocked: boolean;
  onError: (msg: string) => void;
  onImported: () => void;
  onNeedUnlock: () => void;
}

/**
 * Open a password-protected share, then re-encrypt into active vault.
 */
export function ClaimSharePage({
  token,
  masterKey,
  unlocked,
  onError,
  onImported,
  onNeedUnlock,
}: Props) {
  const [sharePass, setSharePass] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    title: string;
    type: string;
    viewsRemaining: number | null;
  } | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  async function claim() {
    setBusy(true);
    try {
      const { share } = await api.claimShare(token);
      const pkg = share.package;
      if (!isExternalSharePackage(pkg)) {
        throw new Error("Invalid package format");
      }
      const opened = await openExternalShare(pkg, sharePass);
      setPayload(opened.payload);
      setPreview({
        title: opened.title,
        type: opened.type,
        viewsRemaining: share.viewsRemaining,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  async function importToVault() {
    if (!masterKey || !preview || payload == null) {
      onNeedUnlock();
      return;
    }
    setBusy(true);
    try {
      const encryptedData = await reencryptPayloadForRecipient(
        payload,
        masterKey
      );
      await api.createSecret({
        type: preview.type as SecretType,
        title: `${preview.title} (partagé)`,
        encryptedData,
      });
      setDone(true);
      onImported();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md p-6">
      <CardTitle>Ouvrir un partage</CardTitle>
      <CardDescription>
        Lien éphémère protégé par mot de passe. Après ouverture, le secret est
        re-chiffré avec votre clé maître.
      </CardDescription>

      {!preview && (
        <div className="mt-4 space-y-3">
          <Input
            label="Mot de passe de partage"
            type="password"
            value={sharePass}
            onChange={(e) => setSharePass(e.target.value)}
          />
          <Button
            type="button"
            disabled={busy || sharePass.length < 8}
            onClick={() => void claim()}
          >
            {busy ? "Ouverture…" : "Ouvrir (compte comme une vue)"}
          </Button>
        </div>
      )}

      {preview && !done && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            <strong>{preview.title}</strong> · {preview.type}
          </p>
          {preview.viewsRemaining != null && (
            <p className="text-xs text-[var(--ov-muted)]">
              Vues restantes après cette ouverture : {preview.viewsRemaining}
            </p>
          )}
          {!unlocked && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Déverrouillez votre coffre pour importer le secret.
            </p>
          )}
          <Button
            type="button"
            disabled={busy || !unlocked}
            onClick={() => void importToVault()}
          >
            {busy ? "Import…" : "Importer dans mon coffre"}
          </Button>
        </div>
      )}

      {done && (
        <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
          Secret importé et re-chiffré dans votre coffre.
        </p>
      )}
    </Card>
  );
}
