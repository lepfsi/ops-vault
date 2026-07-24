import {
  certificateSummary,
  createExternalShare,
  decryptPayload,
  encryptPayload,
  generateTotp,
  isNotePinProtected,
  openNoteWithPin,
  sealNoteWithPin,
  SHARE_TTL_PRESETS,
  SHARE_VIEW_PRESETS,
  type ApiKeyPayload,
  type CertificatePayload,
  type MasterKey,
  type NotePayload,
  type OtpPayload,
  type PasswordPayload,
  type SecretMeta,
  type SecretPayload,
  type SnippetPayload,
  type SshKeyPayload,
} from "@ops-vault/core";
import {
  Button,
  DomainIcon,
  Drawer,
  IconCopy,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconTrash,
} from "@ops-vault/ui";
import { useEffect, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import { TYPE_META } from "../lib/secretMeta";
import { displayHost, toBrowseUrl } from "../lib/url";
import { PasswordGenerator } from "./PasswordGenerator";

interface Props {
  open: boolean;
  secret: SecretMeta | null;
  masterKey: MasterKey;
  orgKey?: MasterKey | null;
  /** Active org id when sharing internally to workspace */
  workspaceId?: string | null;
  folders?: { id: string; name: string }[];
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
  onError: (msg: string) => void;
}

export function SecretDetailDrawer({
  open,
  secret,
  masterKey,
  orgKey = null,
  workspaceId = null,
  folders = [],
  onClose,
  onDeleted,
  onUpdated,
  onError,
}: Props) {
  const [payload, setPayload] = useState<SecretPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareScope, setShareScope] = useState<"external" | "workspace">(
    "external"
  );
  const [sharePass, setSharePass] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareTtl, setShareTtl] = useState<string>("24h");
  const [shareViews, setShareViews] = useState<string>("5");
  const [lastShareLink, setLastShareLink] = useState<string | null>(null);
  const [activeShares, setActiveShares] = useState<
    Array<{
      id: string;
      scope: string;
      expiresAt: string | null;
      maxViews: number | null;
      viewCount: number;
      status: string;
      accessToken: string | null;
      recipientEmail: string | null;
    }>
  >([]);
  const [otp, setOtp] = useState<{ code: string; remaining: number } | null>(
    null
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // edit fields
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [folderId, setFolderId] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [notePin, setNotePin] = useState("");
  const [notePinInput, setNotePinInput] = useState("");
  const [noteUnlockedBody, setNoteUnlockedBody] = useState<string | null>(null);
  const [notePinEnabled, setNotePinEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [otpSecret, setOtpSecret] = useState("");
  const [otpIssuer, setOtpIssuer] = useState("");
  const [otpLabel, setOtpLabel] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [snippet, setSnippet] = useState("");

  useEffect(() => {
    if (!open || !secret) {
      setPayload(null);
      setEditing(false);
      setSharing(false);
      setNoteUnlockedBody(null);
      setNotePinInput("");
      setNotePin("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setEditing(false);
    setNoteUnlockedBody(null);
    setNotePinInput("");
    void (async () => {
      try {
        const full = await api.getSecret(secret.id);
        const key =
          full.visibility === "org" && full.workspaceId && orgKey
            ? orgKey
            : masterKey;
        if (full.visibility === "org" && full.workspaceId && !orgKey) {
          throw new Error(
            "Org vault key missing — open this item after joining the org with key"
          );
        }
        const p = await decryptPayload(full.encryptedData, key);
        if (cancelled) return;
        setPayload(p);
        setTitle(secret.title);
        setUrl(secret.url ?? "");
        setFolderId(secret.folderId ?? "");
        setTagsRaw((secret.tags ?? []).join(", "));
        if (secret.type === "password") {
          const pw = p as PasswordPayload;
          setUsername(pw.username ?? "");
          setPassword(pw.password);
          setNotes(pw.notes ?? "");
          setUrl(secret.url || pw.url || "");
        } else if (secret.type === "note") {
          const n = p as NotePayload;
          const pinOn = isNotePinProtected(n);
          setNotePinEnabled(pinOn);
          setNoteBody(pinOn ? "" : n.body);
          setNoteUnlockedBody(pinOn ? null : n.body);
        } else if (secret.type === "api_key") {
          setApiKey((p as ApiKeyPayload).key);
          setNotes((p as ApiKeyPayload).notes ?? "");
        } else if (secret.type === "otp") {
          const o = p as OtpPayload;
          setOtpSecret(o.secret);
          setOtpIssuer(o.issuer ?? "");
          setOtpLabel(o.label ?? "");
        } else if (secret.type === "ssh_key") {
          setSshKey((p as SshKeyPayload).privateKey);
        } else if (secret.type === "snippet") {
          setSnippet((p as SnippetPayload).code);
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : "Decrypt failed");
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, secret, masterKey, orgKey, onError, onClose]);

  useEffect(() => {
    if (!secret || secret.type !== "otp" || !payload || editing) {
      setOtp(null);
      return;
    }
    const p = payload as OtpPayload;
    const tick = () => {
      const t = generateTotp(p);
      setOtp({ code: t.code, remaining: t.remaining });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [secret, payload, editing]);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      onError("Copie impossible");
    }
  }

  async function saveEdit() {
    if (!secret) return;
    setBusy(true);
    try {
      let next: SecretPayload;
      switch (secret.type) {
        case "password":
          next = {
            username: username || undefined,
            password,
            url: url || undefined,
            notes: notes || undefined,
          };
          break;
        case "otp":
          next = {
            secret: otpSecret,
            issuer: otpIssuer || "OpsVault",
            label: otpLabel || title,
            algorithm: "SHA1",
            digits: 6,
            period: 30,
          };
          break;
        case "note": {
          const plain = noteBody;
          if (notePinEnabled) {
            const pin =
              notePin.length >= 4
                ? notePin
                : notePinInput.length >= 4
                  ? notePinInput
                  : "";
            if (pin.length >= 4) {
              next = await sealNoteWithPin(plain, pin);
            } else if (
              payload &&
              isNotePinProtected(payload as NotePayload) &&
              noteUnlockedBody === null
            ) {
              // Metadata-only save while body remains sealed
              next = payload as NotePayload;
            } else {
              throw new Error("Note PIN required (min. 4 characters)");
            }
          } else {
            next = { body: plain, pinProtected: false };
          }
          break;
        }
        case "api_key":
          next = { key: apiKey, notes: notes || undefined };
          break;
        case "ssh_key":
          next = { privateKey: sshKey };
          break;
        case "snippet":
          next = { code: snippet };
          break;
        default:
          next = payload ?? {};
      }
      const encryptedData = await encryptPayload(next, masterKey);
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await api.updateSecret(secret.id, {
        title,
        encryptedData,
        url:
          secret.type === "password" || secret.type === "api_key"
            ? url || null
            : secret.url,
        folderId: folderId || null,
        tags,
      });
      setPayload(next);
      setEditing(false);
      onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadShares() {
    if (!secret) return;
    try {
      const { shares } = await api.listShares();
      setActiveShares(
        shares.filter(
          (s) =>
            s.status === "active" &&
            (s.title === secret.title ||
              /* best-effort match by secret when API returns secretId */
              true)
        ).filter((s) => {
          // Prefer secretId when present in list payload
          const any = s as { secretId?: string | null };
          if (any.secretId) return any.secretId === secret.id;
          return s.title === secret.title;
        })
      );
    } catch {
      setActiveShares([]);
    }
  }

  useEffect(() => {
    if (open && sharing && secret) void loadShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sharing, secret?.id]);

  async function createEphemeralShare() {
    if (!secret || !payload) return;
    if (shareScope === "workspace" && !workspaceId) {
      onError("Open an organization vault to share internally");
      return;
    }
    setBusy(true);
    try {
      const ttl = SHARE_TTL_PRESETS.find((t) => t.id === shareTtl);
      const views = SHARE_VIEW_PRESETS.find((v) => v.id === shareViews);
      const pkg = await createExternalShare({
        title: secret.title,
        type: secret.type,
        payload,
        sharePassword: sharePass,
        note:
          shareScope === "workspace"
            ? `Internal org share${shareEmail ? ` · ${shareEmail}` : ""}`
            : shareEmail
              ? `For ${shareEmail}`
              : undefined,
        limits: {
          expiresInMs: ttl?.ms ?? null,
          maxViews: views?.views ?? null,
        },
      });
      const vaultId = api.getActiveVaultId();
      if (!vaultId) throw new Error("No active vault");
      const { share } = await api.createShare({
        secretId: secret.id,
        vaultId,
        workspaceId: shareScope === "workspace" ? workspaceId : null,
        scope: shareScope,
        title: secret.title,
        type: secret.type,
        packageJson: JSON.stringify(pkg),
        recipientEmail: shareEmail || null,
        expiresAt: pkg.expiresAt ?? null,
        maxViews: pkg.maxViews ?? null,
      });
      const link = `${window.location.origin}${window.location.pathname}#/claim/${share.accessToken}`;
      setLastShareLink(link);
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        /* ignore */
      }
      if (shareScope === "external") {
        const blob = new Blob([JSON.stringify(pkg, null, 2)], {
          type: "application/json",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `opsvault-share-${secret.title.replace(/\s+/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      setSharePass("");
      await loadShares();
      onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Share failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!secret) return;
    if (!window.confirm(`Supprimer « ${secret.title} » ?`)) return;
    try {
      await api.deleteSecret(secret.id);
      onDeleted();
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!secret) return null;

  const meta = TYPE_META[secret.type];
  const Icon = meta.Icon;
  const browseUrl = (url || secret.url) ? toBrowseUrl(url || secret.url!) : null;
  const host = displayHost(url || secret.url);
  const field =
    "w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-sm outline-none focus:ring-2 ring-cyan-500/40";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? "Edit" : secret.title}
      subtitle={meta.label}
      widthClass="w-full max-w-lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="danger" onClick={() => void remove()}>
            <span className="inline-flex items-center gap-1.5">
              <IconTrash className="h-3.5 w-3.5" />
              Delete
            </span>
          </Button>
          <div className="flex gap-2">
            {editing ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveEdit()}
                >
                  {busy ? "…" : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSharing(true);
                    setEditing(false);
                  }}
                >
                  Quick share
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setSharing(false);
                  }}
                >
                  Edit
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Actions always visible at top of drawer body */}
        {!loading && !editing && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-cyan-600/25 bg-cyan-500/5 p-3">
            <Button
              type="button"
              onClick={() => {
                setEditing(true);
                setSharing(false);
                if (secret.type === "password") setShowGen(true);
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSharing(true);
                setEditing(false);
              }}
            >
              Share
            </Button>
            {secret.type === "password" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditing(true);
                  setSharing(false);
                  setShowGen(true);
                }}
              >
                Generator
              </Button>
            )}
          </div>
        )}

        <div className="flex items-start gap-3">
          {host ? (
            <DomainIcon host={host} size={44} />
          ) : (
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ov-soft)] ${meta.accent}`}
            >
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ov-muted)]">
              {meta.short}
            </p>
            {host && browseUrl && !editing && (
              <a
                href={browseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm text-cyan-600 hover:underline dark:text-cyan-400"
              >
                <span className="truncate">{host}</span>
                <IconExternal className="h-3.5 w-3.5 shrink-0" />
              </a>
            )}
            {!host && secret.type === "password" && !editing && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Ajoutez une URL (Modifier) pour afficher le favicon du site
              </p>
            )}
          </div>
        </div>

        {loading && (
          <p className="text-sm text-[var(--ov-muted)]">Déchiffrement…</p>
        )}

        {/* ——— EDIT MODE ——— */}
        {!loading && editing && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--ov-muted)]">Titre</span>
              <input
                className={field}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            {secret.type === "password" && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--ov-muted)]">
                    Mot de passe
                  </span>
                  <input
                    className={`${field} font-mono`}
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--ov-fg)]">
                      Générateur de mot de passe
                    </p>
                    <button
                      type="button"
                      className="text-xs font-medium text-cyan-600 dark:text-cyan-400"
                      onClick={() => setShowGen((g) => !g)}
                    >
                      {showGen ? "Masquer" : "Afficher"}
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
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--ov-muted)]">
                    Identifiant
                  </span>
                  <input
                    className={field}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--ov-muted)]">
                    URL du site
                  </span>
                  <input
                    className={field}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </label>
              </>
            )}

            {secret.type === "otp" && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--ov-muted)]">
                    Secret Base32
                  </span>
                  <input
                    className={`${field} font-mono`}
                    value={otpSecret}
                    onChange={(e) => setOtpSecret(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--ov-muted)]">
                    Émetteur
                  </span>
                  <input
                    className={field}
                    value={otpIssuer}
                    onChange={(e) => setOtpIssuer(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--ov-muted)]">
                    Label
                  </span>
                  <input
                    className={field}
                    value={otpLabel}
                    onChange={(e) => setOtpLabel(e.target.value)}
                  />
                </label>
              </>
            )}

            {secret.type === "note" && (
              <>
                <textarea
                  className={field}
                  rows={8}
                  value={noteBody}
                  onChange={(e) => {
                    setNoteBody(e.target.value);
                    setNoteUnlockedBody(e.target.value);
                  }}
                />
                <label className="flex items-center gap-2 text-sm text-[var(--ov-muted)]">
                  <input
                    type="checkbox"
                    checked={notePinEnabled}
                    onChange={(e) => setNotePinEnabled(e.target.checked)}
                  />
                  Secondary PIN lock
                </label>
                {notePinEnabled && (
                  <input
                    className={field}
                    type="password"
                    value={notePin}
                    onChange={(e) => setNotePin(e.target.value)}
                    placeholder="Note PIN (min. 4)"
                    minLength={4}
                  />
                )}
              </>
            )}

            {secret.type === "api_key" && (
              <>
                <input
                  className={`${field} font-mono`}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <input
                  className={field}
                  placeholder="URL console"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </>
            )}

            {secret.type === "ssh_key" && (
              <textarea
                className={`${field} font-mono text-xs`}
                rows={6}
                value={sshKey}
                onChange={(e) => setSshKey(e.target.value)}
              />
            )}

            {secret.type === "snippet" && (
              <textarea
                className={`${field} font-mono text-xs`}
                rows={8}
                value={snippet}
                onChange={(e) => setSnippet(e.target.value)}
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--ov-muted)]">
                  Dossier
                </span>
                <select
                  className={field}
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                >
                  <option value="">Racine</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--ov-muted)]">Tags</span>
                <input
                  className={field}
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                />
              </label>
            </div>
          </div>
        )}

        {/* ——— VIEW MODE ——— */}
        {!loading && !editing && payload && secret.type === "otp" && otp && (
          <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-500/10 to-transparent px-5 py-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ov-muted)]">
              Code TOTP
            </p>
            <p className="mt-3 font-mono text-4xl font-semibold tracking-[0.35em] text-emerald-600 dark:text-emerald-400 sm:text-5xl">
              {otp.code}
            </p>
            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <span className="text-sm text-[var(--ov-muted)]">
                Expire dans{" "}
                <strong className="tabular-nums text-[var(--ov-fg)]">
                  {otp.remaining}s
                </strong>
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void copy("otp", otp.code)}
              >
                {copied === "otp" ? "Copié" : "Copier le code"}
              </Button>
            </div>
          </div>
        )}

        {!loading && !editing && payload && secret.type === "password" && (
          <div className="space-y-3">
            <FieldRow
              label="Mot de passe"
              value={
                showPass
                  ? (payload as PasswordPayload).password
                  : "••••••••••••"
              }
              mono
              actions={
                <>
                  <IconBtn
                    title={showPass ? "Masquer" : "Afficher"}
                    onClick={() => setShowPass((s) => !s)}
                  >
                    {showPass ? (
                      <IconEyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <IconEye className="h-3.5 w-3.5" />
                    )}
                  </IconBtn>
                  <IconBtn
                    title="Copier"
                    onClick={() =>
                      void copy(
                        "pass",
                        (payload as PasswordPayload).password
                      )
                    }
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                  </IconBtn>
                </>
              }
              copied={copied === "pass"}
            />
            {(payload as PasswordPayload).username && (
              <FieldRow
                label="Identifiant"
                value={(payload as PasswordPayload).username!}
                onCopy={() =>
                  void copy(
                    "user",
                    (payload as PasswordPayload).username!
                  )
                }
                copied={copied === "user"}
              />
            )}
            {(secret.url || (payload as PasswordPayload).url) && (
              <FieldRow
                label="Site web"
                value={secret.url || (payload as PasswordPayload).url || ""}
                action={
                  browseUrl ? (
                    <a
                      href={browseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-cyan-600 dark:text-cyan-400"
                    >
                      Ouvrir <IconExternal className="h-3 w-3" />
                    </a>
                  ) : undefined
                }
              />
            )}
          </div>
        )}

        {!loading && !editing && payload && secret.type === "api_key" && (
          <FieldRow
            label="Clé API"
            value={
              showKey
                ? (payload as ApiKeyPayload).key
                : "••••••••••••••••"
            }
            mono
            actions={
              <>
                <IconBtn
                  title={showKey ? "Masquer" : "Afficher"}
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? (
                    <IconEyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <IconEye className="h-3.5 w-3.5" />
                  )}
                </IconBtn>
                <IconBtn
                  title="Copier"
                  onClick={() =>
                    void copy("key", (payload as ApiKeyPayload).key)
                  }
                >
                  <IconCopy className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            }
            copied={copied === "key"}
          />
        )}

        {!loading && !editing && payload && secret.type === "note" && (
          <div className="space-y-3">
            {isNotePinProtected(payload as NotePayload) &&
            noteUnlockedBody === null ? (
              <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)] p-4">
                <p className="text-sm font-medium">PIN-protected note</p>
                <input
                  className={field}
                  type="password"
                  value={notePinInput}
                  onChange={(e) => setNotePinInput(e.target.value)}
                  placeholder="Enter note PIN"
                />
                <Button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        const body = await openNoteWithPin(
                          payload as NotePayload,
                          notePinInput
                        );
                        setNoteUnlockedBody(body);
                        setNoteBody(body);
                      } catch (err) {
                        onError(
                          err instanceof Error ? err.message : "Invalid PIN"
                        );
                      }
                    })();
                  }}
                >
                  Unlock note
                </Button>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)] p-4 text-sm">
                {noteUnlockedBody ?? (payload as NotePayload).body}
              </pre>
            )}
          </div>
        )}

        {!loading && !editing && payload && secret.type === "ssh_key" && (
          <FieldRow
            label="Clé privée"
            value={
              showKey
                ? (payload as SshKeyPayload).privateKey
                : "••••••••"
            }
            mono
            actions={
              <>
                <IconBtn
                  title={showKey ? "Masquer" : "Afficher"}
                  onClick={() => setShowKey((s) => !s)}
                >
                  {showKey ? (
                    <IconEyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <IconEye className="h-3.5 w-3.5" />
                  )}
                </IconBtn>
                <IconBtn
                  title="Copier"
                  onClick={() =>
                    void copy(
                      "ssh",
                      (payload as SshKeyPayload).privateKey
                    )
                  }
                >
                  <IconCopy className="h-3.5 w-3.5" />
                </IconBtn>
              </>
            }
          />
        )}

        {!loading && !editing && payload && secret.type === "snippet" && (
          <pre className="overflow-x-auto rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)] p-4 font-mono text-xs">
            {(payload as SnippetPayload).code}
          </pre>
        )}

        {!loading && !editing && payload && secret.type === "certificate" && (
          <div className="space-y-2 text-sm">
            {(payload as CertificatePayload).subject && (
              <p>
                <span className="text-[var(--ov-muted)]">Subject · </span>
                {(payload as CertificatePayload).subject}
              </p>
            )}
            {(payload as CertificatePayload).notAfter && (
              <p>
                <span className="text-[var(--ov-muted)]">Expire · </span>
                {(payload as CertificatePayload).notAfter}
              </p>
            )}
            <p className="text-xs text-[var(--ov-faint)]">
              {certificateSummary(payload as CertificatePayload)}
            </p>
          </div>
        )}

        {sharing && !editing && (
          <div className="space-y-3 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)] p-4">
            <p className="text-sm font-medium">Ephemeral share</p>
            <p className="text-xs text-[var(--ov-muted)]">
              Time-limited and/or view-limited link. Works outside and inside
              the org.
            </p>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--ov-panel)] p-1">
              <button
                type="button"
                onClick={() => setShareScope("external")}
                className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                  shareScope === "external"
                    ? "bg-[var(--ov-accent-soft)] text-[var(--ov-accent)]"
                    : "text-[var(--ov-muted)]"
                }`}
              >
                External
              </button>
              <button
                type="button"
                onClick={() => setShareScope("workspace")}
                disabled={!workspaceId}
                className={`rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-40 ${
                  shareScope === "workspace"
                    ? "bg-[var(--ov-accent-soft)] text-[var(--ov-accent)]"
                    : "text-[var(--ov-muted)]"
                }`}
                title={
                  workspaceId
                    ? "Share inside organization"
                    : "Enter an org vault first"
                }
              >
                Internal (org)
              </button>
            </div>

            <input
              className={field}
              placeholder={
                shareScope === "workspace"
                  ? "Colleague note / email (optional)"
                  : "Recipient email (optional)"
              }
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
            />
            <input
              type="password"
              className={field}
              placeholder="Share password (≥8) — sent separately"
              value={sharePass}
              onChange={(e) => setSharePass(e.target.value)}
              minLength={8}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-[var(--ov-muted)]">
                Expires after
                <select
                  className={`mt-1 ${field}`}
                  value={shareTtl}
                  onChange={(e) => setShareTtl(e.target.value)}
                >
                  {SHARE_TTL_PRESETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-[var(--ov-muted)]">
                Max views
                <select
                  className={`mt-1 ${field}`}
                  value={shareViews}
                  onChange={(e) => setShareViews(e.target.value)}
                >
                  {SHARE_VIEW_PRESETS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              type="button"
              disabled={busy || sharePass.length < 8}
              onClick={() => void createEphemeralShare()}
            >
              {shareScope === "external"
                ? "Create link + download package"
                : "Create internal ephemeral link"}
            </Button>
            {lastShareLink && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs break-all">
                <p className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">
                  Link copied — send with the share password
                </p>
                {lastShareLink}
              </div>
            )}

            {activeShares.length > 0 && (
              <div className="space-y-2 border-t border-[var(--ov-border)] pt-3">
                <p className="text-xs font-semibold uppercase text-[var(--ov-faint)]">
                  Active shares
                </p>
                <ul className="space-y-2 text-xs">
                  {activeShares.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-panel)] px-2 py-1.5"
                    >
                      <span>
                        {s.scope}
                        {s.expiresAt
                          ? ` · until ${s.expiresAt.slice(0, 16).replace("T", " ")}`
                          : " · no expiry"}
                        {s.maxViews != null
                          ? ` · ${s.viewCount}/${s.maxViews} views`
                          : ` · ${s.viewCount} views`}
                      </span>
                      <button
                        type="button"
                        className="text-red-500 hover:underline"
                        onClick={() => {
                          void (async () => {
                            try {
                              await api.deleteShare(s.id);
                              await loadShares();
                            } catch (err) {
                              onError(
                                err instanceof Error
                                  ? err.message
                                  : "Revoke failed"
                              );
                            }
                          })();
                        }}
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {secret.tags && secret.tags.length > 0 && !editing && (
          <div className="flex flex-wrap gap-1.5">
            {secret.tags.map((t) => (
              <span
                key={t}
                className="rounded-md border border-[var(--ov-border)] px-2 py-0.5 text-xs text-[var(--ov-muted)]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className="rounded-md p-1.5 text-[var(--ov-muted)] hover:bg-[var(--ov-hover)]"
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function FieldRow({
  label,
  value,
  mono,
  onCopy,
  actions,
  action,
  copied,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
  actions?: ReactNode;
  action?: ReactNode;
  copied?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--ov-border)] bg-[var(--ov-soft)] px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-[var(--ov-muted)]">
          {label}
          {copied && (
            <span className="ml-2 normal-case text-emerald-600 dark:text-emerald-400">
              copié
            </span>
          )}
        </p>
        <div className="flex items-center gap-0.5">
          {action}
          {actions}
          {onCopy && (
            <IconBtn title="Copier" onClick={onCopy}>
              <IconCopy className="h-3.5 w-3.5" />
            </IconBtn>
          )}
        </div>
      </div>
      <p
        className={`break-all text-sm ${mono ? "font-mono text-[13px]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
