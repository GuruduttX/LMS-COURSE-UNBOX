/**
 * Rules for what a program costs and how it may be paid over time, shared by
 * the admin forms and the actions that save them.
 *
 * Pure, like every other validator here — the form imports it to show errors as
 * you type, the action imports it to decide what actually gets written, and one
 * definition means the two cannot disagree.
 */
import { MAX_AMOUNT, MIN_AMOUNT, parseRupees } from "@/lib/payments/money";
import { isFeePlanPeriod } from "@/lib/payments/plan-kinds";

/* ---------------------------- the program's fee --------------------------- */

export type ProgramFeeInput = {
  /** Rupees as typed — "34,999", "₹34999". Converted to paise on save. */
  feeAmount: string;
  /** The struck-through price. Blank means no discount is advertised. */
  listAmount: string;
};

export type ProgramFeeErrors = Partial<Record<keyof ProgramFeeInput, string>>;

export const EMPTY_PROGRAM_FEE: ProgramFeeInput = {
  feeAmount: "",
  listAmount: "",
};

/**
 * The price of the program, and the price it is discounted from.
 *
 * An empty `feeAmount` is valid and means **no fee** — the program opens without
 * payment, which is how every enrolment that predates fees keeps working. It is
 * a real choice, not a missing field, so it is not an error.
 *
 * `listAmount` is display only and must be **strictly greater** than the fee.
 * Equal is refused as well as lower: a struck-through price identical to the one
 * being charged advertises a discount of nothing, which is the kind of thing an
 * advertising regulator has opinions about.
 */
export function validateProgramFee(input: ProgramFeeInput): ProgramFeeErrors {
  const errors: ProgramFeeErrors = {};

  const hasFee = input.feeAmount.trim() !== "";
  const hasList = input.listAmount.trim() !== "";

  const fee = hasFee ? parseRupees(input.feeAmount) : null;

  if (hasFee) {
    if (fee === null) {
      errors.feeAmount = "Enter the fee as a number, like 34999.";
    } else if (fee < MIN_AMOUNT) {
      errors.feeAmount = "The fee must be at least ₹1, or blank for no fee.";
    } else if (fee > MAX_AMOUNT) {
      errors.feeAmount = "That looks like a typo — the cap is ₹10,00,000.";
    }
  }

  if (!hasList) return errors;

  const list = parseRupees(input.listAmount);

  if (list === null) {
    errors.listAmount = "Enter the original price as a number, or leave it blank.";
  } else if (list > MAX_AMOUNT) {
    errors.listAmount = "That looks like a typo — the cap is ₹10,00,000.";
  } else if (!hasFee) {
    errors.listAmount =
      "An original price needs a fee to be discounted from. Set the fee, or clear this.";
  } else if (fee !== null && !errors.feeAmount && list <= fee) {
    errors.listAmount =
      list === fee
        ? "The original price must be higher than the fee, or there's no discount to show."
        : "The original price can't be lower than what you're charging.";
  }

  return errors;
}

/* ------------------------ one student's own price ------------------------ */

export type CustomFeeInput = { customFeeAmount: string };

export type CustomFeeErrors = Partial<Record<keyof CustomFeeInput, string>>;

/**
 * A price for one student. Blank clears it and puts them back on the program's.
 *
 * **Zero is allowed** — a free seat is a real decision, and refusing it would
 * push staff into typing ₹1 and calling it done. `MIN_AMOUNT` applies to
 * everything above zero, because Razorpay will not take an order under ₹1.
 */
export function validateCustomFee(input: CustomFeeInput): CustomFeeErrors {
  const errors: CustomFeeErrors = {};

  if (input.customFeeAmount.trim() === "") return errors;

  const paise = parseRupees(input.customFeeAmount);

  if (paise === null) {
    errors.customFeeAmount = "Enter a number, like 24999, or 0 for a free seat.";
  } else if (paise > 0 && paise < MIN_AMOUNT) {
    errors.customFeeAmount = "Either ₹0 for a free seat, or at least ₹1.";
  } else if (paise > MAX_AMOUNT) {
    errors.customFeeAmount = "That looks like a typo — the cap is ₹10,00,000.";
  }

  return errors;
}

/* ------------------------------ instalments ------------------------------ */

/**
 * An instalment plan. There is no `kind` — **every `FeePlan` is instalments**.
 * Paying in full is `Program.feeAmount` and needs no row; see `models/FeePlan.ts`.
 */
export type FeePlanInput = {
  label: string;
  description: string;
  /** What the program costs on this plan — usually more than paying in full. */
  totalAmount: string;
  upfrontAmount: string;
  cycleAmount: string;
  totalCycles: string;
  period: string;
  interval: string;
};

export type FeePlanErrors = Partial<Record<keyof FeePlanInput, string>>;

export const EMPTY_FEE_PLAN: FeePlanInput = {
  label: "",
  description: "",
  totalAmount: "",
  upfrontAmount: "",
  cycleAmount: "",
  totalCycles: "",
  period: "monthly",
  interval: "1",
};

/** Above this, RBI requires the student to authenticate every single debit. */
export const AFA_FREE_CEILING = 1_500_000;

function amountError(paise: number | null, what: string): string | null {
  if (paise === null) return `Enter ${what} as a number, like 8000.`;
  if (paise < MIN_AMOUNT) return `${what} must be at least ₹1.`;
  if (paise > MAX_AMOUNT) return "That looks like a typo — the cap is ₹10,00,000.";
  return null;
}

export function validateFeePlan(input: FeePlanInput): FeePlanErrors {
  const errors: FeePlanErrors = {};

  const label = input.label.trim();
  if (!label) {
    errors.label = "Name the plan — students pick between these by name.";
  } else if (label.length > 80) {
    errors.label = "Keep the name under 80 characters.";
  }

  if (input.description.trim().length > 300) {
    errors.description = "Keep the description under 300 characters.";
  }

  const total = parseRupees(input.totalAmount);
  const totalProblem = amountError(total, "the total on this plan");
  if (totalProblem) errors.totalAmount = totalProblem;

  const upfront =
    input.upfrontAmount.trim() === "" ? 0 : parseRupees(input.upfrontAmount);
  if (upfront === null || upfront < 0) {
    errors.upfrontAmount = "Enter the down payment as a number, or leave it blank.";
  } else if (upfront > MAX_AMOUNT) {
    errors.upfrontAmount = "That looks like a typo — the cap is ₹10,00,000.";
  }

  const cycle = parseRupees(input.cycleAmount);
  const cycleProblem = amountError(cycle, "the monthly amount");
  if (cycleProblem) errors.cycleAmount = cycleProblem;

  const cycles = Number(input.totalCycles);
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 60) {
    errors.totalCycles = "Between 1 and 60 instalments.";
  }

  if (!isFeePlanPeriod(input.period)) errors.period = "Pick a billing period.";

  const interval = Number(input.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) {
    errors.interval = "Between 1 and 12.";
  }

  /**
   * The arithmetic has to close, exactly.
   *
   * Every cycle of a Razorpay plan is the same amount — there is no way to make
   * the last instalment a little smaller — so an arbitrary total rarely divides
   * evenly and the remainder has to go into the down payment, which we control
   * freely because it is an addon rather than part of the plan. Without this
   * check you get a plan whose instalments quietly sum to ₹34,998 and nobody
   * notices until a student finishes paying and the system still says they owe
   * two rupees.
   */
  if (
    total !== null &&
    cycle !== null &&
    upfront !== null &&
    Number.isInteger(cycles) &&
    cycles >= 1 &&
    !errors.totalAmount &&
    !errors.cycleAmount
  ) {
    const collected = upfront + cycle * cycles;

    if (collected !== total) {
      const gap = total - collected;
      const suggestion = upfront + gap;

      errors.cycleAmount =
        suggestion >= 0
          ? `The instalments don't add up. ${cycles} × ₹${cycle / 100} + ₹${upfront / 100} down = ₹${collected / 100}, but this plan's total is ₹${total / 100}. Set the down payment to ₹${suggestion / 100}, or change the monthly amount.`
          : `${cycles} × ₹${cycle / 100} is already more than the ₹${total / 100} total. Lower the monthly amount or the number of instalments.`;
    }
  }

  /**
   * RBI's e-mandate rules cap frictionless auto-debit at ₹15,000 per
   * transaction on cards and UPI AutoPay; above it the student must authenticate
   * every single debit, which is not an auto-debit at all and collects badly.
   * Education is not one of the exempted merchant categories.
   *
   * A warning rather than a hard stop, because e-mandate (netbanking / NACH)
   * does clear higher amounts — so a bigger instalment is a decision, not a
   * mistake. It is worded as one.
   */
  if (cycle !== null && cycle > AFA_FREE_CEILING && !errors.cycleAmount) {
    errors.cycleAmount =
      "Over ₹15,000 an instalment can't be auto-debited on a card or UPI — the student has to approve every month. Split it into more instalments, or confirm with Razorpay that your account can take e-mandate at this amount.";
  }

  return errors;
}
