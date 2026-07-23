import type { SecretType } from "@ops-vault/core";
import type { ComponentType, SVGProps } from "react";
import {
  IconApi,
  IconCertificate,
  IconClock,
  IconCode,
  IconGrid,
  IconKey,
  IconNote,
  IconTerminal,
} from "@ops-vault/ui";

export type VaultFilter = "all" | SecretType;

type IconComp = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

export const TYPE_META: Record<
  SecretType,
  { label: string; short: string; Icon: IconComp; accent: string }
> = {
  password: {
    label: "Mots de passe",
    short: "MDP",
    Icon: IconKey,
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  otp: {
    label: "OTP / TOTP",
    short: "TOTP",
    Icon: IconClock,
    accent: "text-violet-600 dark:text-violet-400",
  },
  api_key: {
    label: "Clés API",
    short: "API",
    Icon: IconApi,
    accent: "text-amber-600 dark:text-amber-400",
  },
  certificate: {
    label: "Certificats",
    short: "Cert",
    Icon: IconCertificate,
    accent: "text-sky-600 dark:text-sky-400",
  },
  ssh_key: {
    label: "Clés SSH",
    short: "SSH",
    Icon: IconTerminal,
    accent: "text-rose-600 dark:text-rose-400",
  },
  note: {
    label: "Protected notes",
    short: "Note",
    Icon: IconNote,
    accent: "text-slate-600 dark:text-slate-300",
  },
  snippet: {
    label: "Snippets",
    short: "Code",
    Icon: IconCode,
    accent: "text-cyan-700 dark:text-cyan-400",
  },
};

export const FILTER_ORDER: VaultFilter[] = [
  "all",
  "password",
  "otp",
  "api_key",
  "certificate",
  "ssh_key",
  "note",
  "snippet",
];

export function filterLabel(f: VaultFilter): string {
  if (f === "all") return "All items";
  return TYPE_META[f].label;
}

export function filterIcon(f: VaultFilter): IconComp {
  if (f === "all") return IconGrid;
  return TYPE_META[f].Icon;
}
