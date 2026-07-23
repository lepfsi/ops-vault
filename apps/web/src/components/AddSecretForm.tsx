import {
  createOtpPayload,
  encryptPayload,
  parseCertificatePem,
  sealNoteWithPin,
  type MasterKey,
  type SecretPayload,
  type SecretType,
} from "@ops-vault/core";
import { Button, Input } from "@ops-vault/ui";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as api from "../lib/api";
import { TYPE_META } from "../lib/secretMeta";
import { PasswordGenerator } from "./PasswordGenerator";

interface Props {
  masterKey: MasterKey;
  /** When set, encrypts org-visible items with this key. */
  orgKey?: MasterKey | null;
  workspaceId?: string | null;
  groups?: Array<{ id: string; name: string }>;
  onCreated: () => void;
  onError: (msg: string) => void;
  onClose?: () => void;
  defaultType?: SecretType;
  defaultFolderId?: string | null;
  folders?: { id: string; name: string }[];
}

const TYPES = (Object.keys(TYPE_META) as SecretType[]).map((value) => ({
  value,
  label: TYPE_META[value].label,
}));

/** Which types expose a website URL as list metadata (open in browser). */
function storesPublicUrl(type: SecretType): boolean {
  return type === "password" || type === "api_key";
}

export function AddSecretForm({
  masterKey,
  orgKey = null,
  workspaceId = null,
  groups = [],
  onCreated,
  onError,
  onClose,
  defaultType = "password",
  defaultFolderId = null,
  folders = [],
}: Props) {
  const inOrg = Boolean(workspaceId);
  const [visibility, setVisibility] = useState<"private" | "org">(
    inOrg ? "org" : "private"
  );
  const [groupId, setGroupId] = useState("");
  const [type, setType] = useState<SecretType>(defaultType);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [otpLabel, setOtpLabel] = useState("");
  const [otpIssuer, setOtpIssuer] = useState("");
  const [otpSecret, setOtpSecret] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiHeader, setApiHeader] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [sshPublic, setSshPublic] = useState("");
  const [sshPassphrase, setSshPassphrase] = useState("");
  const [snippet, setSnippet] = useState("");
  const [snippetLang, setSnippetLang] = useState("");
  const [certPem, setCertPem] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOrg, setShowOrg] = useState(false);
  const [showGen, setShowGen] = useState(true);
  const [notePin, setNotePin] = useState("");
  const [notePinEnabled, setNotePinEnabled] = useState(false);

  useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

  useEffect(() => {
    setFolderId(defaultFolderId ?? "");
  }, [defaultFolderId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let payload: SecretPayload;
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      switch (type) {
        case "password":
          payload = {
            username: username || undefined,
            password,
            url: url || undefined,
            notes: notes || undefined,
          };
          break;
        case "otp":
          payload = createOtpPayload({
            secret: otpSecret || undefined,
            label: otpLabel || title,
            issuer: otpIssuer || "OpsVault",
          });
          break;
        case "note":
          if (notePinEnabled && notePin.length >= 4) {
            payload = await sealNoteWithPin(noteBody, notePin);
          } else {
            payload = { body: noteBody, pinProtected: false };
          }
          break;
        case "api_key":
          payload = {
            key: apiKey,
            header: apiHeader || undefined,
            notes: notes || undefined,
          };
          break;
        case "ssh_key":
          payload = {
            privateKey: sshKey,
            publicKey: sshPublic || undefined,
            passphrase: sshPassphrase || undefined,
          };
          break;
        case "snippet":
          payload = {
            code: snippet,
            language: snippetLang || undefined,
          };
          break;
        case "certificate":
          payload = parseCertificatePem(certPem);
          break;
        default:
          payload = { notes: noteBody };
      }

      const useOrg =
        inOrg && visibility === "org" && orgKey != null;
      if (inOrg && visibility === "org" && !orgKey) {
        throw new Error(
          "Org vault key missing — re-join the organization or ask an admin to re-invite you"
        );
      }
      const encryptedData = await encryptPayload(
        payload,
        useOrg ? orgKey! : masterKey
      );
      await api.createSecret({
        type,
        title,
        encryptedData,
        url: storesPublicUrl(type) ? url || null : null,
        folderId: folderId || null,
        tags: tags.length ? tags : undefined,
        workspaceId: workspaceId || null,
        visibility: inOrg ? visibility : "private",
        groupId:
          inOrg && visibility === "org" && groupId ? groupId : null,
      });
      onCreated();
      onClose?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-sm text-[var(--ov-fg)] outline-none ring-cyan-500/40 focus:ring-2";

  const titlePlaceholder: Record<SecretType, string> = {
    password: "ex. GitHub, Compte admin bastion",
    otp: "ex. GitHub 2FA, AWS root",
    api_key: "ex. Stripe live, OpenAI",
    certificate: "ex. wildcard.example.com",
    ssh_key: "ex. prod-deploy, laptop-ed25519",
    note: "Incident runbook, recovery codes…",
    snippet: "ex. nginx snippet, cron backup",
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ov-fg)]">
            New item
          </h3>
        </div>
        {onClose && (
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-[var(--ov-muted)]">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SecretType)}
            className={fieldClass}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder={titlePlaceholder[type]}
        />
      </div>

      {inOrg && (
        <div className="rounded-xl border border-[var(--ov-accent)]/30 bg-[var(--ov-accent-soft)] p-3">
          <p className="mb-2 text-sm font-medium text-[var(--ov-fg)]">
            Organization visibility
          </p>
          <div className="flex flex-col gap-2 text-sm text-[var(--ov-muted)]">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="vis"
                checked={visibility === "org"}
                onChange={() => setVisibility("org")}
                className="mt-1"
              />
              <span>
                <strong className="text-[var(--ov-fg)]">Shared</strong>
                {" — "}org members (or a group)
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="vis"
                checked={visibility === "private"}
                onChange={() => setVisibility("private")}
                className="mt-1"
              />
              <span>
                <strong className="text-[var(--ov-fg)]">Only me</strong>
                {" — "}private in this org
              </span>
            </label>
          </div>
          {visibility === "org" && groups.length > 0 && (
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-[var(--ov-muted)]">
                Limit to group (optional)
              </span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className={fieldClass}
              >
                <option value="">Entire organization</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {/* Type-specific primary fields (order = importance) */}
      {type === "password" && (
        <Section title="Login">
          <Input
            label="Username / email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            placeholder="you@company.com"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <div className="space-y-2 rounded-xl border border-[var(--ov-accent)]/25 bg-[var(--ov-accent-soft)] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--ov-fg)]">
                Password generator
              </p>
              <button
                type="button"
                className="text-xs font-medium text-[var(--ov-accent)]"
                onClick={() => setShowGen((g) => !g)}
              >
                {showGen ? "Hide" : "Show"}
              </button>
            </div>
            {showGen && (
              <PasswordGenerator
                compact
                onUse={(p) => {
                  setPassword(p);
                }}
              />
            )}
          </div>
          <Input
            label="Website URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/login"
          />
          <Input
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Section>
      )}

      {type === "otp" && (
        <Section title="TOTP">
          <Input
            label="Secret (Base32)"
            value={otpSecret}
            onChange={(e) => setOtpSecret(e.target.value)}
            className="font-mono"
            placeholder="JBSWY3DPEHPK3PXP — laisse vide pour générer"
            required={false}
          />
          <p className="text-[11px] text-[var(--ov-muted)]">
            Champ principal : le secret fourni par le service (ou généré si
            vide).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Émetteur (issuer)"
              value={otpIssuer}
              onChange={(e) => setOtpIssuer(e.target.value)}
              placeholder="GitHub, AWS…"
            />
            <Input
              label="Compte / label"
              value={otpLabel}
              onChange={(e) => setOtpLabel(e.target.value)}
              placeholder={title || "compte@exemple.com"}
            />
          </div>
        </Section>
      )}

      {type === "api_key" && (
        <Section title="Clé">
          <Input
            label="Clé API"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            className="font-mono"
            placeholder="sk-…"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Header (optionnel)"
              value={apiHeader}
              onChange={(e) => setApiHeader(e.target.value)}
              placeholder="Authorization: Bearer"
            />
            <Input
              label="URL console (optionnel)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://dashboard.stripe.com"
            />
          </div>
          <Input
            label="Notes (optionnel)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Section>
      )}

      {type === "note" && (
        <Section title="Protected note">
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--ov-muted)]">Content</span>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={8}
              required
              className={fieldClass}
              placeholder="Encrypted at rest with your vault key"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ov-muted)]">
            <input
              type="checkbox"
              checked={notePinEnabled}
              onChange={(e) => setNotePinEnabled(e.target.checked)}
            />
            Secondary PIN lock
          </label>
          {notePinEnabled && (
            <Input
              label="Note PIN"
              type="password"
              value={notePin}
              onChange={(e) => setNotePin(e.target.value)}
              minLength={4}
              required
              placeholder="Min. 4 characters"
            />
          )}
        </Section>
      )}

      {type === "ssh_key" && (
        <Section title="Clé SSH">
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--ov-muted)]">
              Clé privée
            </span>
            <textarea
              value={sshKey}
              onChange={(e) => setSshKey(e.target.value)}
              rows={6}
              required
              className={`${fieldClass} font-mono text-xs`}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--ov-muted)]">
              Clé publique (optionnel)
            </span>
            <textarea
              value={sshPublic}
              onChange={(e) => setSshPublic(e.target.value)}
              rows={2}
              className={`${fieldClass} font-mono text-xs`}
              placeholder="ssh-ed25519 AAAA…"
            />
          </label>
          <Input
            label="Passphrase (optionnel)"
            type="password"
            value={sshPassphrase}
            onChange={(e) => setSshPassphrase(e.target.value)}
          />
        </Section>
      )}

      {type === "snippet" && (
        <Section title="Code">
          <Input
            label="Langage (optionnel)"
            value={snippetLang}
            onChange={(e) => setSnippetLang(e.target.value)}
            placeholder="bash, nginx, yaml…"
          />
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--ov-muted)]">Snippet</span>
            <textarea
              value={snippet}
              onChange={(e) => setSnippet(e.target.value)}
              rows={8}
              required
              className={`${fieldClass} font-mono text-xs`}
            />
          </label>
        </Section>
      )}

      {type === "certificate" && (
        <Section title="Certificat PEM">
          <label className="block text-sm">
            <span className="mb-1.5 block text-[var(--ov-muted)]">
              Certificat (et clé privée éventuelle)
            </span>
            <textarea
              value={certPem}
              onChange={(e) => setCertPem(e.target.value)}
              rows={10}
              required
              className={`${fieldClass} font-mono text-xs`}
              placeholder="-----BEGIN CERTIFICATE-----"
            />
          </label>
        </Section>
      )}

      {/* Organization — secondary for all types */}
      <div className="rounded-xl border border-[var(--ov-border)]">
        <button
          type="button"
          onClick={() => setShowOrg((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-[var(--ov-muted)] hover:bg-[var(--ov-hover)]"
        >
          <span>Folder & tags</span>
          <span className="text-xs">{showOrg ? "▾" : "▸"}</span>
        </button>
        {showOrg && (
          <div className="grid gap-3 border-t border-[var(--ov-border)] px-3 py-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[var(--ov-muted)]">Folder</span>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className={fieldClass}
              >
                <option value="">Root</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="prod, infra"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onClose && (
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)]/40 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ov-muted)]">
        {title}
      </p>
      {children}
    </div>
  );
}
