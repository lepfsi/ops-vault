// Namespace import is more resilient across otpauth CJS/ESM dual packages.
import * as OTPAuth from "otpauth";
import { randomBytes } from "@noble/ciphers/utils.js";
import type { OtpPayload } from "./types.js";

const { Secret, TOTP } = OTPAuth;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Generate a random Base32 secret suitable for TOTP (20 bytes → 32 chars). */
export function generateOtpSecret(byteLength = 20): string {
  const bytes = randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let out = "";

  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31]!;
  }
  return out;
}

function buildTotp(payload: OtpPayload): InstanceType<typeof TOTP> {
  return new TOTP({
    issuer: payload.issuer ?? "OpsVault",
    label: payload.label ?? "account",
    algorithm: payload.algorithm ?? "SHA1",
    digits: payload.digits ?? 6,
    period: payload.period ?? 30,
    secret: Secret.fromBase32(payload.secret.replace(/\s+/g, "").toUpperCase()),
  });
}

export interface TotpCode {
  code: string;
  /** Seconds remaining in the current period. */
  remaining: number;
  period: number;
}

/** Generate the current TOTP code + time remaining. */
export function generateTotp(payload: OtpPayload, timestamp?: number): TotpCode {
  const totp = buildTotp(payload);
  const period = payload.period ?? 30;
  const now = timestamp ?? Date.now();
  const code = totp.generate({ timestamp: now });
  const epoch = Math.floor(now / 1000);
  const remaining = period - (epoch % period);
  return { code, remaining, period };
}

/** Verify a user-entered TOTP (window ±1 period by default). */
export function verifyTotp(
  payload: OtpPayload,
  token: string,
  options?: { window?: number; timestamp?: number }
): boolean {
  const totp = buildTotp(payload);
  const delta = totp.validate({
    token: token.replace(/\s+/g, ""),
    window: options?.window ?? 1,
    timestamp: options?.timestamp,
  });
  return delta !== null;
}

/** otpauth URI for QR provisioning (Google Authenticator, etc.). */
export function otpauthUri(payload: OtpPayload): string {
  return buildTotp(payload).toString();
}

/** Build a default OTP payload with a fresh secret. */
export function createOtpPayload(partial?: Partial<OtpPayload>): OtpPayload {
  return {
    secret: partial?.secret ?? generateOtpSecret(),
    issuer: partial?.issuer ?? "OpsVault",
    label: partial?.label ?? "account",
    algorithm: partial?.algorithm ?? "SHA1",
    digits: partial?.digits ?? 6,
    period: partial?.period ?? 30,
  };
}
