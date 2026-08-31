/**
 * Short, unguessable share slugs.
 *
 * 10 chars of a 32-symbol alphabet (~50 bits) keeps `/s/<slug>` short while
 * making unlisted studies impossible to enumerate. Database ids are never
 * exposed in share URLs.
 */

// Crockford-ish alphabet: no vowels (no accidental words), no look-alikes.
const ALPHABET = "23456789bcdfghjkmnpqrstvwxyz";

export const SLUG_LENGTH = 10;
export const SLUG_PATTERN = /^[23456789bcdfghjkmnpqrstvwxyz]{6,16}$/;

export function generateSlug(length = SLUG_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
