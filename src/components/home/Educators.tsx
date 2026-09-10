import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { EDUCATORS } from "@/lib/data/home";

export function Educators() {
  return (
    <section
      id="educators"
      className="scroll-mt-20 border-y border-border bg-surface py-14 md:py-20"
    >
      <Container>
        <SectionHeading
          eyebrow="Your mentors"
          title="Taught by people who still do the work"
          subtitle="Every educator is a practising marketer — they teach the evening after running the campaign."
        />

        <Reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 md:mt-10">
          {EDUCATORS.map((person) => (
            <RevealItem
              key={person.name}
              className="rounded-xl border border-border bg-surface-muted p-5"
            >
              <div className="flex items-start justify-between gap-3">
                {/* Initials stand in until real photography is supplied. */}
                <span
                  aria-hidden
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700"
                >
                  {person.initials}
                </span>
                <span className="rounded-lg bg-brand-solid px-2 py-1 text-center text-white">
                  <span className="block text-sm font-bold leading-none tabular-nums">
                    {person.years}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-semibold uppercase leading-none tracking-wide">
                    Years
                  </span>
                </span>
              </div>

              <h3 className="mt-4 text-base font-bold text-ink-900">
                {person.name}
              </h3>
              <p className="text-sm font-medium text-brand-700">{person.role}</p>

              <ul className="mt-3 space-y-1.5">
                {person.credentials.map((line) => (
                  <li
                    key={line}
                    className="flex gap-2 text-sm text-ink-600 before:mt-2 before:h-1 before:w-1 before:shrink-0 before:rounded-full before:bg-ink-400 before:content-['']"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </RevealItem>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
