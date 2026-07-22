import {
  certificateSummary,
  decryptPayload,
  generateTotp,
  type CertificatePayload,
  type MasterKey,
  type OtpPayload,
  type PasswordPayload,
  type SecretMeta,
} from "@ops-vault/core";
import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";

interface Props {
  masterKey: MasterKey;
  refreshToken: number;
  onError: (msg: string) => void;
}

export function SecretList({ masterKey, refreshToken, onError }: Props) {
  const [items, setItems] = useState<SecretMeta[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState<{
    code: string;
    remaining: number;
  } | null>(null);
  const [otpPayload, setOtpPayload] = useState<OtpPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const { items: list } = await api.listSecrets();
      setItems(list);
    } catch (err) {
      onError(err instanceof Error ? err.message : "List failed");
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    if (!otpPayload) {
      setOtpCode(null);
      return;
    }
    const tick = () => {
      const t = generateTotp(otpPayload);
      setOtpCode({ code: t.code, remaining: t.remaining });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [otpPayload]);

  async function toggle(item: SecretMeta) {
    if (openId === item.id) {
      setOpenId(null);
      setRevealed(null);
      setOtpPayload(null);
      return;
    }

    try {
      const full = await api.getSecret(item.id);
      const payload = await decryptPayload(full.encryptedData, masterKey);
      setOpenId(item.id);

      if (item.type === "otp") {
        setOtpPayload(payload as OtpPayload);
        setRevealed(null);
      } else if (item.type === "password") {
        const p = payload as PasswordPayload;
        setRevealed(
          [p.username && `user: ${p.username}`, `pass: ${p.password}`]
            .filter(Boolean)
            .join("\n")
        );
        setOtpPayload(null);
      } else if (item.type === "certificate") {
        const cert = payload as CertificatePayload;
        setRevealed(
          [
            certificateSummary(cert),
            cert.fingerprintSha256 && `sha256: ${cert.fingerprintSha256}`,
            cert.privateKeyPem ? "private key: present" : "private key: none",
            "",
            cert.pem,
          ]
            .filter((x) => x !== undefined)
            .join("\n")
        );
        setOtpPayload(null);
      } else {
        setRevealed(JSON.stringify(payload, null, 2));
        setOtpPayload(null);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Decrypt failed");
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteSecret(id);
      if (openId === id) {
        setOpenId(null);
        setRevealed(null);
        setOtpPayload(null);
      }
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-700 px-5 py-8 text-center text-sm text-slate-500">
        Aucun secret — ajoutez un mot de passe ou un OTP.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => void toggle(item)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-400/90">
                {item.type}
              </span>
              <span className="truncate text-sm font-medium">{item.title}</span>
            </button>
            <button
              type="button"
              onClick={() => void remove(item.id)}
              className="text-xs text-slate-500 hover:text-red-400"
            >
              Suppr.
            </button>
          </div>

          {openId === item.id && (
            <div className="mt-3 border-t border-slate-800 pt-3">
              {item.type === "otp" && otpCode ? (
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-500">Code TOTP</p>
                    <p className="font-mono text-3xl tracking-[0.3em] text-emerald-400">
                      {otpCode.code}
                    </p>
                  </div>
                  <p className="text-sm text-slate-400">
                    {otpCode.remaining}s
                  </p>
                </div>
              ) : (
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 font-mono text-xs text-cyan-100/90">
                  {revealed}
                </pre>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
