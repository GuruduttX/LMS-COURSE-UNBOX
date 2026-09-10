import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { HOW_IT_WORKS } from "@/lib/data/home";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 py-14 md:py-20">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title="From first class to first offer"
          subtitle="A structured path, so you always know where you are and what comes next."
        />

        <Reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:mt-10">
          {HOW_IT_WORKS.map((item, index) => (
            <RevealItem
              key={item.step}
              className="relative rounded-xl border border-border bg-surface p-5"
            >
              {/* Connector between steps — desktop only, decorative. */}
              {index < HOW_IT_WORKS.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute -right-2 top-9 hidden h-px w-4 bg-border-strong lg:block"
                />
              ) : null}

              <span className="text-2xl font-extrabold tabular-nums text-brand-200">
                {item.step}
              </span>
              <h3 className="mt-2 text-base font-bold text-ink-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {item.body}
              </p>
            </RevealItem>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
