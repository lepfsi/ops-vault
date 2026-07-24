/**
 * SMTP mailer for share notifications.
 *
 * Resolution order for config:
 *   1. Per-vault settings (UI → vault_settings.smtp_json)
 *   2. Environment variables (OPS_VAULT_SMTP_*)
 *
 * Env (fallback):
 *   OPS_VAULT_SMTP_HOST
 *   OPS_VAULT_SMTP_PORT (default 587)
 *   OPS_VAULT_SMTP_USER
 *   OPS_VAULT_SMTP_PASS
 *   OPS_VAULT_SMTP_FROM (default OPS_VAULT_SMTP_USER)
 *   OPS_VAULT_SMTP_SECURE=true for port 465
 */

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
    return {
      host: String(o.host).trim(),
      port: Number.isFinite(port) ? port : 587,
      secure: Boolean(o.secure) || port === 465,
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

/** Prefer vault UI config, then env. */
export function resolveSmtp(
  vaultSmtpJson?: string | null
): { config: SmtpConfig; source: "vault" | "env" } | null {
  const fromVault = parseSmtpJson(vaultSmtpJson);
  if (fromVault?.enabled && fromVault.host) {
    return { config: fromVault, source: "vault" };
  }
  const fromEnv = envSmtpConfig();
  if (fromEnv) return { config: fromEnv, source: "env" };
  return null;
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
        "SMTP not configured. Open Settings → Mail and enter your SMTP server, or set OPS_VAULT_SMTP_HOST on the API.",
    };
  }

  const { config } = resolved;
  if (!config.host) {
    return { sent: false, reason: "SMTP host is empty" };
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

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
    await transporter.sendMail({
      from: config.from || config.user || "opsvault@localhost",
      to,
      subject,
      text,
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SMTP send failed";
    if (msg.includes("Cannot find package") || msg.includes("MODULE_NOT_FOUND")) {
      return {
        sent: false,
        reason:
          "nodemailer not installed. From apps/api run: pnpm add nodemailer",
      };
    }
    return { sent: false, reason: msg };
  }
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

/** Public shape for GET settings (never returns password). */
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
