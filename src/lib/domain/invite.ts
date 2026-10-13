import { createHash, randomInt } from "node:crypto";

// Unambiguous characters only (no 0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 16;

/** One-time invite code like "K7QF-2XMR-T9PA-WC3H" (~79 bits of entropy). */
export function generateInviteCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) raw += ALPHABET[randomInt(ALPHABET.length)];
  return raw.match(/.{4}/g)!.join("-");
}

/** Accepts codes typed with spaces, dashes or lowercase letters. */
export function normalizeInviteCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** Only this hash is stored; the code itself is shown once to the inviter. */
export function hashInviteCode(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
