/**
 * Contact-field validation shared by every form that asks for a phone number.
 *
 * The forms used to accept anything here: `type="tel"` only hints to mobile
 * keyboards, it does not reject letters, and the phone field had no rule on the
 * client or the server, so "hello" was stored as a phone number and handed to
 * entertainers. These helpers are the single definition of what a phone number
 * may contain, so the quote wizard, the business form and the account page all
 * agree.
 */

/** Digits allowed in a phone number: E.164 caps a full number at 15. */
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

/** Everything a phone number may contain. Deliberately excludes letters. */
const PHONE_ALLOWED = /^[0-9+()\-.\s]+$/;

export const PHONE_ERROR = "Enter a valid phone number — digits, spaces and + - ( ) only.";
export const PHONE_LENGTH_ERROR = "That does not look like a phone number — check the digits.";

/**
 * Drops anything a phone number cannot contain, as the visitor types. Validation
 * still runs on submit; this is so the field simply cannot hold a letter, which
 * is what the old `type="tel"` input appeared to promise but never did.
 */
export function sanitisePhoneInput(value: string): string {
  const kept = value.replace(/[^0-9+()\-.\s]/g, "");
  // Keep a "+" only when it is the first character.
  const plus = kept.startsWith("+") ? "+" : "";
  return plus + kept.replace(/\+/g, "");
}

/**
 * Returns an error message, or null when the value is acceptable.
 *
 * Empty is valid: every phone field in this app is optional, and callers decide
 * whether it is required rather than this function inventing a requirement.
 */
export function phoneError(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;

  if (!PHONE_ALLOWED.test(trimmed)) return PHONE_ERROR;

  // A "+" is only meaningful once, at the front.
  const plusCount = (trimmed.match(/\+/g) ?? []).length;
  if (plusCount > 1 || (plusCount === 1 && !trimmed.startsWith("+"))) {
    return PHONE_ERROR;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return PHONE_LENGTH_ERROR;
  }

  return null;
}

/** True when the value is empty or a plausible phone number. */
export function isValidPhone(value: string | null | undefined): boolean {
  return phoneError(value) === null;
}

/**
 * Error for a children/guest count, or null. Empty is allowed, because the
 * question is optional; anything else has to be a whole number in range.
 */
export function countError(value: string | null | undefined, max = 500): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "Use a whole number.";
  const number = Number(trimmed);
  if (number < 1) return "Enter at least 1.";
  if (number > max) return `That seems too high — enter ${max} or fewer.`;
  return null;
}

/**
 * Error for a price, or null. Empty is allowed — most listings publish no price.
 */
export function amountError(value: string | null | undefined, max = 100000): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return "Use a whole number, with no currency symbol.";
  const number = Number(trimmed);
  if (number < 0) return "Enter 0 or more.";
  if (number > max) return `That seems too high — enter ${max} or less.`;
  return null;
}

/**
 * Normalises a phone number for storage: keeps the leading "+" and the digits,
 * so "+1 (555) 010-2030" and "+15550102030" do not end up as two different
 * numbers in the database.
 */
export function normalisePhone(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return "";
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}
