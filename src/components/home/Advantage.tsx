import {
  BadgeCheck,
  Briefcase,
  FolderKanban,
  MonitorPlay,
  type LucideIcon,
} from "lucide-react";

import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ADVANTAGES } from "@/lib/data/home";

const ICONS: Record<(typeof ADVANTAGES)[number]["icon"], LucideIcon> = {
  "monitor-play": MonitorPlay,
  "folder-kanban": FolderKanban,
  briefcase: Briefcase,
  "badge-check": BadgeCheck,
};

export function Advantage() {
  return (
    <section
      id="advantage"
      className="scroll-mt-20 border-y border-border bg-surface py-14 md:py-20"
    >
      <Container>
        <SectionHeading
          eyebrow="Why Course Unbox"
          title="Built to get you hired, not just certified"
          subtitle="Everything in the program exists because it changes an outcome — the class, the project, the feedback, the referral."
        />

        <Reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:mt-10">
          {ADVANTAGES.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <RevealItem
                key={item.title}
                className="rounded-xl border border-border bg-surface-muted p-5"
              >
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                  <Icon size={22} aria-hidden />
                </span>
                <h3 className="text-base font-bold text-ink-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {item.body}
                </p>
              </RevealItem>
            );
          })}
        </Reveal>
      </Container>
    </section>
  );
}
