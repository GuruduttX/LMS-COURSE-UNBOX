/**
 * Money, in paise.
 *
 * **Every amount in this codebase is an integer number of paise.** ₹34,999 is
 * `3499900`. Nothing stores rupees, nothing stores a float, and nothing divides
 * before it has to.
 *
 * That is not fussiness. `0.1 + 0.2 !== 0.3` in IEEE 754, so a fee summed from
 * float rupees drifts, and a student who has paid in full is told they owe
 * ₹0.01. Razorpay takes paise for exactly this reason, so storing paise also
 * means the number we hold and the number we send are the same number — no
 * conversion at the boundary, which is where conversions go wrong.
 *
 * Pure and dependency-free: the admin form, the student's fee page and the
 * server actions all import it, so it must be safe in a browser bundle.
 */

/** ₹1. The smallest amount Razorpay will accept on an order is 100 paise. */
export const RUPEE = 100;

/** Razorpay's floor for an order or a plan. Below this the API rejects it. */
export const MIN_AMOUNT = 100;

/**
 * A sanity ceiling — ₹10,00,000. Not a Razorpay limit; a typo guard. Six zeros
 * typed instead of four is the mistake this catches, and no program here costs
 * ten lakh.
 */
export const MAX_AMOUNT = 100_000_000;

/**
 * Paise as "₹34,999" — Indian digit grouping, no decimals when it is a whole
 * number of rupees.
 *
 * Whole rupees lose the ".00" because every fee in this system is a whole
 * number of rupees and "₹34,999.00" reads like a bank statement rather than a
 * price. A part-rupee amount keeps both decimals rather than rounding, because
 * the one place it can occur is an instalment remainder, and hiding it there is
 * how a total stops adding up on screen.
 */
export function formatPaise(paise: number): string {
  const whole = paise % 100 === 0;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(paise / 100);
}

/**
 * What a person typed, as paise. `null` when it isn't a usable amount.
 *
 * Accepts "34999", "34,999", "₹34,999" and "34999.50" — an admin pasting from
 * a quote should not have to strip the formatting the quote came with. Rejects
 * anything with more than two decimal places, because a third decimal is a
 * fraction of a paisa and the intent behind it is never clear.
 */
export function parseRupees(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;

  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  // Round after multiplying: Number("34999.50") * 100 is 3499949.999... on some
  // inputs, and truncating that loses a paisa.
  const paise = Math.round(Number(cleaned) * 100);

  return Number.isSafeInteger(paise) ? paise : null;
}

/** Paise back into the plain rupee string a number input wants. */
export function toRupeeInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
