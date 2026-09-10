import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { LearnDrawer } from "@/components/learn/LearnDrawer";
import { LearnFooterBar, SubtopicSteps } from "@/components/learn/LearnFooterBar";
import { LearnSidebar } from "@/components/learn/LearnSidebar";
import { MaterialStage } from "@/components/learn/MaterialStage";
import { QuizRunner } from "@/components/learn/QuizRunner";
import { PdfStage, TextStage } from "@/components/learn/ReadingStage";
import { VideoStage } from "@/components/learn/VideoStage";
import { cn } from "@/lib/cn";
import { getStudent } from "@/lib/data/student";
import { courseDetailsHref } from "@/lib/curriculum/links";
import { getLearnScreen } from "@/lib/data/curriculum-db";
import { requireFeesPaid } from "@/lib/data/fee-gate";

/**
 * The learning screen:
 *
 *   /learn/[program]/[course]/[module]?s=<subtopic>
 *
 * The segments are exactly the tree — see the table at the top of
 * lib/curriculum/types.ts. Outline on the left, one subtopic on the right,
 * footer bar across the bottom of the content pane.
 *
 * **A quiz owns its own footer and the other kinds don't**, which is why the
 * pane switch below is not simply "render a component". Inside a quiz, Prev and
 * Next mean the previous and next *question*; everywhere else they mean the
 * previous and next subtopic. Same bar, two meanings, decided by what is in the
 * pane rather than by the bar.
 *
 * `?v=material` opens the module's study material in the pane instead of a
 * subtopic. It gets **no footer at all**: the document is not a step in the
 * sequence, so "Next" would have to mean something arbitrary. The outline is
 * how you leave it, and the outline is already on screen.
 *
 * Full-bleed rather than inside `Container`: this is a workspace, so the video
 * should use the width it has. The outline column is deliberately narrow —
 * 18rem — because the right pane is the point of the page.
 *
 * ## Two shapes, split at `lg`
 *
 * From `lg` the outline is a column and the pane sits beside it, each scrolling
 * independently.
 *
 * Below `lg` **the lesson owns the screen** — literally, now. The outline used
 * to stack above it, so every visit began by scrolling past the whole contents
 * list to reach the thing the page is for; it is a hamburger and a drawer
 * (`LearnDrawer`) instead. And the app header is hidden: two stacked bars
 * costing 7rem above a 16:9 video is most of the reason the player looked
 * small on a phone, and this route already carries its own bar with the way
 * back, the outline and where you are. `lg:contents` rather than a wrapper that
 * hides it, because a `sticky` header inside a plain wrapper div is a header
 * whose containing block is that div — it would stop sticking on desktop.
 *
 * That bar is dark **only over a video** — see `stageIsDark` below.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/learn/[program]/[course]/[module]">): Promise<Metadata> {
  const { program, course, module } = await params;
  const { v } = await searchParams;
  const screen = await getLearnScreen(program, course, module, undefined);

  if (!screen) return { title: "Lesson not found" };

  return {
    title:
      v === "material" && screen.module.material
        ? screen.module.materialTitle || "Study material"
        : screen.subtopic.title,
  };
}

export default async function LearnPage({
  params,
  searchParams,
}: PageProps<"/learn/[program]/[course]/[module]">) {
  const { program, course, module } = await params;
  const { s, v } = await searchParams;

  const student = await getStudent();

  /**
   * The fee gate, again.
   *
   * `/learn` is the second way into the same lessons — the dashboard's course
   * screens are gated by `dashboard/[course]/(paid)/layout.tsx`, and this route
   * tree is not underneath it. A gate on one of two doors is not a gate.
   *
   * It sits above `getLearnScreen` so an unpaid student is redirected to the
   * fee page rather than shown a 404: they know they are enrolled, and a 404
   * would read as a broken link. See `requireFeesPaid` for why that differs
   * from the house rule.
   */
  await requireFeesPaid(student.id, program);

  const screen = await getLearnScreen(
    program,
    course,
    module,
    typeof s === "string" ? s : undefined,
    { studentId: student.id },
  );

  // Unknown program, course or module, a course still locked, or not enrolled.
  // Same answer either way — the curriculum page is where a lock is explained.
  if (!screen) notFound();

  const { subtopic } = screen;

  // `?v=material` on a module with nothing attached falls back to the lesson
  // rather than 404ing — a stale link is not a missing page.
  const material = v === "material" ? screen.module.material : null;

  /**
   * Whether the mobile bar is sitting on top of a video.
   *
   * `night-*` are the app's **fixed** colours — the ones that mean "this thing
   * is dark by design", not "this thing is dark right now" (globals.css). A
   * player's surround qualifies; a page header does not. Painting the bar black
   * unconditionally made every quiz, reading and PDF open under a black slab
   * that ignored the student's light theme, because the bar was styled for the
   * one pane that happens to be black rather than for the pane it is above.
   */
  const stageIsDark = !material && subtopic.kind === "video";

  return (
    <>
      <div className="hidden lg:contents">
        <DashboardHeader />
      </div>

      {/* Two independent scroll areas from lg; one stacked column below it. */}
      <main
        id="main"
        // A **column** below lg and a row from it. The column is what makes the
        // lesson fill the screen: `main` stretches to the viewport (`flex-1` of
        // a `min-h-full` body under an `h-full` html), and as a block it used to
        // leave whatever was left over as a band of page background under the
        // footer on any short lesson. As a flex column the pane below stretches
        // into it instead.
        //
        // `min-h-0` matters: `main` is a `flex-1` item of a column `body`, so
        // its default `min-height: auto` lets tall content push it past the
        // height set here — which is how the two scroll areas below silently
        // became one long page instead.
        className="flex flex-1 flex-col lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:flex-row lg:overflow-hidden"
      >
        {/* The outline column, from lg only. Below it, LearnDrawer does this
            job in a shape that leaves the lesson the whole screen. */}
        <aside
          aria-label="Course outline"
          className="hidden bg-surface-muted lg:block lg:w-72 lg:shrink-0 lg:border-r lg:border-border"
        >
          <LearnSidebar screen={screen} isMaterialOpen={Boolean(material)} />
        </aside>

        {/* Each pane brings its own footer controls: Prev/Next means "another
            subtopic" over a video and "another question" inside a quiz. */}
        <div className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          {/* The mobile chrome: the way into the outline, and where you are.

              **It takes its colour from the pane under it.** Over a video it is
              black and butts straight up against the frame, so the two read as
              one player — the arrangement in every video app, and the reason it
              can be this compact: it is the player's bar, not the app's. Over a
              quiz, a reading or a PDF there is no player to belong to, so it is
              an ordinary themed header with a hairline under it, and it follows
              the student's theme like the rest of the app.

              Sticky either way, so the outline stays reachable from the bottom
              of a long reading without scrolling back up. */}
          <div
            className={cn(
              "sticky top-0 z-30 flex shrink-0 items-center gap-1 px-1.5 py-1.5 lg:hidden",
              stageIsDark
                ? "bg-night-900 text-white"
                : "border-b border-border bg-surface text-ink-900",
            )}
          >
            {/* The way out, which below lg had no home: the sidebar's "Course
                details" link is in the `lg` column, and the drawer never
                reproduced it. Icon-only — the bar's job is the lesson title,
                and the arrow beside it reads as up-one-level without a label.
                The `lg` sidebar keeps its own labelled link. */}
            <Link
              href={courseDetailsHref(screen.program.slug, screen.course.id)}
              aria-label={`Back to ${screen.course.title}`}
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                stageIsDark
                  ? "text-white/90 active:bg-white/15"
                  : "text-ink-700 active:bg-ink-100",
              )}
            >
              <ArrowLeft size={20} aria-hidden />
            </Link>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-2xs font-medium",
                  stageIsDark ? "text-white/60" : "text-ink-500",
                )}
              >
                {screen.module.number}. {screen.module.title}
              </p>
              <p
                className={cn(
                  "truncate text-sm font-semibold",
                  stageIsDark ? "text-white" : "text-ink-900",
                )}
              >
                {material
                  ? screen.module.materialTitle || "Study material"
                  : subtopic.title}
              </p>
            </div>
            {/* Moved to the right of the title: on the left it was two
                back-shaped controls in a row, and the outline is the thing you
                reach for *after* reading where you are, not before.

                No override off a video: the drawer's own default is the themed
                one, which is exactly what a light bar wants. */}
            <LearnDrawer
              screen={screen}
              triggerClassName={
                stageIsDark ? "text-white/90 active:bg-white/15" : undefined
              }
            />
          </div>

          {material ? (
            /* An explicit height below `lg` as well, not just `flex-1`: the
               column is only height-constrained from `lg` up, and a pane that
               can grow is a pane where zooming into the document lengthens the
               page and pushes the viewer's own controls off the bottom. The
               document scrolls inside itself at every width. */
            <div className="h-[calc(100dvh-4rem)] min-h-0 overflow-hidden">
              <MaterialStage
                file={material}
                title={screen.module.materialTitle || "Study material"}
              />
            </div>
          ) : subtopic.kind === "quiz" ? (
            // Keyed so switching quizzes starts a fresh attempt rather than
            // inheriting the previous quiz's question index.
            <QuizRunner key={subtopic.id} subtopic={subtopic} />
          ) : (
            <>
              {/* No scroll on a video: the frame takes the height that is
                  left after the footer, rather than the other way round. A
                  reading is the opposite — it is as long as it is, so that
                  pane scrolls and the sticky footer stays put. */}
              {/* A video never scrolls from lg — the frame takes the height
                  left after the footer. Below lg it must: the title, the
                  description and the handout all live under the player, and
                  that is the whole point of the mobile layout. */}
              <div
                className={
                  subtopic.kind === "video"
                    ? // A flex **column** at every width, which is what lets the
                      // lesson sheet fill the pane on a phone. `min-h-full` on
                      // the sheet's own wrapper cannot: this box gets its height
                      // from `flex-1`, so its computed `height` is still `auto`
                      // and a percentage resolved against it collapses. Growing
                      // a flex child into it is the version that works.
                      //
                      // **And below `lg` it is deliberately not a scroll
                      // container.** A cross-origin iframe inside an
                      // `overflow-y-auto` box is the one arrangement mobile
                      // browsers are unreliable about — taps land in the
                      // scroller instead of the player — and it was the only
                      // structural difference between the phone (where the
                      // controls misbehaved) and the desktop (where they never
                      // did). Without `min-h-0` the pane cannot shrink below its
                      // content, so a long lesson grows the page and the
                      // document scrolls, which is what a phone should do
                      // anyway. The constrained, non-scrolling pane comes back
                      // at `lg`, where the rule is that a lesson never scrolls.
                      "flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden"
                    : subtopic.kind === "text"
                      ? "min-h-0 flex-1 overflow-y-auto"
                      : "min-h-0 flex-1 overflow-y-auto lg:overflow-hidden"
                }
              >
                {subtopic.kind === "video" ? (
                  <VideoStage subtopic={subtopic} module={screen.module} />
                ) : subtopic.kind === "pdf" ? (
                  <PdfStage subtopic={subtopic} />
                ) : (
                  <TextStage subtopic={subtopic} />
                )}
              </div>
              <LearnFooterBar>
                <SubtopicSteps screen={screen} />
              </LearnFooterBar>
            </>
          )}
        </div>
      </main>
    </>
  );
}
