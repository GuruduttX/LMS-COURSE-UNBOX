import {
  ArrowRight,
  KeyRound,
  Mail,
  MonitorPlay,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { FIRST_DAY } from "@/lib/data/home";

const ICONS: Record<(typeof FIRST_DAY)[number]["icon"], LucideIcon> = {
  mail: Mail,
  "key-round": KeyRound,
  wallet: Wallet,
  "monitor-play": MonitorPlay,
};

/**
 * For the visitor who has already enrolled and is looking for the way in. How
 * It Works sells the program; this tells a new student exactly what happens
 * between paying and their first class, so the login screen is not a surprise.
 */
export function FirstDay() {
  return (
    <section
      id="get-started"
      className="scroll-mt-20 border-y border-brand-100 bg-brand-50 py-14 md:py-20"
    >
      <Container>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SectionHeading
              eyebrow="New students"
              title="Enrolled? Here's your first day"
              subtitle="What happens between enrolling and your first class, so nothing on the way in is a surprise."
            />
            <div className="mt-8 flex flex-col gap-3 pl-4 sm:flex-row sm:items-center">
              <ButtonLink href="/login" size="lg">
                Sign in to your dashboard
                <ArrowRight size={18} aria-hidden />
              </ButtonLink>
            </div>
            <p className="mt-4 pl-4 text-xs text-ink-500">
              No login yet?{" "}
              <a
                href="mailto:support@courseunbox.com?subject=Login%20details"
                className="font-semibold text-brand-600 hover:text-brand-700"
              >
                Email support
              </a>{" "}
              and we&apos;ll get you set up.
            </p>
          </div>

          <Reveal>
            <ol>
              {FIRST_DAY.map((step, index) => {
                const Icon = ICONS[step.icon];
                return (
                  <RevealItem
                    as="li"
                    key={step.title}
                    className="relative flex gap-4 pb-8 last:pb-0"
                  >
                    {/* The rail down to the next step. Drawn per step so it
                        always stops at the last icon. Decorative. */}
                    {index < FIRST_DAY.length - 1 ? (
                      <span
                        aria-hidden
                        className="absolute bottom-0 left-5 top-10 w-px bg-brand-200"
                      />
                    ) : null}
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-surface text-brand-700">
                      <Icon size={18} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface p-5 shadow-xs">
                      <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand-600">
                        Step {index + 1}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-ink-900">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                        {step.body}
                      </p>
                    </div>
                  </RevealItem>
                );
              })}
            </ol>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
