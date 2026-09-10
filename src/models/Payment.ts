/**
 * Payment — the ledger. One row per transaction attempt.
 *
 * **This collection is the only source of truth about money.** How much a
 * student has paid, whether they are paid up, which instalment they are on and
 * how many are left are all *counted from these rows* — none of them is stored
 * anywhere. `lib/data/fees.ts` does the counting, and it is the only thing that
 * does.
 *
 * That follows the rule the rest of this codebase already runs on: progress is
 * derived from the curriculum tree and never stored on the enrolment, "so it
 * can never contradict the screens that count". Money deserves it more than
 * progress does.
 *
 * There is one concrete failure it prevents. Razorpay **retries webhooks**, and
 * they can arrive out of order. A stored `installmentsPaid++` counter
 * double-increments on a retry, and a student gets access to a module nobody
 * paid for. Counting rows behind a unique index cannot do that.
 *
 * ## Append-only in spirit
 *
 * A row is written when a payment is *started* and updated once when it
 * settles. After that it is history: never edited, never deleted, not even for
 * a refund — a refund is `status: "refunded"` on the row it reverses, so the
 * fact that money arrived and then went back is still legible. The enrolment
 * doc's header already gives the reason: a fee dispute is exactly what these
 * rows exist to answer.
 *
 * ## Money is paise
 *
 * See `lib/payments/money.ts`. `3499900` is ₹34,999.
 */
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * What this payment was for.
 *
 * `emi_upfront` and `emi_cycle` are unused until subscriptions land. They are
 * named now because the alternative — a boolean that later needs a third state
 * — is a migration.
 */
export const PAYMENT_KINDS = ["full", "emi_upfront", "emi_cycle"] as const;

export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/**
 * `created` is an intent, not money. Only `captured` counts toward what a
 * student has paid — see `sumCaptured` in lib/data/fees.ts.
 *
 * Abandoned `created` rows are left alone rather than swept: a student who
 * opened checkout and closed it is a thing worth being able to see.
 */
export const PAYMENT_STATUSES = [
  "created",
  "captured",
  "failed",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const paymentSchema = new Schema(
  {
    /**
     * The enrolment this pays for — a student on one program. Fees are a fact
     * about an enrolment, never about a person: someone on two programs has two
     * fee positions, different amounts, one possibly paid and one not.
     */
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
      index: true,
    },
    /**
     * Both denormalised from the enrolment, for the reason `Module` carries
     * `programId` as well as `courseId`: "every payment for this program in
     * September" is a report somebody will want, and it should not need a join
     * to answer.
     */
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    programId: {
      type: Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    /**
     * The instalment plan this payment was made under, kept even after that
     * plan is archived — a receipt must stay readable.
     *
     * **Null for a one-time payment**, which has no plan: it is an Order priced
     * from `Program.feeAmount`. Null here therefore means the same thing it
     * means on the enrolment — paid in full.
     */
    feePlanId: {
      type: Schema.Types.ObjectId,
      ref: "FeePlan",
      default: null,
    },

    kind: { type: String, enum: PAYMENT_KINDS, required: true },
    /**
     * Which instalment this was — **as Razorpay reported it** (`paid_count` on
     * the subscription), not as we counted. A fact about the transaction, so it
     * is stored; "how many are left" is arithmetic, so it is not.
     *
     * Null for a one-time payment.
     */
    cycleNumber: { type: Number, default: null, min: 1 },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "created",
      index: true,
    },

    /* ------------------------------ Razorpay ------------------------------ */
    /** One-time payments. Set at creation; the receipt we send is this row's id. */
    razorpayOrderId: { type: String, default: null, trim: true },
    /** EMI. Set when subscriptions land. */
    razorpaySubscriptionId: { type: String, default: null, trim: true },
    /**
     * **The safety net.** Unique, so a replayed webhook is a no-op instead of a
     * second row — and therefore instead of a module unlocked twice.
     *
     * The index is partial rather than sparse on purpose: a sparse unique index
     * still indexes an explicit `null`, so the second unpaid row would collide
     * with the first. Matching on `$type: "string"` indexes only rows that have
     * actually been paid.
     */
    razorpayPaymentId: { type: String, default: null, trim: true },
    /** What we verified, kept so a disputed payment can be re-checked. */
    razorpaySignature: { type: String, default: null, trim: true },
    /** "card" | "upi" | "netbanking" | … — whatever Razorpay reports. */
    method: { type: String, default: "", trim: true },

    paidAt: { type: Date, default: null },
    /** Razorpay's `error_description`, for the student-facing retry message. */
    failureReason: { type: String, default: "", trim: true, maxlength: 300 },

    /**
     * Set when a member of staff recorded a payment that happened off-platform
     * — a bank transfer, cash, a cheque. Null for anything Razorpay handled.
     *
     * The field is here from the start because the alternative is discovering
     * on the day it first happens that the model cannot express it, and the
     * workaround people reach for then is editing the ledger by hand.
     */
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    /** Free text for an offline payment: "NEFT ref 88213, 12 Sep". */
    note: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

// The read behind every fee status: "everything paid on this enrolment".
paymentSchema.index({ enrollmentId: 1, status: 1, createdAt: -1 });

// Idempotency. See razorpayPaymentId above for why this is partial, not sparse.
paymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: { razorpayPaymentId: { $type: "string" } },
  },
);

/**
 * **At most one open full-payment intent per enrolment.**
 *
 * The double-click guard. `/api/payments/order` used to lean on Razorpay
 * rejecting a repeated `receipt` as an idempotency key — `npm run check:razorpay`
 * proved it does not: receipt uniqueness is an account setting that is off by
 * default, and two creates with one receipt cheerfully returned two order ids.
 * So the constraint lives here, where we control it, and the order route upserts
 * against it instead of inserting.
 *
 * Partial, so it binds only the rows it is about: a `created` row is an intent
 * and there should never be two open at once, while `captured`, `failed` and
 * `refunded` rows are history and an enrolment accumulates as many as it likes.
 * `kind` is in the filter because an EMI upfront payment is a different intent
 * from paying in full and the two may legitimately be open together.
 */
paymentSchema.index(
  { enrollmentId: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "created" },
  },
);

// How the verify route and the webhook both find the row they are settling.
paymentSchema.index(
  { razorpayOrderId: 1 },
  { partialFilterExpression: { razorpayOrderId: { $type: "string" } } },
);

export type PaymentDocument = InferSchemaType<typeof paymentSchema>;

export const Payment: Model<PaymentDocument> =
  (models.Payment as Model<PaymentDocument>) ??
  model<PaymentDocument>("Payment", paymentSchema);
