"use client";

import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * The Pay button, and the only client component in the fee flow.
 *
 * Three steps, and it never decides any of them:
 *
 * 1. ask the server for an order — the **server** works out what is owed, from
 *    the plan and the ledger. This component posts a program slug and nothing
 *    else, because an amount sent by a browser is a suggestion from a stranger;
 * 2. open Razorpay Checkout with what came back;
 * 3. post what Checkout returns to `/api/payments/verify`, which checks the
 *    signature before believing any of it.
 *
 * Nothing here grants access. The page it sends the student to re-reads the
 * ledger on the server and would bounce them straight back if the payment had
 * not actually landed.
 *
 * ## The script is loaded on click, not on render
 *
 * `checkout.js` is a third-party script on the critical path of a page most
 * students see once. Fetching it when the button is pressed costs a moment
 * inside a flow that already has a spinner, and costs nothing on every other
 * render.
 *
 * ## Mock mode
 *
 * When Razorpay is unconfigured outside production, the server answers with
 * `mode: "mock"` and no key, and the button settles the payment locally so the
 * whole flow — notice, gate, pay, unlock — can be walked before an account
 * exists. The badge below says so in as many words; it is never subtle, and the
 * decision is the server's, taken from `NODE_ENV` rather than anything here.
 */

type CheckoutResponse = {
  razorpay_payment_id: string;
  /** One-time payments only. */
  razorpay_order_id?: string;
  /** Instalment plans only — Checkout returns one or the other, never both. */
  razorpay_subscription_id?: string;
  razorpay_signature: string;
};

/**
 * Checkout takes **either** an `order_id` or a `subscription_id`, and behaves
 * differently for each: an order asks for one payment, a subscription asks the
 * student to authorise a mandate. `amount` and `currency` belong only to the
 * order form — on a subscription Razorpay takes the figure from the plan and
 * its addons, and sending our own would be a number it ignores or rejects.
 */
type RazorpayOptions = {
  key: string;
  order_id?: string;
  subscription_id?: string;
  amount?: number;
  currency?: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
  theme: { color: string };
  handler: (response: CheckoutResponse) => void;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    // Re-use the tag if a previous attempt already added one — two <script>s
    // for the same SDK is a second copy of its global.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CHECKOUT_SRC}"]`,
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("checkout.js failed to load")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("checkout.js failed to load"));
    document.body.appendChild(script);
  });
}

type OrderResponse = {
  mode: "live" | "mock";
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId: string | null;
  programTitle: string;
  prefill: { name: string; email: string };
};

type SubscriptionResponse = {
  mode: "live" | "mock";
  subscriptionId: string;
  keyId: string | null;
  programTitle: string;
  planLabel: string;
  /** Down payment plus the first cycle — what today's authorisation collects. */
  firstAmount: number;
  totalCycles: number;
  prefill: { name: string; email: string; contact?: string };
};

export function PayPanel({
  programSlug,
  amountLabel,
  plan,
  disabled,
  disabledReason,
}: {
  programSlug: string;
  /** "₹34,999" — formatted on the server so both sides show one number. */
  amountLabel: string;
  /**
   * The instalment plan they are on, or undefined when paying in full.
   *
   * Which flow to use is decided here, from what the student chose, rather than
   * by asking one endpoint and letting it redirect: an order and a subscription
   * are different Razorpay objects with different endpoints, different Checkout
   * options and different return signatures, and pretending otherwise only
   * moves the branch somewhere less obvious.
   */
  plan?: { label: string; cycles: number };
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settle = useCallback(
    async (payload: Record<string, string>) => {
      const response = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            "We couldn't confirm that payment. Please contact the office before trying again.",
        );
      }

      // The server owns the answer. Refresh so the gate, the banner and the
      // card all re-read the ledger, then go where the student was headed.
      router.replace(`/dashboard/${programSlug}/overview`);
      router.refresh();
    },
    [router, programSlug],
  );

  /**
   * Authorise an instalment mandate.
   *
   * Three differences from paying in full, all of them Razorpay's: the
   * subscription is created at its own endpoint, Checkout opens with
   * `subscription_id` and no amount, and the handler comes back with
   * `razorpay_subscription_id` instead of an order id.
   *
   * What it *collects* today is the down payment plus the first cycle together,
   * because the addon is charged in the authorisation transaction. Every month
   * after happens with no browser open — the webhook is the whole story there.
   */
  const subscribe = useCallback(async () => {
    const response = await fetch("/api/payments/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programSlug }),
    });

    const sub = (await response.json().catch(() => null)) as
      | (SubscriptionResponse & { error?: string })
      | null;

    if (!response.ok || !sub) {
      throw new Error(sub?.error ?? "We couldn't set up the instalment plan.");
    }

    if (sub.mode === "mock" || !sub.keyId) {
      await settle({ subscriptionId: sub.subscriptionId });
      return;
    }

    await loadCheckout();

    if (!window.Razorpay) throw new Error("checkout.js failed to load");

    const checkout = new window.Razorpay({
      key: sub.keyId,
      subscription_id: sub.subscriptionId,
      // No amount or currency: on a subscription Razorpay prices the
      // authorisation from the plan and its addons, and ours would be ignored.
      name: "Course Unbox",
      description: `${sub.programTitle} — ${sub.planLabel}`,
      prefill: sub.prefill,
      theme: { color: "#2563EB" },
      handler: (result) => {
        settle({
          subscriptionId: sub.subscriptionId,
          razorpay_payment_id: result.razorpay_payment_id,
          razorpay_signature: result.razorpay_signature,
        }).catch((cause: unknown) => {
          setBusy(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "We couldn't confirm that payment.",
          );
        });
      },
      modal: {
        // The subscription stays `created` and is reused on the next attempt,
        // so closing the modal costs nothing.
        ondismiss: () => setBusy(false),
      },
    });

    checkout.open();
  }, [programSlug, settle]);

  const pay = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      if (plan) {
        await subscribe();
        return;
      }

      const response = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programSlug }),
      });

      const order = (await response.json().catch(() => null)) as
        | (OrderResponse & { error?: string })
        | null;

      if (!response.ok || !order) {
        throw new Error(order?.error ?? "We couldn't start the payment.");
      }

      if (order.mode === "mock" || !order.keyId) {
        await settle({ paymentId: order.paymentId });
        return;
      }

      await loadCheckout();

      if (!window.Razorpay) throw new Error("checkout.js failed to load");

      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Course Unbox",
        description: order.programTitle,
        prefill: order.prefill,
        theme: { color: "#2563EB" },
        handler: (result) => {
          // Deliberately not awaited inside the handler — Razorpay closes its
          // modal as soon as this returns, and the spinner below covers the
          // round trip.
          settle({
            paymentId: order.paymentId,
            razorpay_payment_id: result.razorpay_payment_id,
            razorpay_signature: result.razorpay_signature,
          }).catch((cause: unknown) => {
            setBusy(false);
            setError(
              cause instanceof Error
                ? cause.message
                : "We couldn't confirm that payment.",
            );
          });
        },
        modal: {
          // Closing Checkout is not an error. The `created` row stays as the
          // record of an attempt, and the button goes back to being a button.
          ondismiss: () => setBusy(false),
        },
      });

      checkout.open();
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error ? cause.message : "Something went wrong.",
      );
    }
  }, [programSlug, settle, plan, subscribe]);

  if (disabled) {
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-4">
        <p className="flex items-start gap-2 text-sm text-ink-600">
          <Lock size={16} className="mt-0.5 shrink-0 text-ink-400" aria-hidden />
          {disabledReason ?? "Payments aren't available right now."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Button size="lg" className="w-full" onClick={pay} disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden />
            Opening payment…
          </>
        ) : (
          <>Pay {amountLabel}</>
        )}
      </Button>

      {error ? (
        <p
          role="alert"
          className="mt-3 flex items-start gap-1.5 text-sm font-medium text-danger-700"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
          <ShieldCheck size={14} aria-hidden />
          Payments are handled by Razorpay. We never see your card details.
        </p>
      )}
    </div>
  );
}
