import { ProgramCard } from "@/components/home/ProgramCard";
import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { listPublicPrograms } from "@/lib/data/public-programs";

/**
 * The programs on offer — read from the database, not a written-out list.
 *
 * This used to render four hardcoded entries from `data/home.ts`, which meant
 * the section advertised programs that did not exist and omitted every one
 * created since. Only **published** programs appear; see `public-programs.ts`.
 *
 * The section removes itself when nothing is published. A heading reading "Our
 * programs" above an empty grid is worse than no section at all — it looks like
 * a page that failed rather than a school that has not launched yet.
 */
export async function Programs() {
  const programs = await listPublicPrograms();
  if (programs.length === 0) return null;

  return (
    <section id="programs" className="scroll-mt-20 py-14 md:py-20">
      <Container>
        <SectionHeading
          eyebrow="Our programs"
          title="Cohort courses with placement support"
          subtitle={`${programs.length === 1 ? "One track" : `${programs.length} tracks`}, each structured into modules and lessons with weekly assignments reviewed by your mentor.`}
        />

        {/* Three across rather than a fixed four: the count is whatever is
            published, and a four-column grid holding five cards leaves one
            stranded on its own row. */}
        <Reveal className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:mt-10">
          {programs.map((program) => (
            <RevealItem key={program.slug}>
              <ProgramCard program={program} />
            </RevealItem>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
