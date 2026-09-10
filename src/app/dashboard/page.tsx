import type { Metadata } from "next";
import { BookOpen } from "lucide-react";

import { CatalogCourseCard } from "@/components/dashboard/CatalogCourseCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { EnrolledCourseCard } from "@/components/dashboard/EnrolledCourseCard";
import { FeeNotice } from "@/components/dashboard/FeeNotice";
import { getEnrolledPrograms } from "@/lib/data/enrolled";
import { ReferralBanner } from "@/components/dashboard/ReferralBanner";
import { EnquiryProvider } from "@/components/enquiry/EnquiryProvider";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Reveal, RevealItem } from "@/components/ui/Reveal";
import {
  getAvailableCourses,
} from "@/lib/data/dashboard";
import { getStudent } from "@/lib/data/student";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Student dashboard. Both the student and their enrolments are real now — see
 * `data/enrolled.ts`, which reads the same rows the staff roster does.
 * Order is deliberate: what you're doing now, then what you could do next.
 *
 * "All courses" is still the marketing catalogue from `data/home.ts`: it is
 * what the business sells, not what the database has a program for, and the
 * two lists legitimately differ.
 */
export default async function DashboardPage() {
  const student = await getStudent();
  const enrolled = await getEnrolledPrograms(student.id);
  const available = getAvailableCourses(enrolled.map((item) => item.slug));

  // Withdrawn enrolments never reach here, so anything unpaid is something the
  // student can act on right now.
  const unpaid = enrolled.filter((item) => !item.fee.paid);

  return (
    <EnquiryProvider>
      <DashboardHeader />

      <main id="main" className="flex-1 py-8 md:py-10">
        <Container>
          {/* One banner, never two — see FeeNotice. The referral art comes back
              as soon as nothing is owed. */}
          {unpaid.length > 0 ? (
            <FeeNotice unpaid={unpaid} />
          ) : (
            <ReferralBanner />
          )}

          {/* Tight margin: the banner artwork carries ~48px of transparent
              padding of its own, which already reads as spacing. */}
          <h1 className="mt-4 text-xl font-bold text-ink-900 md:mt-6 md:text-2xl">
            Welcome back, {student.firstName}
          </h1>

          <section className="mt-8">
            <h2 className="text-xl font-bold text-ink-900 md:text-2xl">
              Your Program
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              {enrolled.length === 1
                ? "You are enrolled in 1 program."
                : `You are enrolled in ${enrolled.length} programs.`}
            </p>

            {enrolled.length > 0 ? (
              <Reveal className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {enrolled.map((item) => (
                  <RevealItem key={item.slug}>
                    <EnrolledCourseCard item={item} />
                  </RevealItem>
                ))}
              </Reveal>
            ) : (
              <EmptyState />
            )}
          </section>

          <section className="mt-10 md:mt-12">
            <h2 className="text-xl font-bold text-ink-900 md:text-2xl">
              All programs
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Everything else we offer. Add a second track at any time.
            </p>

            <Reveal className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {available.map((course) => (
                <RevealItem key={course.slug}>
                  <CatalogCourseCard course={course} />
                </RevealItem>
              ))}
            </Reveal>
          </section>
        </Container>
      </main>
    </EnquiryProvider>
  );
}

function EmptyState() {
  return (
    <div className="mt-5 rounded-xl border border-border bg-surface p-8 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <BookOpen size={24} aria-hidden />
      </span>
      <p className="text-lg font-semibold text-ink-900">
        You are not enrolled in a program yet
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
        Pick a program below and your lessons will appear here.
      </p>
      <ButtonLink href="#" size="lg" className="mt-5">
        Browse programs
      </ButtonLink>
    </div>
  );
}
