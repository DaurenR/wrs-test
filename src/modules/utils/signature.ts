import crypto from "crypto";

export function signatureOk(sig?: string, ts?: string) {
  if (!sig || !ts) return false;
  const age = Math.abs(Date.now() - Number(ts));
  if (age > 5 * 60_000) return false; // 5 минут окно
  const h = crypto.createHmac("sha256", process.env.SIGN_KEY || "");
  h.update(ts);
  const expected = h.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
