import {
  createExternalShare,
  decryptPayload,
  generatePassword,
  SHARE_TTL_PRESETS,
  SHARE_VIEW_PRESETS,
  type MasterKey,
  type SecretMeta,
  type SecretPayload,
  type SecretType,
} from "@ops-vault/core";
import { Button } from "@ops-vault/ui";
import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import { TYPE_META } from "../lib/secretMeta";

interface Props {
  masterKey: MasterKey;
  workspaceId?: string | null;
  onError: (msg: string) => void;
}

type SourceMode = "vault" | "adhoc";

const ADHOC_TYPES: SecretType[] = [
  "password",
  "note",
  "api_key",
  "otp",
  "ssh_key",
  "snippet",
];

/**
 * Standalone ephemeral shares: pick a vault item or craft content on the fly.
 * Email is sent automatically when a recipient address is provided (SMTP).
 */
export function SharesPage({ masterKey, workspaceId, onError }: Props) {
  const [shares, setShares] = useState<
    Array<{
      id: string;
      secretId?: string | null;
      scope: string;
      title: string;
      expiresAt: string | null;
      maxViews: number | null;
      viewCount: number;
      status: string;
      accessToken: string | null;
      recipientEmail: string | null;
    }>
  >([]);
  const [secrets, setSecrets] = useState<SecretMeta[]>([]);
  const [source, setSource] = useState<SourceMode>("adhoc");
  const [secretId, setSecretId] = useState("");
  const [scope, setScope] = useState<"external" | "workspace">("external");
  const [sharePass, setSharePass] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareTtl, setShareTtl] = useState("24h");
  const [shareViews, setShareViews] = useState("5");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Ad-hoc content
  const [adhocType, setAdhocType] = useState<SecretType>("password");
  const [adhocTitle, setAdhocTitle] = useState("");
  const [adhocUsername, setAdhocUsername] = useState("");
  const [adhocPassword, setAdhocPassword] = useState("");
  const [adhocUrl, setAdhocUrl] = useState("");
  const [adhocNote, setAdhocNote] = useState("");
  const [adhocApiKey, setAdhocApiKey] = useState("");
  const [adhocOtp, setAdhocOtp] = useState("");
  const [adhocSsh, setAdhocSsh] = useState("");
  const [adhocSnippet, setAdhocSnippet] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [{ shares: list }, { items }, mail] = await Promise.all([
        api.listShares(),
        api.listSecrets({ workspaceId: workspaceId ?? null }),
        api.getMailStatus().catch(() => ({ configured: false, host: null, from: null })),
      ]);
      setShares(list.filter((s) => s.status === "active"));
      setSecrets(items);
      setMailConfigured(mail.configured);
      setSecretId((prev) =>
        prev && items.some((i) => i.id === prev) ? prev : items[0]?.id ?? ""
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load shares");
    } finally {
      setLoading(false);
    }
  }, [onError, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildAdhoc(): { title: string; type: SecretType; payload: SecretPayload } {
    const title = adhocTitle.trim() || `Share ${adhocType}`;
    switch (adhocType) {
      case "password":
        return {
          title,
          type: "password",
          payload: {
            username: adhocUsername || undefined,
            password: adhocPassword,
            url: adhocUrl || undefined,
          },
        };
      case "note":
        return { title, type: "note", payload: { body: adhocNote } };
      case "api_key":
        return {
          title,
          type: "api_key",
          payload: { key: adhocApiKey },
        };
      case "otp":
        return {
          title,
          type: "otp",
          payload: {
            secret: adhocOtp,
            label: title,
            issuer: "OpsVault",
            algorithm: "SHA1",
            digits: 6,
            period: 30,
          },
        };
      case "ssh_key":
        return {
          title,
          type: "ssh_key",
          payload: { privateKey: adhocSsh },
        };
      case "snippet":
        return {
          title,
          type: "snippet",
          payload: { code: adhocSnippet },
        };
      default:
        return { title, type: "note", payload: { body: adhocNote } };
    }
  }

  function adhocValid(): boolean {
    if (source !== "adhoc") return true;
    if (!adhocTitle.trim() && adhocType !== "password") {
      /* title optional with default */
    }
    switch (adhocType) {
      case "password":
        return adhocPassword.length > 0;
      case "note":
        return adhocNote.trim().length > 0;
      case "api_key":
        return adhocApiKey.trim().length > 0;
      case "otp":
        return adhocOtp.trim().length > 0;
      case "ssh_key":
        return adhocSsh.trim().length > 0;
      case "snippet":
        return adhocSnippet.trim().length > 0;
      default:
        return false;
    }
  }

  async function createShare() {
    if (sharePass.length < 8) return;
    if (source === "vault" && !secretId) {
      onError("Select a secret from the vault");
      return;
    }
    if (source === "adhoc" && !adhocValid()) {
      onError("Fill the content to share");
      return;
    }
    if (scope === "workspace" && !workspaceId) {
      onError("Switch to an organization for internal shares");
      return;
    }

    setBusy(true);
    setLastLink(null);
    setEmailStatus(null);
    try {
      let title: string;
      let type: SecretType;
      let payload: SecretPayload;
      let linkedSecretId: string | null = null;

      if (source === "vault") {
        const full = await api.getSecret(secretId);
        payload = (await decryptPayload(
          full.encryptedData,
          masterKey
        )) as SecretPayload;
        const meta = secrets.find((s) => s.id === secretId);
        title = meta?.title ?? full.title;
        type = full.type;
        linkedSecretId = secretId;
      } else {
        const built = buildAdhoc();
        title = built.title;
        type = built.type;
        payload = built.payload;
      }

      const ttl = SHARE_TTL_PRESETS.find((t) => t.id === shareTtl);
      const views = SHARE_VIEW_PRESETS.find((v) => v.id === shareViews);
      const pkg = await createExternalShare({
        title,
        type,
        payload,
        sharePassword: sharePass,
        note:
          scope === "workspace"
            ? `Internal share${shareEmail ? ` · ${shareEmail}` : ""}`
            : shareEmail
              ? `For ${shareEmail}`
              : "Ad-hoc share",
        limits: {
          expiresInMs: ttl?.ms ?? null,
          maxViews: views?.views ?? null,
        },
      });

      const vaultId = api.getActiveVaultId();
      if (!vaultId) throw new Error("No active vault");

      const { share } = await api.createShare({
        secretId: linkedSecretId,
        vaultId,
        workspaceId: scope === "workspace" ? workspaceId : null,
        scope,
        title,
        type,
        packageJson: JSON.stringify(pkg),
        recipientEmail: shareEmail.trim() || null,
        expiresAt: pkg.expiresAt ?? null,
        maxViews: pkg.maxViews ?? null,
      });

      const link = `${window.location.origin}${window.location.pathname}#/claim/${share.accessToken}`;
      setLastLink(link);
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        /* ignore */
      }

      if (shareEmail.trim()) {
        try {
          await api.notifyShareEmail({
            to: shareEmail.trim(),
            title,
            claimUrl: link,
            sharePassword: sharePass,
            scope,
            expiresAt: pkg.expiresAt ?? null,
            maxViews: pkg.maxViews ?? null,
          });
          setEmailStatus(`Email sent to ${shareEmail.trim()}`);
        } catch (err) {
          setEmailStatus(
            err instanceof Error
              ? `Link ready — email not sent: ${err.message}`
              : "Link ready — email not sent (configure SMTP on API)"
          );
        }
      } else {
        setEmailStatus(null);
      }

      // Reset form (keep scope / TTL preferences)
      setSharePass("");
      setShareEmail("");
      if (source === "adhoc") {
        setAdhocTitle("");
        setAdhocUsername("");
        setAdhocPassword("");
        setAdhocUrl("");
        setAdhocNote("");
        setAdhocApiKey("");
        setAdhocOtp("");
        setAdhocSsh("");
        setAdhocSnippet("");
      }
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Share failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api.deleteShare(id);
      setShares((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Revoke failed");
    }
  }

  const field =
    "w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-sm text-[var(--ov-fg)]";

  const canSubmit =
    sharePass.length >= 8 &&
    (source === "vault" ? Boolean(secretId) : adhocValid());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Ephemeral shares</h2>
        <p className="text-sm text-[var(--ov-muted)]">
          Share from the vault or create content just for this link. Email is
          sent automatically when a recipient is set.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <p className="text-sm font-medium">New share</p>

        {/* External / internal */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--ov-soft)] p-1">
          <button
            type="button"
            onClick={() => setScope("external")}
            className={`rounded-md px-2 py-1.5 text-xs font-medium ${
              scope === "external"
                ? "bg-[var(--ov-panel)] text-[var(--ov-fg)] shadow-sm"
                : "text-[var(--ov-muted)]"
            }`}
          >
            External
          </button>
          <button
            type="button"
            onClick={() => setScope("workspace")}
            disabled={!workspaceId}
            className={`rounded-md px-2 py-1.5 text-xs font-medium disabled:opacity-40 ${
              scope === "workspace"
                ? "bg-[var(--ov-panel)] text-[var(--ov-fg)] shadow-sm"
                : "text-[var(--ov-muted)]"
            }`}
          >
            Internal (org)
          </button>
        </div>

        {/* Source: vault item vs ad-hoc */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--ov-soft)] p-1">
          <button
            type="button"
            onClick={() => setSource("adhoc")}
            className={`rounded-md px-2 py-1.5 text-xs font-medium ${
              source === "adhoc"
                ? "bg-[var(--ov-panel)] text-[var(--ov-fg)] shadow-sm"
                : "text-[var(--ov-muted)]"
            }`}
          >
            Create for this share
          </button>
          <button
            type="button"
            onClick={() => setSource("vault")}
            className={`rounded-md px-2 py-1.5 text-xs font-medium ${
              source === "vault"
                ? "bg-[var(--ov-panel)] text-[var(--ov-fg)] shadow-sm"
                : "text-[var(--ov-muted)]"
            }`}
          >
            From vault
          </button>
        </div>

        {source === "vault" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ov-muted)]">
              Secret in vault
            </span>
            <select
              className={field}
              value={secretId}
              onChange={(e) => setSecretId(e.target.value)}
            >
              {secrets.length === 0 && (
                <option value="">No secrets — use “Create for this share”</option>
              )}
              {secrets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} · {TYPE_META[s.type]?.short ?? s.type}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="space-y-3 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-soft)] p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--ov-muted)]">Type</span>
                <select
                  className={field}
                  value={adhocType}
                  onChange={(e) => setAdhocType(e.target.value as SecretType)}
                >
                  {ADHOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_META[t]?.label ?? t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--ov-muted)]">Title</span>
                <input
                  className={field}
                  value={adhocTitle}
                  onChange={(e) => setAdhocTitle(e.target.value)}
                  placeholder="e.g. Staging admin"
                />
              </label>
            </div>

            {adhocType === "password" && (
              <>
                <input
                  className={field}
                  placeholder="Username / email"
                  value={adhocUsername}
                  onChange={(e) => setAdhocUsername(e.target.value)}
                />
                <div className="flex gap-2">
                  <input
                    className={field}
                    type="text"
                    placeholder="Password"
                    value={adhocPassword}
                    onChange={(e) => setAdhocPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setAdhocPassword(generatePassword({ length: 20, symbols: true }))
                    }
                  >
                    Gen
                  </Button>
                </div>
                <input
                  className={field}
                  placeholder="URL (optional)"
                  value={adhocUrl}
                  onChange={(e) => setAdhocUrl(e.target.value)}
                />
              </>
            )}
            {adhocType === "note" && (
              <textarea
                className={field}
                rows={5}
                placeholder="Note content"
                value={adhocNote}
                onChange={(e) => setAdhocNote(e.target.value)}
              />
            )}
            {adhocType === "api_key" && (
              <input
                className={field}
                placeholder="API key"
                value={adhocApiKey}
                onChange={(e) => setAdhocApiKey(e.target.value)}
              />
            )}
            {adhocType === "otp" && (
              <input
                className={field}
                placeholder="TOTP secret (Base32)"
                value={adhocOtp}
                onChange={(e) => setAdhocOtp(e.target.value)}
              />
            )}
            {adhocType === "ssh_key" && (
              <textarea
                className={`${field} font-mono text-xs`}
                rows={4}
                placeholder="Private key"
                value={adhocSsh}
                onChange={(e) => setAdhocSsh(e.target.value)}
              />
            )}
            {adhocType === "snippet" && (
              <textarea
                className={`${field} font-mono text-xs`}
                rows={4}
                placeholder="Code / config"
                value={adhocSnippet}
                onChange={(e) => setAdhocSnippet(e.target.value)}
              />
            )}
            <p className="text-[11px] text-[var(--ov-faint)]">
              Ad-hoc content is only packaged for this share — not saved to your
              vault unless you add it separately.
            </p>
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--ov-muted)]">
            Recipient email
            {mailConfigured === false && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                (SMTP not configured on API)
              </span>
            )}
            {mailConfigured === true && (
              <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                (auto-send enabled)
              </span>
            )}
          </span>
          <input
            className={field}
            type="email"
            placeholder="beneficiary@company.com"
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
          />
        </label>

        <input
          type="password"
          className={field}
          placeholder="Share password (≥8)"
          value={sharePass}
          onChange={(e) => setSharePass(e.target.value)}
          minLength={8}
        />
        <button
          type="button"
          className="text-xs text-[var(--ov-accent)] hover:underline"
          onClick={() =>
            setSharePass(generatePassword({ length: 16, symbols: true }))
          }
        >
          Generate share password
        </button>

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
          disabled={busy || !canSubmit}
          onClick={() => void createShare()}
        >
          {busy
            ? "…"
            : shareEmail.trim()
              ? "Create link & email recipient"
              : "Create ephemeral link"}
        </Button>

        {lastLink && (
          <div className="break-all rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
            <p className="mb-1 font-medium text-emerald-700 dark:text-emerald-400">
              Link ready (also copied)
            </p>
            {lastLink}
            {emailStatus && (
              <p className="mt-2 text-[var(--ov-muted)]">{emailStatus}</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Active shares</p>
          <button
            type="button"
            className="text-xs text-[var(--ov-accent)] hover:underline"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        {loading && (
          <p className="text-sm text-[var(--ov-muted)]">Loading…</p>
        )}
        {!loading && shares.length === 0 && (
          <p className="text-sm text-[var(--ov-muted)]">No active shares</p>
        )}
        <ul className="space-y-2">
          {shares.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ov-border)] px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.title}</p>
                <p className="text-[11px] text-[var(--ov-faint)]">
                  {s.scope}
                  {s.recipientEmail ? ` · ${s.recipientEmail}` : ""}
                  {s.expiresAt
                    ? ` · until ${s.expiresAt.slice(0, 16).replace("T", " ")}`
                    : " · no expiry"}
                  {s.maxViews != null
                    ? ` · ${s.viewCount}/${s.maxViews} views`
                    : ` · ${s.viewCount} views`}
                </p>
              </div>
              <div className="flex gap-2">
                {s.accessToken && (
                  <button
                    type="button"
                    className="text-xs text-[var(--ov-accent)] hover:underline"
                    onClick={() => {
                      const link = `${window.location.origin}${window.location.pathname}#/claim/${s.accessToken}`;
                      void navigator.clipboard.writeText(link);
                    }}
                  >
                    Copy link
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs text-red-500 hover:underline"
                  onClick={() => void revoke(s.id)}
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
