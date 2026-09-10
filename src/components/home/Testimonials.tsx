import { Quote, Star } from "lucide-react";

import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TESTIMONIALS } from "@/lib/data/home";

export function Testimonials() {
  return (
    <section className="py-14 md:py-20">
      <Container>
        <SectionHeading
          eyebrow="Student outcomes"
          title="What our learners say"
          subtitle="Three of the 3,000+ students who finished a program and moved into a marketing role."
        />

        {/* Mobile: horizontal snap scroller. Desktop: three columns. design.md §8. */}
        <Reveal className="mt-8 grid auto-cols-[85%] grid-flow-col gap-4 overflow-x-auto pb-4 [scrollbar-width:none] snap-x snap-mandatory sm:auto-cols-[60%] md:mt-10 md:grid-flow-row md:grid-cols-3 md:auto-cols-auto md:overflow-visible md:pb-0">
          {TESTIMONIALS.map((item) => (
            <RevealItem
              key={item.name}
              className="flex snap-start flex-col rounded-xl border border-border bg-surface p-5 shadow-sm md:snap-align-none"
            >
              <Quote
                size={28}
                aria-hidden
                className="text-brand-200"
                fill="currentColor"
              />

              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-700">
                {item.quote}
              </p>

              <div className="mt-5 border-t border-border pt-4">
                <div
                  className="flex gap-0.5"
                  aria-label={`Rated ${item.rating} out of 5`}
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star
                      key={index}
                      size={14}
                      aria-hidden
                      className={
                        index < item.rating ? "text-gold-400" : "text-ink-200"
                      }
                      fill="currentColor"
                    />
                  ))}
                </div>
                <p className="mt-2 text-sm font-bold text-ink-900">{item.name}</p>
                <p className="text-xs text-ink-500">{item.outcome}</p>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
