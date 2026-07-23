export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  /** Block passwords found in breach databases (HIBP). */
  checkBreaches: boolean;
  /** Recommended only — soft warnings if false. */
  enforce: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: false,
  checkBreaches: true,
  enforce: false,
};

export interface PolicyViolation {
  code: string;
  message: string;
  severity: "error" | "warn";
}

export interface PolicyResult {
  ok: boolean;
  score: number; // 0–100
  violations: PolicyViolation[];
}

/** Evaluate a password against a policy (local rules only). */
export function evaluatePasswordPolicy(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
): PolicyResult {
  const violations: PolicyViolation[] = [];
  const sev = policy.enforce ? "error" : "warn";

  if (password.length < policy.minLength) {
    violations.push({
      code: "min_length",
      message: `Au moins ${policy.minLength} caractères`,
      severity: sev,
    });
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    violations.push({
      code: "uppercase",
      message: "Au moins une majuscule",
      severity: sev,
    });
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    violations.push({
      code: "lowercase",
      message: "Au moins une minuscule",
      severity: sev,
    });
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    violations.push({
      code: "digit",
      message: "Au moins un chiffre",
      severity: sev,
    });
  }
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
    violations.push({
      code: "symbol",
      message: "Au moins un symbole",
      severity: sev,
    });
  }

  // Simple strength score
  let score = Math.min(40, password.length * 3);
  if (/[A-Z]/.test(password)) score += 15;
  if (/[a-z]/.test(password)) score += 15;
  if (/\d/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 15;
  score = Math.min(100, score);
  if (violations.some((v) => v.severity === "error")) {
    score = Math.min(score, 45);
  }

  const ok = !violations.some((v) => v.severity === "error");
  return { ok, score, violations };
}

export function mergePolicy(
  partial?: Partial<PasswordPolicy> | null
): PasswordPolicy {
  return { ...DEFAULT_PASSWORD_POLICY, ...partial };
}
