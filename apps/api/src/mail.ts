/**
 * SMTP mailer for share notifications.
 *
 * Resolution order:
 *   1. Per-vault settings (Settings → Mail → vault_settings.smtp_json)
 *   2. Environment OPS_VAULT_SMTP_*
 */

import nodemailer from "nodemailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  enabled: boolean;
};

export type ShareMailInput = {
  to: string;
  title: string;
  claimUrl: string;
  sharePassword: string;
  scope: string;
  expiresAt?: string | null;
  maxViews?: number | null;
};

export type MailResult =
  | { sent: true }
  | { sent: false; reason: string };

export function parseSmtpJson(raw: string | null | undefined): SmtpConfig | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<SmtpConfig>;
    if (!o.host?.trim()) return null;
    const port = Number(o.port ?? 587);
    const secure =
      o.secure != null ? Boolean(o.secure) : port === 465;
    return {
      host: String(o.host).trim(),
      port: Number.isFinite(port) ? port : 587,
      secure,
      user: String(o.user ?? ""),
      pass: String(o.pass ?? ""),
      from: String(o.from ?? o.user ?? "").trim(),
      enabled: o.enabled !== false,
    };
  } catch {
    return null;
  }
}

export function envSmtpConfig(): SmtpConfig | null {
  const host = process.env.OPS_VAULT_SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.OPS_VAULT_SMTP_PORT ?? 587);
  const user = process.env.OPS_VAULT_SMTP_USER ?? "";
  const pass = process.env.OPS_VAULT_SMTP_PASS ?? "";
  const from =
    process.env.OPS_VAULT_SMTP_FROM ?? user ?? "opsvault@localhost";
  const secure =
    process.env.OPS_VAULT_SMTP_SECURE === "true" || port === 465;
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    pass,
    from,
    enabled: true,
  };
}

export function resolveSmtp(
  vaultSmtpJson?: string | null
): { config: SmtpConfig; source: "vault" | "env" } | null {
  const fromVault = parseSmtpJson(vaultSmtpJson);
  if (fromVault?.enabled && fromVault.host) {
    return { config: fromVault, source: "vault" };
  }
  // Vault row exists but disabled/incomplete → still try env
  const fromEnv = envSmtpConfig();
  if (fromEnv) return { config: fromEnv, source: "env" };
  return null;
}

function transportOptions(config: SmtpConfig): Record<string, unknown> {
  const port = config.port || 587;
  // 465 = implicit TLS (secure:true). 587/25 = STARTTLS (secure:false).
  const secure = Boolean(config.secure) || port === 465;
  const opts: Record<string, unknown> = {
    host: config.host,
    port,
    secure,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 25_000,
  };
  if (config.user) {
    opts.auth = { user: config.user, pass: config.pass };
  }
  // Port 587: STARTTLS (do not set secure:true — that breaks many providers)
  if (!secure && (port === 587 || port === 25)) {
    opts.requireTLS = true;
  }
  opts.tls = {
    minVersion: "TLSv1.2",
    // Set OPS_VAULT_SMTP_TLS_INSECURE=true only for self-signed lab certs
    rejectUnauthorized: process.env.OPS_VAULT_SMTP_TLS_INSECURE !== "true",
  };
  return opts;
}

/**
 * Send share invitation email.
 */
export async function sendShareEmail(
  input: ShareMailInput,
  vaultSmtpJson?: string | null
): Promise<MailResult> {
  const to = input.to.trim().toLowerCase();
  if (!to.includes("@")) {
    return { sent: false, reason: "Invalid recipient email" };
  }

  const resolved = resolveSmtp(vaultSmtpJson);
  if (!resolved) {
    return {
      sent: false,
      reason:
        "SMTP not configured. Open Settings → Mail, enable SMTP and save host/user/password, or set OPS_VAULT_SMTP_HOST on the API process.",
    };
  }

  const { config, source } = resolved;
  if (!config.host) {
    return { sent: false, reason: "SMTP host is empty" };
  }
  if (config.user && !config.pass) {
    return {
      sent: false,
      reason:
        "SMTP password is empty. Re-save Settings → Mail and enter the password (it is never shown back).",
    };
  }

  const exp = input.expiresAt
    ? new Date(input.expiresAt).toLocaleString()
    : "no expiry";
  const views =
    input.maxViews != null ? `${input.maxViews} view(s) max` : "unlimited views";

  const subject = `OpsVault share: ${input.title}`;
  const text = [
    `You received an ephemeral secret share from OpsVault.`,
    ``,
    `Title: ${input.title}`,
    `Scope: ${input.scope}`,
    `Expires: ${exp}`,
    `Views: ${views}`,
    ``,
    `Open link:`,
    input.claimUrl,
    ``,
    `Share password:`,
    input.sharePassword,
    ``,
    `This link is time- and/or view-limited. Do not forward it carelessly.`,
    ``,
    `— OpsVault / DailyOps`,
  ].join("\n");

  const html = `
    <p>You received an ephemeral secret share from <strong>OpsVault</strong>.</p>
    <ul>
      <li><strong>Title:</strong> ${escapeHtml(input.title)}</li>
      <li><strong>Scope:</strong> ${escapeHtml(input.scope)}</li>
      <li><strong>Expires:</strong> ${escapeHtml(exp)}</li>
      <li><strong>Views:</strong> ${escapeHtml(views)}</li>
    </ul>
    <p><a href="${escapeHtml(input.claimUrl)}">Open share link</a></p>
    <p>Share password: <code>${escapeHtml(input.sharePassword)}</code></p>
    <p style="color:#666;font-size:12px">Time- and/or view-limited. Do not forward carelessly.</p>
  `;

  try {
    const transporter = nodemailer.createTransport(
      transportOptions(config) as Parameters<typeof nodemailer.createTransport>[0]
    );
    // Verify connection first — clearer errors than sendMail alone
    try {
      await transporter.verify();
    } catch (verifyErr) {
      const vmsg =
        verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      return {
        sent: false,
        reason: `SMTP connect failed (${source} config · ${config.host}:${config.port}): ${vmsg}`,
      };
    }

    await transporter.sendMail({
      from: config.from || config.user || "opsvault@localhost",
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMTP send failed";
    if (
      msg.includes("Cannot find package") ||
      msg.includes("MODULE_NOT_FOUND") ||
      msg.includes("Cannot find module")
    ) {
      return {
        sent: false,
        reason:
          "nodemailer module missing. From monorepo root run: pnpm install  (or pnpm --filter @ops-vault/api add nodemailer)",
      };
    }
    return {
      sent: false,
      reason: `SMTP send failed (${source} · ${config.host}:${config.port}): ${msg}`,
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mailStatus(vaultSmtpJson?: string | null): {
  configured: boolean;
  source: "vault" | "env" | null;
  host: string | null;
  from: string | null;
  port: number | null;
  user: string | null;
  secure: boolean;
  enabled: boolean;
  hasPassword: boolean;
} {
  const resolved = resolveSmtp(vaultSmtpJson);
  if (!resolved) {
    return {
      configured: false,
      source: null,
      host: null,
      from: null,
      port: null,
      user: null,
      secure: false,
      enabled: false,
      hasPassword: false,
    };
  }
  const { config, source } = resolved;
  return {
    configured: true,
    source,
    host: config.host,
    from: config.from || null,
    port: config.port,
    user: config.user || null,
    secure: config.secure,
    enabled: config.enabled,
    hasPassword: Boolean(config.pass),
  };
}

export function smtpPublicFromRaw(raw: string | null | undefined): {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPassword: boolean;
} {
  const c = parseSmtpJson(raw);
  if (!c) {
    return {
      enabled: false,
      host: "",
      port: 587,
      secure: false,
      user: "",
      from: "",
      hasPassword: false,
    };
  }
  return {
    enabled: c.enabled,
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    from: c.from,
    hasPassword: Boolean(c.pass),
  };
}
