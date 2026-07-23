/**
 * Manual smoke: pnpm --filter @ops-vault/core exec tsx src/encoding.test-manual.ts
 * (optional — not part of the default build)
 */
import { assertBase64RoundTrip, base64ToBytes, bytesToBase64 } from "./encoding.js";

const lengths = [1, 2, 3, 15, 16, 17, 32, 46, 64];
for (const n of lengths) {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = (i * 17 + 3) & 255;
  assertBase64RoundTrip(bytes);
  const b64 = bytesToBase64(bytes);
  const back = base64ToBytes(b64);
  if (back.length !== n) throw new Error(`fail len ${n}`);
}
console.log("base64 round-trip OK for lengths", lengths.join(", "));
