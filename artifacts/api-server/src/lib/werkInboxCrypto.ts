import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function sleutel(): Buffer {
  const secret = process.env["SESSION_SECRET"] ?? "fps-default-secret-change-me";
  return crypto.scryptSync(secret, "fps-werk-inbox-v1", 32);
}

export function encrypteer(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const k = sleutel();
  const cipher = crypto.createCipheriv(ALGO, k, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypteer(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const k = sleutel();
  const decipher = crypto.createDecipheriv(ALGO, k, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
