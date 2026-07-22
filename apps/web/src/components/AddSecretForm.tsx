import {
  createOtpPayload,
  encryptPayload,
  parseCertificatePem,
  type MasterKey,
  type SecretType,
} from "@ops-vault/core";
import { useState, type FormEvent } from "react";
import * as api from "../lib/api";

interface Props {
  masterKey: MasterKey;
  onCreated: () => void;
  onError: (msg: string) => void;
}

const TYPES: { value: SecretType; label: string }[] = [
  { value: "password", label: "Mot de passe" },
  { value: "otp", label: "OTP / TOTP" },
  { value: "api_key", label: "Clé API" },
  { value: "certificate", label: "Certificat X.509" },
  { value: "note", label: "Note" },
  { value: "ssh_key", label: "Clé SSH" },
  { value: "snippet", label: "Snippet" },
];

export function AddSecretForm({ masterKey, onCreated, onError }: Props) {
  const [type, setType] = useState<SecretType>("password");
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otpLabel, setOtpLabel] = useState("");
  const [otpIssuer, setOtpIssuer] = useState("OpsVault");
  const [otpSecret, setOtpSecret] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [snippet, setSnippet] = useState("");
  const [certPem, setCertPem] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let payload: Record<string, unknown>;

      switch (type) {
        case "password":
          payload = { username, password };
          break;
        case "otp": {
          const otp = createOtpPayload({
            secret: otpSecret || undefined,
            label: otpLabel || title,
            issuer: otpIssuer,
          });
          payload = otp;
          break;
        }
        case "note":
          payload = { body: noteBody };
          break;
        case "api_key":
          payload = { key: apiKey };
          break;
        case "ssh_key":
          payload = { privateKey: sshKey };
          break;
        case "snippet":
          payload = { code: snippet };
          break;
        case "certificate":
          payload = parseCertificatePem(certPem);
          break;
        default:
          payload = { notes: noteBody };
      }

      const encryptedData = await encryptPayload(payload, masterKey);
      await api.createSecret({ type, title, encryptedData });
      setTitle("");
      setUsername("");
      setPassword("");
      setOtpLabel("");
      setOtpSecret("");
      setNoteBody("");
      setApiKey("");
      setSshKey("");
      setSnippet("");
      setCertPem("");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
    >
      <h3 className="text-base font-medium">Nouveau secret</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SecretType)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-400">Titre</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="GitHub, Bastion, …"
          />
        </label>
      </div>

      {type === "password" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Utilisateur"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            required
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
      )}

      {type === "otp" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={otpIssuer}
            onChange={(e) => setOtpIssuer(e.target.value)}
            placeholder="Issuer"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            value={otpLabel}
            onChange={(e) => setOtpLabel(e.target.value)}
            placeholder="Label compte"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            value={otpSecret}
            onChange={(e) => setOtpSecret(e.target.value)}
            placeholder="Secret Base32 (vide = généré)"
            className="sm:col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
          />
        </div>
      )}

      {type === "note" && (
        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          rows={3}
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />
      )}

      {type === "api_key" && (
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
          placeholder="sk-…"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
        />
      )}

      {type === "ssh_key" && (
        <textarea
          value={sshKey}
          onChange={(e) => setSshKey(e.target.value)}
          rows={4}
          required
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs"
        />
      )}

      {type === "snippet" && (
        <textarea
          value={snippet}
          onChange={(e) => setSnippet(e.target.value)}
          rows={4}
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
        />
      )}

      {type === "certificate" && (
        <textarea
          value={certPem}
          onChange={(e) => setCertPem(e.target.value)}
          rows={6}
          required
          placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs"
        />
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-white disabled:opacity-60"
      >
        {busy ? "Chiffrement…" : "Enregistrer (chiffré)"}
      </button>
    </form>
  );
}
