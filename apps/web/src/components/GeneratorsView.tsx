import {
  estimatePassphraseEntropy,
  estimatePasswordEntropy,
  generatePassphrase,
  generatePassword,
  generateUsername,
  type UsernameStyle,
} from "@ops-vault/core";
import { Button, IconCopy } from "@ops-vault/ui";
import { useEffect, useMemo, useState } from "react";

type GenTab = "password" | "passphrase" | "username";

export function GeneratorsView() {
  const [tab, setTab] = useState<GenTab>("password");
  const [copied, setCopied] = useState(false);

  // password
  const [pwLen, setPwLen] = useState(20);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState("");
  const [words, setWords] = useState(5);
  const [sep, setSep] = useState("-");
  const [passphrase, setPassphrase] = useState("");
  const [style, setStyle] = useState<UsernameStyle>("handle");
  const [username, setUsername] = useState("");
  const [ready, setReady] = useState(false);

  // Generate after mount so a crypto bug never freezes the route transition
  useEffect(() => {
    try {
      setPassword(generatePassword({ length: 20, symbols: true }));
      setPassphrase(generatePassphrase({ words: 5 }));
      setUsername(generateUsername());
    } catch (err) {
      console.error("generator init failed", err);
      setPassword("OpsVault-ChangeMe-123!");
      setPassphrase("Alpha-Beta-Gamma-42");
      setUsername("user" + String(Date.now()).slice(-4));
    } finally {
      setReady(true);
    }
  }, []);

  const value =
    tab === "password"
      ? password
      : tab === "passphrase"
        ? passphrase
        : username;

  const entropy = useMemo(() => {
    if (tab === "password") {
      return estimatePasswordEntropy(password, {
        length: pwLen,
        uppercase: upper,
        lowercase: lower,
        digits,
        symbols,
      });
    }
    if (tab === "passphrase") return estimatePassphraseEntropy(words);
    return null;
  }, [tab, password, pwLen, upper, lower, digits, symbols, words]);

  function regen() {
    if (tab === "password") {
      setPassword(
        generatePassword({
          length: pwLen,
          uppercase: upper,
          lowercase: lower,
          digits,
          symbols,
        })
      );
    } else if (tab === "passphrase") {
      setPassphrase(generatePassphrase({ words, separator: sep }));
    } else {
      setUsername(generateUsername({ style }));
    }
    setCopied(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const tabs: Array<{ id: GenTab; label: string }> = [
    { id: "password", label: "Password" },
    { id: "passphrase", label: "Passphrase" },
    { id: "username", label: "Username" },
  ];

  if (!ready) {
    return (
      <div className="space-y-5">
        <h2 className="text-lg font-semibold">Generators</h2>
        <p className="text-sm text-[var(--ov-muted)]">Preparing…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Generators</h2>
        <p className="text-sm text-[var(--ov-muted)]">
          Local CSPRNG — nothing leaves this device.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-[var(--ov-soft)] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-[var(--ov-panel)] text-[var(--ov-fg)] shadow-sm"
                : "text-[var(--ov-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] p-5">
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-3 font-mono text-sm text-[var(--ov-fg)]">
            {value || "…"}
          </code>
          <Button type="button" variant="secondary" onClick={() => void copy()}>
            <IconCopy className="h-4 w-4" />
          </Button>
        </div>
        {entropy != null && (
          <p className="text-xs text-[var(--ov-faint)]">~{entropy} bits</p>
        )}
        {copied && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Copied
          </p>
        )}

        {tab === "password" && (
          <div className="space-y-3">
            <label className="block text-xs text-[var(--ov-muted)]">
              Length · {pwLen}
              <input
                type="range"
                min={8}
                max={64}
                value={pwLen}
                onChange={(e) => {
                  const length = Number(e.target.value);
                  setPwLen(length);
                  setPassword(
                    generatePassword({
                      length,
                      uppercase: upper,
                      lowercase: lower,
                      digits,
                      symbols,
                    })
                  );
                }}
                className="mt-1 w-full"
              />
            </label>
            <div className="flex flex-wrap gap-4 text-sm text-[var(--ov-muted)]">
              {(
                [
                  ["upper", upper, setUpper, "A–Z"],
                  ["lower", lower, setLower, "a–z"],
                  ["digits", digits, setDigits, "0–9"],
                  ["symbols", symbols, setSymbols, "#$%"],
                ] as const
              ).map(([key, checked, set, label]) => (
                <label key={key} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => set(e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {tab === "passphrase" && (
          <div className="space-y-3">
            <label className="block text-xs text-[var(--ov-muted)]">
              Words · {words}
              <input
                type="range"
                min={3}
                max={10}
                value={words}
                onChange={(e) => setWords(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            <label className="block text-sm text-[var(--ov-muted)]">
              Separator
              <input
                value={sep}
                onChange={(e) => setSep(e.target.value.slice(0, 3))}
                className="mt-1 w-24 rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-2 py-1.5 text-[var(--ov-fg)]"
              />
            </label>
          </div>
        )}

        {tab === "username" && (
          <label className="block text-sm text-[var(--ov-muted)]">
            Style
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as UsernameStyle)}
              className="mt-1 w-full rounded-lg border border-[var(--ov-border)] bg-[var(--ov-input)] px-3 py-2 text-[var(--ov-fg)]"
            >
              <option value="handle">handle</option>
              <option value="word_num">word_number</option>
              <option value="name.num">name.number</option>
              <option value="emailish">email-like</option>
            </select>
          </label>
        )}

        <Button type="button" onClick={regen}>
          Generate
        </Button>
      </div>
    </div>
  );
}
