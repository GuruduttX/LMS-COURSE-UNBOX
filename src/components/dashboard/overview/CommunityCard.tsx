import { MessageCircle } from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";

/** Right-rail promo: the batch WhatsApp community. */
export function CommunityCard() {
  return (
    <section className="rounded-xl border border-success-500/25 bg-success-50 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-solid text-white">
        <MessageCircle size={20} aria-hidden />
      </span>
      <h2 className="mt-3 text-base font-bold text-ink-900">
        Join your batch community
      </h2>
      <p className="mt-1 text-sm text-ink-600">
        Ask questions between classes and hear about openings first.
      </p>
      <ButtonLink
        href="https://chat.whatsapp.com"
        variant="secondary"
        size="sm"
        className="mt-4"
      >
        Join on WhatsApp
      </ButtonLink>
    </section>
  );
}
