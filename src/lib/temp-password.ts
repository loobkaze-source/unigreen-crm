/**
 * Temporary passwords an admin hands to a new or reset user.
 *
 * Plain module (not "use server") so both the /users view and the server
 * actions can use it.
 */

/** Every shared temp password the team has ever been given. These are
 *  written down in old notes, so they must never be issued again — nor kept
 *  as someone's "new" password on /set-password. */
export const KNOWN_TEMP_PASSWORDS = ["123456", "Uniwave#2026"];

// No look-alikes (0/O, 1/l/I) — the password is read off a screen or a chat
// message and typed on a phone.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random 10-character password (~57 bits), from the platform CSPRNG. */
export function generateTempPassword(length = 10): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Why a temp password is unacceptable, or null when it is fine. */
export function tempPasswordProblem(password: string): string | null {
  if ((password || "").length < 8) return "รหัสเริ่มต้นต้องมีอย่างน้อย 8 ตัวอักษร";
  if (KNOWN_TEMP_PASSWORDS.includes(password))
    return "รหัสนี้เคยใช้เป็นรหัสชั่วคราวร่วมกัน — กรุณาใช้รหัสที่สุ่มขึ้นใหม่";
  return null;
}
