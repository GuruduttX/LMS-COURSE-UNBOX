# LMS — Project Reference

Running log of what exists, how it fits together, and decisions made. Maintained for
future Claude sessions: read this first, and append to it whenever something changes.

Last updated: 2026-10-27

---

## What this project is

An LMS (learning management system) for courseunbox.com. Two halves, both now real:

- **The student experience** — dashboard, course overview, curriculum, the learning
  screen (video + quizzes), the marksheet, and live sessions.
- **The staff panel** — separate signed-in areas for admin, program manager and teacher,
  each unable to reach the others'.

**Auth is real** (email + password, cookie sessions) and so are users, roles, live
sessions and attendance. The curriculum, enrolments and marks are still static seed data,
each behind one lookup function that is the seam to swap for a database read — see
"Where things stand".

## Stack

| Piece | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3.1, App Router | Turbopack is the default bundler |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS v4 | Configured via PostCSS plugin, not `tailwind.config.js` |
| Linting | ESLint + `eslint-config-next` | Flat config |
| Database | MongoDB Atlas + Mongoose 9 | Connection cached on `globalThis` — see below |
| Animation | framer-motion 13 | Shared variants only — see `src/lib/motion.ts` |
| Icons | lucide-react 1.33 | The only icon library; don't mix in others |
| Auth | Own cookie sessions — bcryptjs + jose | No Auth.js/Clerk; see "Auth" |
| Package manager | npm | `package-lock.json` is the lockfile of record |

Package name is `lms` (lowercase) even though the directory is `LMS` — npm rejects
capital letters in package names. Not a mistake; don't "fix" it.

## Layout

```
src/app/            App Router root
  layout.tsx        Root layout — fonts, metadata, <html>/<body> shell
  page.tsx          Public home page (composes the sections below)
  globals.css       Tailwind entry + ALL design tokens (colors, type, radius, shadow)
  favicon.ico
  dashboard/page.tsx       Student dashboard (static data)
  dashboard/[course]/overview/page.tsx  Per-course overview
  dashboard/[course]/course_details/page.tsx  Per-course curriculum (modules)
  dashboard/[course]/marksheet/page.tsx  All marks for one program
  dashboard/[course]/sessions/page.tsx   Live sessions + attendance (student view)
  learn/[program]/[course]/[module]/page.tsx  Learning screen (video / quiz)
  login/            The only way in — page + signIn/signOut actions
  account/password/ Change your own password (also the forced-change screen)
  admin/            Admin area: overview, people (list / new / [id])
  manager/          Program manager area: overview, sessions (list / new / [id] /
                    [id]/attendance)
  teacher/          Teacher area: overview, sessions (read-only)
  {admin,teacher}/tasks/  Set a task (program-wide or one student); list and delete
  dashboard/[course]/tasks/  The student's tasks for one program
  api/health/db/route.ts   GET /api/health/db — pings Atlas, returns ok/state/database
  api/enquiries/route.ts   POST — validates and stores a lead
  api/uploads/sign/route.ts     POST — a folder-locked Cloudinary signature
  api/uploads/destroy/route.ts  POST — delete an asset someone took back off
  api/video/sign/route.ts       POST — reserve a Bunny video + sign a TUS upload
  api/video/status/route.ts     POST — has Bunny finished encoding this one?
  api/video/destroy/route.ts    POST — delete a video nothing points at
  api/webhooks/bunny/route.ts   POST — Bunny says a video finished (HMAC-verified)
  api/payments/order/route.ts   POST — open a Razorpay order for a program's fee
  api/payments/verify/route.ts  POST — the browser came back from Checkout
  api/webhooks/razorpay/route.ts POST — Razorpay says money moved (HMAC-verified)
  dashboard/[course]/fees/     The student's payment page — OUTSIDE the (paid) gate
  dashboard/[course]/(paid)/   Route group: everything behind the fee gate
src/proxy.ts        Route gate (Next 16's renamed middleware) — NOT the auth boundary
src/models/
  Enquiry.ts        Lead from the public enquiry form
  User.ts           Everyone: admin / program_manager / teacher / student
  LiveSession.ts    A scheduled call; kind = learning | placement; batch = one
                    cohort, or "" for the whole program
  Attendance.ts     One student, one session, present | absent
  Enrollment.ts     One student, one program — withdrawn, never deleted
  Task.ts           Unmarked work set by a teacher or admin; audience = program |
                    batch | student
  FeePlan.ts        One instalment schedule (EMI only) — append-only, archived
  Payment.ts        The fee ledger — one row per transaction, never edited
  uploaded-file-schema.ts  The embedded {url, publicId, …} shared by files
  bunny-video-schema.ts    The embedded {videoId, libraryId, status, …} on a subtopic
  AuditLog.ts       Who did what, when (append-only bar admin purge)
src/components/
  dashboard/        DashboardHeader, ReferralBanner, EnrolledCourseCard,
                    CatalogCourseCard
  dashboard/tests/  TestRunner (cover → paper → "calculating" → result)
  staff/students/   screens.tsx (all three levels), EnrollControls
  learn/            LearnSidebar (lg), LearnDrawer (mobile), LessonScaffold
                    (the stage + the phone's detail sheet),
                    VideoStage, ReadingStage (text + PDF),
                    QuizRunner (client), EmptyPane, LearnFooterBar
  dashboard/curriculum/  CourseRail, CourseCards (mobile), CoursePanel, ItemRow,
                    AssignmentActions (Submit button + brief ⋮),
                    status.tsx (badges/icons)
  staff/grading/    GradeForm (the mark + feedback island)
  dashboard/marksheet/  ScoreBand, MarksTable, ModuleBreakdown, MarkValue,
                    GraduationCriteria (dialog)
  dashboard/overview/  OverviewHeader, MetricStrip, ContinueCard, PlacementCard,
                    SupportCard, SessionsCard, CommunityCard
  dashboard/sessions/  AttendanceBand (dialog), SessionCard, SessionFilters
  auth/             AuthShell (split frame for /login + /account/password),
                    LoginForm, ChangePasswordForm, UserMenu
  staff/            StaffLayout (guard + shell), StaffShell, nav.ts, StatTile,
                    PersonForm, SessionForm, AttendanceRoster
  enquiry/          EnquiryProvider (context), EnquiryDialog, EnquiryButton
  ui/               Primitives: Button/ButtonLink, Container, Field, FileUpload,
                    VideoUpload, AttachmentLink, Modal, SectionHeading, Reveal,
                    EmptyState, PasswordInput (show/hide toggle)
  site/             SiteHeader, SiteFooter, SocialIcons
  home/             Hero, Programs, Advantage, HowItWorks, FirstDay, Educators,
                    Testimonials, Faq, CtaBand
src/lib/
  auth/roles.ts     ROLES, ROLE_HOME, AREA_ACCESS — edge-safe, no deps
  auth/permissions.ts  Capability list + ROLE_CAPABILITIES + can()
  auth/guards.ts    requireUser / requireRole / assertScope — THE auth boundary
  auth/session.ts   The cookie (server-only); token.ts signs/verifies (edge-safe)
  auth/cookie.ts    Session cookie name and max-age — shared with the proxy
  auth/password.ts  bcryptjs hash/verify + DUMMY_HASH
  theme.ts          Theme type + cookie name (no imports: edge + client safe)
  theme-server.ts   getTheme() — reads the cookie; theme-actions.ts writes it
  auth/audit.ts     recordAudit()/writeAudit() — never throws
  auth/audit-actions.ts  ACTIONS: every logged verb, its label and category
  data/home.ts      Static home-page copy that is NOT a program (stats, FAQs, …)
  data/public-programs.ts  What a visitor sees: published programs + curriculum
  data/dashboard.ts Pure dashboard helpers (no imports — keep it that way)
  data/course-overview.ts  Per-course metrics/sessions + getCourseOverview(slug)
  data/curriculum-db.ts  THE tree, from Mongo: getProgramCurriculum / getLearnScreen
  data/progress.ts    One student's progress, attempts and submissions, as Maps
  data/curriculum-staff.ts  Staff counts: what exists and how much is unpublished
  data/staff-program.ts  Guarded program load for /admin and /teacher
  data/staff-work.ts  A test or an assignment, for its builder
  data/curriculum.ts  The old static tree — superseded, read only by marksheet.ts
  data/marksheet.ts   Marks derived from the static tree + module-test seed
  data/student.ts   getStudent() — the signed-in student (server-only)
  data/people.ts    Reads behind the admin's people screens
  data/sessions.ts  Live sessions + derived attendance (student side, from Mongo)
  data/manager-sessions.ts  The same rows, staff side (+ roster, teachers)
  data/session-kinds.ts  SESSION_KINDS — shared by the model, forms and UI
  data/session-batches.ts  "which sessions belong to these cohorts", once
  data/teacher-assignments.ts  Who teaches a batch / a program, and who could
  actions/teacher-assignments.ts  Put a teacher on a batch, or off a program
  tasks/audiences.ts  TASK_AUDIENCES — pure, so the composer can import it
  curriculum/question-kinds.ts  The four kinds + gradeAnswer — THE definition
  data/attempt.ts   Reading an attempt; finalising an overdue one
  data/students.ts  Who is in a program, and how they are doing (scoped)
  data/enrolled.ts  The signed-in student's real enrolments
  data/fees.ts      getFeeStatus / programFeeRoster — THE answer to "have they paid?"
  actions/fee-choice.ts   chooseFeePlan — the student picking how they'll pay
  payments/plan-kinds.ts  periods, the 3-plan cap, the full-payment sentinel
  data/fee-gate.ts  requireFeesPaid — the redirect, split out so fees.ts stays pure
  payments/money.ts  Paise <-> rupees. Pure; every amount in the app is paise
  payments/razorpay.ts    Orders + the three signatures (server-only, no SDK)
  payments/settle.ts      capturePayment / failPayment — the one idempotent write
  actions/fee-plans.ts    create / archive a plan, assign one to a student
  actions/enrollments.ts  enrol / withdraw
  data/marksheet-db.ts  The marksheet, derived from the tree
  actions/attempts.ts   start / answer / violation / submit
  uploads/kinds.ts  What may be uploaded, where it lands, who may — shared
  uploads/cloudinary.ts  Signing and destroying (server-only)
  video/shared.ts   StoredVideo, the status mapping, the file rules — shared
  video/bunny.ts    Bunny Stream: create / sign / read / delete / embed (server-only)
  validation/enquiry.ts  Enquiry rules — imported by BOTH the form and the API
  validation/auth.ts, user.ts, session.ts  Same pattern, for the new forms
  useMediaQuery.ts  matchMedia via useSyncExternalStore
  useFullscreenLandscape.ts  Rotate into landscape on fullscreen, and back
  cn.ts             Tiny class-name joiner
  db.ts             Mongoose connection (connectToDatabase, connectionState)
  env.ts            Server-only env accessors with clear failure messages
  motion.ts         Shared framer-motion variants (fadeUp, stagger, modalPanel, sheet…)
scripts/seed.ts     `npm run seed` — creates the first admin and dev accounts
scripts/seed-enrollments.ts  `npm run seed:enrollments` — real enrolment rows
scripts/reset-data.ts  `npm run reset:data` — wipe every document in lms_db,
                       keeping admin accounts. Dry run unless --yes --db=lms_db
scripts/verify-cloudinary.ts  `npm run check:cloudinary` — upload/delete round trip
                              per kind, plus the MAX_UPLOAD_BYTES ceiling
scripts/verify-bunny.ts       `npm run check:bunny` — Bunny create/upload/delete round trip
scripts/verify-razorpay.ts    `npm run check:razorpay` — real test order, a real
                              plan + subscription, and all three HMACs, positive
                              and negative, plus the webhook route
qa/check-doublepay.mjs        Double-click guard on /api/payments/order — six
                              clicks must open one row and one order
qa/check-subscription.mjs     Instalments end to end: mandate, cycle 1, replay,
                              and cycles 2-9 driven by signed webhooks
qa/check-feerecord.mjs        The admin-only Fee record dialog — throwaway admin
                              and manager accounts prove who sees it
design.md           The design system — read before building any UI
.env.example        Committed template (the .gitignore has a `!.env.example` exception)
.env.local          Real secrets — gitignored, never commit
public/             Static assets served at / (starter SVGs, unused so far)
next.config.ts      Next config (empty defaults)
tsconfig.json       `@/*` -> `src/*` import alias
eslint.config.mjs
postcss.config.mjs  Registers @tailwindcss/postcss
```

### Design system

[design.md](design.md) is the single source of truth for how the UI should look and
behave: palette roles, type scale, spacing, component specs (buttons, inputs, cards,
progress, course/module/lesson tree, lesson player, tables), motion budgets, 30 UX rules,
and responsiveness rules. Read it before building any screen.

Its brand colours come from the client's marketing site, courseunbox.com: blue `#2563EB`
as primary, gold `#FFC629` as an accent, navy ink, blue-tinted near-white page wash. The
one deliberate divergence from that site: **gold is never an action colour in the app** —
blue means "do this", gold means "you earned this".

### Public home page

`/` is the logged-out marketing page. Section order: Hero (with stats band) →
Programs → Advantage → How it works → Educators → Testimonials → FAQ → CTA band →
Footer. Structure follows courseunbox.com and trainings.internshala.com; visuals follow
[design.md](design.md).

**The programs are read from the database** — `listPublicPrograms()` in
[src/lib/data/public-programs.ts](src/lib/data/public-programs.ts), published only.
Everything else on the page (stats, advantages, educators, testimonials, FAQ) is
institution-level copy with no row anywhere and stays in
[src/lib/data/home.ts](src/lib/data/home.ts). Each card links to `/courses/[slug]`.

Everything is server-rendered except four client components, each for a real reason:
`SiteHeader` (menus, scroll state), `Faq` (accordion), and `Reveal`/`RevealItem` (the
scroll-in animation wrapper). Sections stay server components and wrap their content in
`<Reveal>`.

**Gotcha — lucide-react v1 removed brand icons.** `Instagram`, `Youtube` and `Linkedin`
no longer exist as exports; the build fails with "Export X doesn't exist". The three
social marks are hand-drawn in lucide's stroke style in
[src/components/site/SocialIcons.tsx](src/components/site/SocialIcons.tsx). Don't add a
second icon library for them.

Verified at 320/390/768/1024/1440px: no page-level horizontal overflow. The testimonial
row scrolls inside its own container on mobile, which is the intended pattern.

### Student dashboard (`/dashboard`)

Signed-in landing page. Order: referral banner → "Your courses" (enrolled) → "All
courses" (everything else). Static data in
[src/lib/data/dashboard.ts](src/lib/data/dashboard.ts).

`ENROLLMENTS` holds only a course `slug` plus progress; `getEnrolledCourses()` joins it
against `COURSES` and sorts in-progress first, and `getAvailableCourses()` returns the
complement. That mirrors how the real query will work (enrollments and courses are
separate collections), so replacing the arrays won't change the components.

Each enrolled card leads with progress and a single **Resume** button naming the next
lesson; completed courses swap it for the certificate state. Catalog cards show duration,
structure, start date and fee, with "Know more" plus an "Enrol" button that opens the
enquiry dialog (so the page needs `EnquiryProvider`).

Two things about the **referral banner** (`public/referral-banner.webp`, 2172×724): it is
capped at `max-w-4xl` so it doesn't span the full content width, and its wrapper has *no*
card, radius or shadow — the artwork carries ~48px of transparent margin and its own
rounded corners, so a container box draws a visible frame around empty space. That same
transparent margin is why the heading below it uses a tight `mt-4`.

`DashboardHeader` is a deliberately minimal top bar. The full app shell from design.md §5
(left sidebar on desktop, bottom tab bar on mobile) is worth building when the lesson
player lands and there is more than one real destination.

Course fees come from `Program.feeAmount` (paise), set on the admin fees screen. A
program with no fee shows no price rather than "Free".

### Course overview (`/dashboard/[course]/overview`)

What a student sees for one enrolled course. Layout: breadcrumb + greeting + course
title → metric strip (progress / score / attendance) → two columns, main (continue,
placement hub, support) and a right rail (sessions, community). Stacks to one column
under `lg`.

Uses `<Container size="wide">` (1440px, smaller gutter) rather than the default 1152px
reading width — see the Container note below. The grid gaps step up to `gap-8` from `lg`
and the rail widens to `24rem` at `xl`, so the extra width is shared rather than all
dumped into the main column.

The sessions rail reads **real rows** — `getCourseSessions` in
[data/sessions.ts](src/lib/data/sessions.ts), the same source as the full
sessions screen, showing the next three upcoming with the join link off the
session itself. It was the last hard-coded block in `data/course-overview.ts`;
the seeded score, placement and attendance metrics there are still placeholders.
Liveness arrives on the row as `isLive` rather than being computed in the card,
because reading the clock during render is impure and the lint rule says so.

**Mobile splits into two tabs**, Overview and Live sessions
([OverviewTabs](src/components/dashboard/overview/OverviewTabs.tsx)), because the stacked
layout put the sessions rail far below the fold — a student checking whether a session is
on today shouldn't scroll past everything else. The tab is a URL (`?tab=live`), so the
page stays a server component, a tab is linkable, and Back works; an unrecognised value
reads as the default rather than 404ing. The metrics follow their tab: progress and score
sit with the work, attendance sits with the sessions it is measured from — that's what
`MetricStrip`'s `show` prop is for. From `lg` the tabs disappear, all three metrics ride
together above both columns, and the URL simply stops mattering.

**One data call, many components.** The page calls `getCourseOverview(slug)` once and
passes slices down; each block is its own file under
`src/components/dashboard/overview/`, so a block can be changed, reordered or dropped
without touching the others. `getCourseOverview` is the single seam to swap for a
database read — it already returns `null` for "no such course *or* not enrolled", which
the page turns into `notFound()` (verified: unknown slug → 404).

**Rendered per request** (`export const dynamic = "force-dynamic"`). Two reasons that
won't change: the data is per-student, and the sessions card says "Today", which would
freeze at build time under static rendering.

Both states are built and checked: in-progress (module, up-next lesson, module progress
bar, live session in the rail) and completed (certificate download, "finished every
module", green progress ring, empty schedule).

Session times are stored as **minutes from midnight**, not timestamps, so the static
placeholder never goes stale. Real sessions will carry real datetimes.

Two things from the Internshala reference were deliberately left out per instruction:
the "Debarred" badge and the placement-journey alert.

### The curriculum tree

One vocabulary, five levels, used everywhere — code, UI copy and route segments all
agree:

```
Program  → Course        → Module      → Topic          → Subtopic
enrolled   "Course 4:      "Module 2:    "Custom          a video, or
in         Meta Ads"       Audiences"    audiences"       a quiz  ← the atom
```

All of it lives in [src/lib/data/curriculum.ts](src/lib/data/curriculum.ts) — **one file
for both screens**, because two files describing the same tree drift apart. Two seams to
swap for database reads: `getProgramCurriculum(slug)` and `getLearnScreen(...)`; both
return null for "no such thing *or* not enrolled", which the pages turn into a 404.

A course holds one ordered `items` list of `CourseItem`, typed `module` / `assignment` /
`assessment`. One list rather than three arrays because a student meets them interleaved
and that order is the teaching order; module rows carry the module itself, graded rows
carry their own status and score. `number: null` marks the standalone checkpoints
(mid-term, end-term) that sit between courses — that's also what tells the UI not to
print "Course N".

**Everything countable is derived, never stored** — `coursePercent`, `moduleStatus`,
`topicStatus`, `courseCounts`, `moduleSeconds`. Seed data therefore cannot contradict
itself, and a status only has to be set on subtopics.

**A module's test counts towards the module (2026-09-12).** `modulePercent` and
`moduleStatus` used to walk the subtopics only, so a module whose lessons had been
watched read **100% and "completed" while its paper had never been opened** — and then
the final test refused to unlock, because `finalTestLockReason` was counting the very
paper the percentage had dropped. A number that says finished and a gate that says not
finished cannot both be right, and the gate is the one that decides whether the student
moves on, so the number follows it. Both now take a `ModuleView` rather than
`TopicView[]` (five callers, all of which had the module in hand already), and count the
test as one more unit: **sat, not passed** — the same bar the gate uses, since a module
test has unlimited attempts and requiring a score would invent a gate that exists nowhere
else. `topicStatus` keeps its own roll-up: a topic holds lessons and never a paper.

Knock-on, and intended: a course with an unsat module test no longer reaches 100%, so
`coursePercent`, the program totals, `defaultCourseId` and `checkpointLockReason` all
move with it — a mid-term checkpoint now waits on module tests the way the final already
did.

Four link helpers keep every entry point honest, so no component builds a URL by hand:
`courseDetailsHref`, `learnHref`, `moduleEntryHref` (first unfinished subtopic of a
module), `entryHref` (same, for a whole course — what "Go to course" uses) and
`resumeHref` (first in-progress subtopic anywhere in the program — what the overview's
button uses).

### Program curriculum (`/dashboard/[course]/course_details`)

The courses inside one program, and how far the student has got in each. Layout:
breadcrumb → greeting → "Curriculum" + program deadline + overall progress → course rail
(20rem) beside the selected course's panel. Stacks to one column under `lg`, rail first.
`<Container size="wide">`, `gap-8` from `lg`. The rail is 22rem (24rem at `xl`) rather
than the minimum that fits: course titles run to two lines, so it needs real width, and
the cards inside carry `p-5` with `space-y-4` between them — at tighter values the rail
read as a cramped list rather than a set of cards. The page's "Curriculum" heading is one
step smaller than the overview's (`text-xl`/`md:text-2xl`); it labels a column layout, it
isn't the page's headline act.

Note the route param is still called `course` but holds the **program** slug — the
selected course is `?c=`. Renaming the segment would break the dashboard and overview
links for no user-visible gain.

**Selection is a URL, not client state.** The rail links to `?c=<courseId>`, so the page
stays a server component, every course is linkable, and Back works. An unknown `?c=`
falls back to the first unfinished course rather than 404ing.

**Below `lg` the rail collapses into a picker** — a native `<details>` whose summary names
where you are ("Course: 4 of 5") and whose rows are the courses. Stacked cards would have
pushed the selected course's content a full screen down. Native `<details>` again, so it
works without JavaScript and the column stays a server component; it is keyed on the
selected course id so picking one remounts it closed — a soft navigation would otherwise
keep the same DOM node, and its open state, covering the course just chosen. The card's progress bar
is half the card width: it's a glance, not a measurement, and full-width made it the
loudest thing in the rail.

The panel shows the course header (deadline, "Go to course", N/M done), the item rows,
then the course's graded artefacts as separate cards, each only when present: final test
(score, or "Attempt test"), course project (not-started / submitted / evaluated with
feedback), and the course certificate — the only gold on the page, earned rather than an
action. **Module rows are themselves links** into the learning screen: the row is the way
in, so making the student go back up to the header button would be a step they don't
need. Assignment and assessment rows aren't links yet; those screens don't exist.

Statuses live in one place,
[src/components/dashboard/curriculum/status.tsx](src/components/dashboard/curriculum/status.tsx):
`StatusBadge`, `StatusIcon`, `TypeIcon`. Locked rows state *why* inline rather than in a
tooltip — tooltips don't exist on touch, and the reason is the point of the row.

### Marksheet (`/dashboard/[course]/marksheet`)

Every mark in one program. Order: back link → greeting → "Marksheet" → score band → a row
per course (test / project & viva / assignment) → the term assessments → module-level
detail. Reached from the overview's "View marksheet" metric link, which already pointed
here. Same note as the sibling pages: the `course` route param holds the *program* slug.

**Marks are derived from the percentages already on the curriculum tree**, in
[src/lib/data/marksheet.ts](src/lib/data/marksheet.ts) — one score, displayed two ways,
so the marksheet and the curriculum page cannot disagree. The maxima are programme rules
rather than per-student data, so they're constants there: final test = questions × 5,
project = 200, assignment = 100 each, mid/end-term = questions × 20, module test =
questions × 5. Marks round to one decimal, like a real marksheet.

**Module test results are seeded in `marksheet.ts`, not on the tree.** A mark is a
submission — it belongs to the student — while `CourseModule` describes the syllabus every
student shares. Keeping them apart now means the eventual split into a `Submission`
collection moves nothing.

The two headline numbers are deliberately different: **current** is scored against what
has been attempted, **aggregate** against everything in the program. Early on the first
flatters and the second warns, which is the honest picture. An unattempted mark renders as
an em dash, never a zero — a zero reads as a failed attempt.

**"View graduation criteria" opens a dialog**
([GraduationCriteria](src/components/dashboard/marksheet/GraduationCriteria.tsx)) — trigger
and dialog in one client island, so the page itself stays a server component. The ticks
are **earned, not decorative**: each criterion is evaluated against the student's real
marks in `getMarksheet` (75% aggregate; every assignment and project marked; 50% across
mid- and end-term *scored against both papers in full*, since half of a paper you haven't
sat isn't half a pass). Unmet criteria show an empty circle and the footer counts what is
left, so the dialog answers "what do I still need?" rather than just listing rules.

It sits on a new [Modal](src/components/ui/Modal.tsx) primitive (design.md §5): centred at
`md+`, bottom sheet below, with the four things a dialog must do and is easy to forget —
scroll lock, focus trap, Escape to close, focus returned to the trigger. `EnquiryDialog`
predates it and still carries its own copy of that logic; worth migrating when that form
is next touched, but not worth destabilising the one flow that writes to the database
just for tidiness.

design.md §5 again: **on mobile each table becomes a card list**, never a horizontal
scroll. Both layouts render from the same rows, so there's no second source of truth about
what a row contains. The module sections are native `<details>`, first one open.

### Learning screen (`/learn/[program]/[course]/[module]`)

Where the student watches lectures and takes quizzes. Reached from a module row or **Go
to course** on the curriculum page, and from **Resume** on the overview. The three
segments are exactly the tree's top three levels; the open subtopic is `?s=`, kept in the
query string so one link changes exactly one thing.

Sidebar: a link back to course details, the course name, a **Module** dropdown of the
course's modules (each with its own %), that module's topics as accordions with their
subtopics inside, and — since 2026-09-12 — **the module's test** at the bottom.

The test was the one thing in a module the outline never mentioned. A student could
finish every lesson, watch the column go green and have no idea a paper was waiting; the
only route to it was `ItemRow`'s row on the course details screen, two taps away and not
where you are when you finish a lesson. It renders in both halves of the outline
(`LearnSidebar` and the phone's `LearnDrawer`) as a card that is never a link that fails:
locked shows `moduleTestLockReason` instead of a href, and once sat it shows the score
and offers a **retake** rather than going quiet — unlimited attempts, best score counts.

Layout is full-bleed (not `Container`) — it's a workspace. Sidebar 18rem, content pane
takes the rest; from `lg` the two scroll independently inside `h-[calc(100dvh-4rem)]`
(4rem = `DashboardHeader`), below `lg` they stack.

**The whole outline column is a server component.** The module dropdown and topic
accordions are native `<details>` with the open one decided server-side from the URL — so
they work without JavaScript and cost no hydration on the page whose real work is the
player. `QuizRunner` is the only client component on the route.

**The footer's Prev/Next mean different things in each pane**, so the bar doesn't decide:
`LearnFooterBar` renders the tools and takes the controls as children. A video passes
`<SubtopicSteps>` (links, move between subtopics); a quiz passes its own buttons (state,
move between *questions*) — inside a quiz, "previous" means the previous question, never
the previous video. That's also why `QuizRunner` renders its own scroll area and footer
rather than just the pane.

`QuizRunner` runs one question at a time: select → Submit → explanation → Next. The
rules, all deliberate: **Next is dead until the current question is submitted** (answer,
then move on — the disabled Next says why on hover); **Submit disappears once submitted**
and Next takes over as the live control; **Prev revisits earlier questions** with the
answer and explanation intact but still locked, because going back is for re-reading, not
for changing your mind after seeing the answer. Answers are held per question, so the
score survives walking backwards. The last question's Next reads "See result", and Prev
from the result returns to the last question. Keyed on the subtopic id so switching
quizzes starts a clean attempt.

The verdict after submitting is a plain bold line ("Correct" / "Incorrect") over the
explanation — no tinted card, no icon. The options themselves already carry the colour,
and a second coloured block competed with them. Only the *chosen* wrong option turns red;
reddening all three would read as three mistakes.

`VideoStage` signs and renders a real player now — Bunny's iframe, a native `<video>`
or a third-party embed, picked by what the lesson holds.

**Superseded below `lg`, and rewritten above it:** the stage is an `aspect-video` box at
every width, full-bleed on a phone and capped from the viewport height on desktop. The
paragraph that follows describes the arrangement this replaced; see "The lesson screen,
rebuilt for a phone" for what is there now and why the old rule broke.

**A video never scrolls the page.** The frame was a flex child with `min-h-0` that took
whatever height was left after the footer — *not* an `aspect-video` box, which computes a
height from the width and then pushes the footer off the bottom on short screens. The
shell is `lg:h-[calc(100dvh-4rem)]` (dvh, so mobile browser chrome doesn't cut it off),
and below `lg`, where the outline and the pane share one scrolling column, the footer is
`sticky bottom-0` so the controls stay reachable. `Subtopic.caption` stopped being a
grey transcript line under the player — the thing that was forcing a scroll — and is
rendered as the lesson's one-line description inside the phone's detail sheet instead.

Prev/Next in the footer step across the whole **course**, not just the open module —
that's what "next" means to someone working front to back.

**And past the end of it (2026-09-12).** Next used to go grey at the last subtopic of a
course, which is the one screen where a student most needs telling what is left: the
course is not finished when its videos are, it is finished when the module tests are sat,
the assignment is handed in and the final is passed — none of which the lesson screen
mentioned. A student who had watched everything saw a dead button and no reason for it,
with the assignment two screens away behind a ⋮ menu they had no reason to open.

`nextAfterLessons` (`lib/curriculum/next-step.ts`) resolves the tail of a course into a
real step, in the order the work is actually done:

    module tests still to be sat → assignments still to hand in →
    the final test, until it is passed → the first lesson of the next course

The order is not invented there — it is the list `finalTestLockReason` and
`nextCourseLockReason` already walk when they decide what is closed. This turns those
refusals into a *destination*. Anything the gate would block comes back with `href: null`
and the gate's own sentence as the note, so a step that cannot open still says what would
open it ("Finish the remaining 2 lessons in this module first").

`LearnStep` therefore carries a finished `href`, a `label`, a `title` and a `note` rather
than `{moduleId, subtopicId}` — at the end of a course the next thing is not a subtopic,
so the server resolves it and `SubtopicSteps` decides nothing. Next reads "Module test",
"Assignment", "Final test" or "Next course" instead of the bare "Next", and the note
prints beside it (its own row below `sm`). Ordinary lesson-to-lesson steps are unchanged:
no note, bare label, same hrefs as before. Only the last lesson of the last course with
nothing outstanding leaves Next inert, which is the honest answer there.

`moduleTestHref` was fixed in the same pass: it pointed at `/learn/…/test`, a route that
was never built. Nothing called it — `ItemRow` had assembled
`/dashboard/{slug}/tests/{course}?m={module}` by hand — so nothing was broken, and both
callers now share the one helper.

Not changed: **Prev at the *start* of a course still goes nowhere.** Crossing backwards
into the previous course would be symmetric and is probably right, but nothing is hidden
from the student there, so it stayed out of the fix. Same for a quiz subtopic, whose
footer belongs to `QuizRunner` — its Next moves between questions and goes dead on the
result screen, so a quiz at the end of a module is still a place you leave by the outline.

Seed depth is uneven on purpose: `pm-c1` and `pm-c4` have full module/topic/subtopic
trees; the other courses have one or two modules each. Verified: every course and module
resolves, unknown course/module/program 404s, and a stale `?s=` or `?c=` falls back.

### Handing work in

The student's half of an assignment, and **the first thing a student writes to
the database**. Everything else they touch is a read.

**It is a Submit button on the assignment row (2026-09-12)**
([AssignmentActions](src/components/dashboard/curriculum/AssignmentActions.tsx),
renamed from `AssignmentDialog`) — pressing it opens the brief as text, the brief
as a document, the current hand-in and its mark, and the form to hand in or
replace.

It used to live *behind the row's ⋮*, so the single most important act on the row
was the least visible thing on it: an unlabelled icon next to a status badge, on a
row whose siblings are modules you click to watch. The button says what it does —
**Submit** while nothing is handed in, **Replace** once there is, and **View** once
it has been marked, because "Replace" on a marked hand-in is an invitation to throw
the mark away (handing in again clears it) and that warning belongs next to the
control inside, not on the row.

The ⋮ keeps only what an overflow menu is for: **the brief document, and only when
the teacher attached one.** No brief file, no ⋮ — a menu whose single item is
absent should not be a menu. It opens a `Modal` rather than a popover because the
phone's course card clips its row list (`overflow-hidden`, so the divided rows keep
the card's rounded corners) and an absolutely-positioned menu inside a row is a menu
with its bottom sliced off; `Modal` is already a bottom sheet below `md`, which is
the right shape for a row's overflow on a phone anyway, and it brings the focus trap
and Escape with it. Both dialogs reuse `AttachmentLink` for the brief file instead
of the hand-rolled copy that was there.

Still a dialog rather than a screen because `/dashboard/[slug]/assignments/[key]`
still does not exist and this was not the moment to invent it: the curriculum page is
where a student meets the assignment, and reading a brief then attaching a file does
not want a navigation away and back. When that screen is built the content moves
there whole and the button becomes a link. Triggers and dialogs are one client
island, so the page stays a server component. Both are absent while the course is
locked, like everything else inside it.

**Two ways in, one field out.** `Submission.fileUrl` is where the work is,
however it got there, so everything that reads a hand-in reads one field.
`Submission.file` is set as well when it was uploaded, because that carries the
`publicId` the cleanup needs. Uploading is the path — the file is then ours and
its type is known — but the pasted link stays, behind a disclosure, for two real
reasons: **a ZIP is never uploaded to Cloudinary**, so an assignment accepting one
must accept a link, and a file over the size cap needs the same escape hatch. If
both are filled the upload wins; a link is a claim, an upload is evidence.

**"Only what the creator accepts" is enforced in three places, and they agree:**
the file picker offers only the kinds the assignment's `acceptedFormats` map to
(`SUBMISSION_FORMAT_KIND` in `lib/curriculum/submission-formats.ts` is the
bridge, with `zip → null` stating once that zips are not hosted); the link's
format select lists only those formats; and `submitAssignment` re-derives the
format from the uploaded file's kind and runs `validateSubmission` against the
list again. The middle one is a convenience, the last one is the rule.

[lib/actions/submissions.ts](src/lib/actions/submissions.ts) is the write, and
its order differs from the staff actions on purpose. There the house order is
requireRole → can() → assertScope; here actor and subject are the same person,
so it is **requireUser → the tree → validate → write → audit → revalidate**.
`getProgramCurriculum` *is* the scope check: it already answers "is this program
published, does this course exist, is it locked for this student, what does this
assignment accept" — the same questions the screen asked to decide what to
render. Re-deriving them from the models would be a second copy of the gate, and
two copies drift.

Three decisions worth keeping:

- **`requireUser`, then an explicit role check — not `requireRole("student")`,
  which admits an admin.** The superset rule is right for staff screens and
  wrong here: an admin has no coursework, and letting one post would drop a
  hand-in from a non-student into a teacher's grading queue.
- ~~A resubmission replaces in place and clears the mark~~ **Superseded
  2026-09-14:** a hand-in is final once submitted; only a teacher's resubmission
  request reopens it, and nothing is replaced or deleted. See "One hand-in,
  locked — resubmission on request".
- **`maxMarks` is copied at hand-in**, as the model already said, so a later
  change to the assignment cannot silently rescale a mark already given.

Verified against Atlas and Cloudinary by driving the real action with real
sessions: a student uploads a PDF where PDF is accepted and the row appears; a
PNG and a forged foreign-host file are both refused where only PDF is accepted;
a zip link is refused on a PDF-only assignment and accepted on a ZIP-only one; a
teacher posting the action is refused ("only a student can hand work in"); an
assignment inside a locked course is refused with the real lock reason and writes
nothing; a resubmission replaces the file, clears an existing 78/100 and its
feedback, and the superseded asset is gone from Cloudinary while the new one
stays. Both ⋮ menus render on the student's course panel. Test data and every
asset were removed afterwards.

**Still not clicked through in a browser.** The dialog, the upload field's
drag-and-drop and progress, and the disclosure were exercised through the action
and the rendered HTML, not by hand.

### Grading, at last (2026-09-12)

The teacher's half of the loop above, and the one feature in the app that had
been **built at both ends and never joined in the middle**. Everything around
the write already existed:

- `Submission` carried `scored`, `feedback`, `evaluatedBy` and `evaluatedAt`,
  plus the index `{ courseId, status, submittedAt }` commented "the teacher's
  grading queue: unmarked work on my courses".
- The teacher role already held the `submission.grade` capability.
- `validateGrade` sat complete and unimported in `validation/curriculum.ts`.
- `nav.ts` pointed at `/teacher/grading` with `soon: true`.
- The overview's "Awaiting grading" tile read an em dash, hinting "grading lands
  with submissions".
- `AssignmentForm` told the teacher "hand-ins are marked from the course's
  submissions screen."

None of it was ever written to. `evaluatedBy` and `evaluatedAt` appeared exactly
twice in the whole codebase, both in `submitAssignment`, both set to `null`.

**Why that was worse than a missing feature.** Every hand-in read "Awaiting
marking" forever, which is cosmetic — but `courseMaximum` counts an assignment's
marks in the **aggregate denominator** whether or not it has been marked, while
`assignmentMark` contributes to the numerator only once `scored` is a number
(both in `marksheet-db.ts`, both deliberately). So an unmarked hand-in sat at
0/`maxMarks` in the programme aggregate permanently, and with
`MIN_AGGREGATE_PERCENT = 75`, a programme carrying real assignment weight was
**impossible to graduate from**. The other trap: `ASSIGNMENT_GATE_REQUIRES_MARK`
is `false` and its own comment invites flipping it — which would have made the
programme impassable, because nothing could mark a submission.

**What landed.** `data/grading.ts` (the reads), `actions/grading.ts` (the write),
`/teacher/grading` (the queue), `staff/grading/GradeForm.tsx` (the only client
piece), `submission.grade` in `audit-actions.ts`, `GradeFormState`, the `soon`
off the nav row, and the overview tile turned into a real query with a link.

**Scope is a cohort, not a program** — the same rule `students.ts` follows, now
applied at the submission itself rather than inherited from whatever screen
reached it. Two narrowings: `ownsProgram` picks the programs, `batchScopeFor`
picks the cohorts inside one, and the read applies both **in the query** so a bug
shows a teacher too little rather than somebody else's students. The write
re-derives the same answer with `ownsBatch` against the student's *enrolment* —
`assertScope` alone is not enough, because it stops at the program and a teacher
holding the evening cohort must not mark the morning cohort's work by posting its
submission id. `ownsBatch` rather than `assertScope({ batch })` for the reason
guards.ts spells out: a student on **no** cohort belongs to nobody, so only a
program-wide holder sees them — the opposite default from a session with no
batch.

Marking uses the `maxMarks` **frozen onto the submission**, never the
assignment's current one: marking out of a number the student was never shown is
how a mark stops meaning what the marksheet prints.

The queue sorts unmarked first, oldest first inside that — it is a queue.
`?show=all` includes marked work so a mark can be corrected; it sorts after.
One `useActionState` island per row rather than one form for the page, so Save
means "this hand-in" and not "everything I have typed". Re-marking replaces the
mark the student can already see, and the audit entry carries `previousScored`,
because "it changed" is useless without the before.

Four paths are revalidated: the queue, the teacher overview (the tile), and the
student's `course_details` and `marksheet` — a mark the teacher gave that the
student cannot see is the bug the feature exists to fix.

**Verified against Atlas, read side, by driving `gradingQueue` /
`pendingGradingCount` with each real staff user.** Two seeded hand-ins on
`qa-performance-marketing`: Aarav Menon in "QA Evening Cohort", Ishita Bose on no
cohort. Rohit (evening cohort only) sees **1** and is refused Ishita's; Sneha
(whole program) sees **2**; both admins see **2**; Vikram (no assignments) sees
**0**. `ownsBatch` returns the identical allow/refuse matrix the write guards
with — checked row by row against both submissions.

**The write itself has not been executed.** `markSubmission` reads a session
through `requireRole`, so it cannot be driven from a CLI script, and nothing was
written to the shared cluster. It typechecks, lints and builds; it has not marked
a real hand-in. That is the first thing to click through.

### One hand-in, locked — resubmission on request (2026-09-14)

A student used to be able to replace a hand-in at will (and so wipe its mark).
Now: **submit once → locked → teacher grades, or requests a resubmission →
only then may the student hand in again.** The vocabulary and the one rule live
in [lib/curriculum/submission-status.ts](src/lib/curriculum/submission-status.ts)
(`SUBMISSION_STATUSES`, `canHandIn`, `submissionStatusLabel`, `HAND_IN_LOCKED`).

**Data model — additive, one row still.** `Submission.status` gains
`resubmission_requested`; new `version` (1, +1 per resubmission), `resubmission`
(`{reason, requestedBy, requestedAt}` while open) and `history[]` (each
sent-back version: file, note, dates, **its mark and feedback if it had one**,
the reason). The top-level fields stay "the current version", so every existing
reader works unchanged. Pre-existing rows have no `version`/`history`; readers
use `?? 1` / `?? []` because `lean()` applies no defaults. No migration needed.

**The lock is the writes, not a read.** `submitAssignment`: a first hand-in is
`$setOnInsert` upsert (never overwrites; a racing duplicate hits the unique
index → refused); otherwise an update filtered on
`status: "resubmission_requested"` that also moves it out of that status — so a
request is good for exactly one hand-in. Superseded Cloudinary files are **no
longer deleted** (history points at them), and a refused post's upload is not
deleted either (the posted JSON can't be trusted to name an orphan).

**Teacher.** `requestResubmission` in `actions/grading.ts` shares
`loadInScope` (capability + `ownsBatch`) with `markSubmission`. It snapshots the
current version into `history`, clears the top-level mark (so the marksheet
shows a dash until the redo is marked), and is conditional on `updatedAt` so a
concurrent re-mark is not lost. `markSubmission` refuses a sent-back hand-in.
Audit verbs: `submission.resubmit`, `submission.requestResubmission`. The queue
card shows version, "Resubmitted · awaiting marking", `SubmissionHistory`, and a
"Request resubmission" panel with an optional reason; a sent-back card shows the
request instead of the grade form.

**Gates deliberately unchanged.** `resubmission-requested` (the view `Status`)
counts as done in `DONE` / `isFinished`: handing in is what opens the next
course, and a redo request must not re-lock a course or term paper the student
already moved into. The row badge ("Redo requested", warning tone + icon) and
the primary **Resubmit** button carry the urgency instead.

**Student dialog (`AssignmentActions`).** Leads with the state: graded → large
score, `/max`, percent, "Your score", then a Teacher feedback card
(`whitespace-pre-line`, or "No feedback provided."); sent back → warning panel
with the reason quoted and the previous mark/feedback; submitted → locked
notice. The form only exists while `canHandIn`. **Submit never hands in by
itself**: it opens `ConfirmDialog` (which gained `details` and `pendingLabel`),
and only Confirm dispatches; an in-flight ref stops a same-frame double click;
a thrown action returns a sentence instead of hitting an error boundary. An
empty form skips the confirmation and goes to the server for field errors.

**`Modal` can nest now.** A Modal inside a Modal portals to `<body>` (a `fixed`
child of the animated panel would position against it) and only the top of a
module-level stack answers Escape/Tab. Top-level modals are *not* portaled —
several sit inside the `<form>` whose fields they carry.

**Verified end to end** by `qa/check-resubmission.mjs` (11/11) against a fresh
`next start` build, as qa.student1 and qa.teacher.a, on a throwaway assignment
it creates and removes (with its submissions and audit rows): confirmation
writes nothing and Escape closes only it; a double-clicked Confirm sends one
request and writes one row; refresh stays locked; five concurrent replays of
the student's captured action with a changed file are refused; grade → score
and feedback render above the brief; request → v1 and its 60/100 in history,
mark cleared; replayed mark on a sent-back row refused; the teacher's request
replayed with a student session changes nothing; v2 lands once and its replay is
refused; v2 graded 85 and sent back again (two-entry history); legacy rows
render. `WORK-06` in phase12 now asserts the lock.

**Gotcha — restart `next dev` after changing a Mongoose schema.**
`models.X ?? model(...)` survives HMR, so a long-running dev server keeps the
old schema and strict mode silently drops new fields from updates. The first
run of the check against a stale dev server wrote rows with no `version` or
`history`.

Not built: withdrawing a resubmission request, and a due date for the redo.

### Mid-term and end-term assessments

The programme's two examinations, and the first thing in the app a student is
**marked** on rather than assessed by.

**A term paper hangs off a checkpoint course.** A checkpoint was already a
`Course` with `number: null`, sitting between the numbered courses and gated by
finishing everything before it — so the paper is that course's paper
(`Assessment.scope: "term_test"`, `courseId` pointing at the checkpoint) and
`term` says which of the two it is. Nothing new in the tree; a fourth level for
two documents would have been a level everything else had to learn about. One
mid and one end per program, enforced by a partial unique index on
`(programId, term)` rather than hoped for.

How the three papers now differ, all in data:

| | Module test | Final test | Term paper |
|---|---|---|---|
| `scope` | `module_test` | `final_test` | `term_test` |
| counts toward merit | no | yes | yes |
| proctored | no | yes | yes |
| attempts | many | 3, best counts | **1** |
| marks/question | 5 | 5 | **20** |

**One attempt, deliberately.** A course final test is a gate, so failing it must
not end a programme — three goes, best counts. The term papers are what the
aggregate and the combined 50% rule are measured from, and a paper you can
re-sit until it goes well measures nothing.

**Where they are in the UI.** The program screen carries a **Term exams**
section ([TermExams.tsx](src/components/staff/curriculum/TermExams.tsx)) listing
the program's checkpoints, each linking to its paper or, when it has none,
saying so — a checkpoint with no paper is a page students reach and find empty,
so the row reads as the job it is rather than as a blank. **Add a term exam**
goes to the course form with `?checkpoint=1`, which replaces the number field
with a line explaining what is being made. Before that section existed the only
route to a term exam was "Add a course" plus knowing to leave the number blank,
which is a trap rather than a door — the feature may as well not have existed
for anyone who had not read `Course.number`. The button disappears at two
checkpoints, because that is all the unique index will accept.

Checkpoints still appear in the course list as well: that is where their order
lives, and reordering is done there.

Authored at `/{admin,teacher}/programs/[program]/courses/[checkpoint]/tests/term`
— its own route rather than reusing `tests/final`, because a URL saying "final"
for a mid-term is the kind of small lie that misleads the next person reading
the address bar. `term` (mid or end) is the one structural thing the author
chooses: a checkpoint course cannot say which of the two it holds, and deriving
it from position would be a guess. Everything else about the paper still comes
from *where* it was created, never from a checkbox.

### Four kinds of question

`single`, `multi` (pick all that apply), `boolean` (true/false) and `matching`.
[lib/curriculum/question-kinds.ts](src/lib/curriculum/question-kinds.ts) is the
one definition of what a question is and what "correct" means — the model, the
validator, the builder, the runner and the grader all read it, and `gradeAnswer`
exists exactly once. A second copy is how a paper starts marking differently
from the way it was written.

There is deliberately **no short-answer type**: everything here has to grade
itself the instant a student submits, and exact-match marking turns a right
answer with a typo into a wrong one.

**Marking is all-or-nothing, including multi-select and matching.** Partial
credit needs a scheme (per option? penalising wrong ticks?) that the author
never chose and the student is never told, so the mark becomes unexplainable. A
teacher who wants finer resolution asks two questions.

Two details that are security, not presentation:

- **A matching pair has two ids.** `id` names the left item, `rightId` its
  match, and the runner receives the right-hand list keyed by `rightId`. If they
  shared an id the answer would be readable straight off the payload, and
  shuffling would not save it.
- **The shuffle is frozen into the attempt** (`choiceOrder`), not done per
  render — otherwise the choices rearrange themselves under a student every time
  the page re-renders.

`QuizRunner`, the practice-quiz player on the learning screen, still draws only
single-choice, so the subtopic form passes `allow={["single"]}` to the builder.
Offering an author a question its player cannot render would be a broken lesson.
Teaching `QuizRunner` the other three is the obvious next job.

### Sitting a paper

`/dashboard/[program]/tests/[course]` — the dead link from the course panel is a
screen now, serving both a course final test and a checkpoint's term paper,
because to a student they are the same act.

A cover page first: how long, how many marks, how many attempts are left, and
what happens if you switch away — *before* the button, because once it is
pressed the clock is the server's and there is no pausing it. Then the runner:
one question at a time with a navigator grid, since on a phone a fifty-question
scroll makes "have I answered everything?" unanswerable.

**The client is assumed hostile**, and the four guarantees the `Attempt` model
promised are now real code in
[lib/actions/attempts.ts](src/lib/actions/attempts.ts) and
[lib/data/attempt.ts](src/lib/data/attempt.ts):

1. `deadlineAt` is set from the **server** clock at start. The countdown in the
   runner is display only — running it out submits nothing on its own.
2. `violationCount` is incremented server-side. The client reports *events*; it
   never reports a total and can never decrement one. The 11th ends the paper.
3. **Answers are written one at a time, as they are given.** The end may never
   arrive — a flat battery, a dead connection — and the server marks whatever it
   has stored, so an answer given is an answer counted.
4. Grading reads the frozen `snapshot` and nothing else. There is no code path
   that reads a score out of a request, and `toRunnerQuestions` is the single
   audited place that strips the answers before a paper reaches a browser.

`marksPerQuestion` is now frozen into the attempt alongside the questions, for
the same reason they are: a teacher changing 20 marks a question to 5 mid-sitting
must not change what somebody's paper is out of.

**There is no cron job.** An overdue attempt is finalised by whatever next reads
it — the student reopening it, the marksheet totting up — which is the lazy
sweep the model describes. `finaliseAttempt` guards on `status: "in-progress"`,
so two tabs racing produce one result, and a double submit cannot re-grade.

Then **"Calculating your final marks"**: a real screen, held for a minimum of
1.8 seconds even though marking a 50-question paper takes milliseconds. A result
that flashed past would leave a student wondering whether anything was checked.
The result shows the score and right-or-wrong per question and **never the right
answer** — a term paper is sat once and its questions are reused for the next
cohort, so handing back a full answer key would publish the paper. A practice
quiz does show the explanation; that is the difference between practice and an
examination.

Matching is answered with **a select per row, not drag-and-drop**: this is an
examination, and the interaction must never be the thing that costs someone a
mark. Drag-and-drop does not work from a keyboard and is miserable on a phone.

### The marksheet, from the database

[data/marksheet-db.ts](src/lib/data/marksheet-db.ts) replaces the static
`data/marksheet.ts`. It **runs no queries of its own**: it takes the same
`ProgramCurriculum` the curriculum page renders — which already has this
student's best attempt at every paper and their submission for every assignment
joined in — and turns it into rows and totals. A marksheet with its own queries
would eventually disagree with the curriculum page about the same mark, and the
student would have no way to tell which screen was lying.

What changed beyond the source of the numbers:

- **The project column is gone.** There is no `Project` model; the old sheet
  carried a seeded percentage for one. A column of em dashes forever is worse
  than a column that isn't there — the same call the curriculum page's project
  card got.
- **A maximum is what a paper is out of, not what was scored**, so an unsat
  final test still contributes to the aggregate maximum. `current` counts only
  what has been attempted; `aggregate` counts everything. Early on the first
  flatters and the second warns, which is the honest picture.
- **A mark comes off the attempt, not the live paper.** `maxScore` was frozen at
  the sitting, so a question added since cannot retroactively change what
  somebody was marked against.
- **Only marked hand-ins are pooled.** A submitted-but-unmarked assignment is
  not a zero and not full marks; it is a mark that does not exist yet.
- **"Mandatory work submitted" means handed in, not marked** — the same rule the
  course gate uses, so an unresponsive teacher cannot hold a cohort short of
  graduating.
- The combined mid/end-term criterion is still scored **against both papers in
  full**, not just the one that has been sat.

`data/marksheet.ts` and `data/curriculum.ts` both survive as **inputs to
`scripts/migrate-curriculum.ts` only** and carry headers saying so. Nothing in
the app reads either. Do not add a caller.

Verified on the staff side too: the Term exams section lists both seeded
checkpoints and links each to its builder; a program with none shows the empty
state and "Add the mid-term"; `?checkpoint=1` renders "New term exam" with the
number field replaced and a `-t1` key suggestion, while the plain course form
still has its number field; and posting that form really does create a course
with `number: null`, which then appears in the section marked "No paper" and
links to the builder.

Verified end to end against Atlas with a real student session, on a four-kind
paper (single, multi, true/false, matching): the payload handed to the browser
carries no `correctOptionId`, no explanation and no pair mapping, and the
matching choices come back shuffled under ids unrelated to the left-hand items;
all four kinds save; a made-up option id is dropped, two options on a
single-choice question keep one, and a question not on the paper is refused;
three-right-of-four scores 60/80 = 75%; re-submitting does not re-grade; a
second attempt at a one-attempt paper is refused; answering after the deadline
stores nothing and the next read finalises the attempt as `auto-submitted`
(reason `deadline`); the 11th warning ends the paper (reason `violations`); a
locked checkpoint refuses `startAttempt` **and** its cover page shows the lock
reason instead of a dead button; the builder offers all four kinds and the term
select; a numbered course still shows "Final test" while a checkpoint shows
"Term paper"; and the marksheet renders the real mid-term row with no project
column. Every test paper, attempt and temporary course was removed afterwards.

**Not clicked through in a browser.** The runner's timer, the proctor listeners,
the navigator and the "calculating" screen were exercised through the actions
and the rendered HTML, not by hand.

### Enrolment, at last

`Enrollment` — one student, one program — is the row that makes "the students of
this program" a question the database can answer. Until it existed
`rosterFor()` returned every active student whatever program it was asked about
(it took the slug and did nothing with it), `ENROLLMENTS` in `data/dashboard.ts`
was a hard-coded pair every student saw, and every "scoped" screen was scoped to
nothing. The students screens below could not be built honestly without it.

**Its own collection, unlike staff assignments.** A staff member's
`assignments` are embedded on the `User`: a handful, always read with the user,
only written by an admin. Enrolments are the opposite on all three counts — a
program has hundreds, the common read is "everyone in this program", and they
carry their own history — so they are rows, indexed both ways, unique on
`(studentId, programId)`.

**Withdrawn, never deleted**, the same rule as users and sessions. Deleting
orphans the student's progress, attempts and submissions and erases the fact
that they were ever here, which is the one thing a fee dispute turns on. The
asymmetry is deliberate: a withdrawn student stops seeing the program on their
dashboard, and staff keep seeing the row marked withdrawn — which is also how
somebody notices a mistake. Re-enrolling **reactivates the same row**, so their
old work is still theirs when they come back.

`npm run seed:enrollments` migrates the old static array into real rows: every
student account onto the programs `ENROLLMENTS` named, which is precisely what
the app used to pretend was true. Idempotent, and it never reactivates somebody
who has been withdrawn.

Two things changed as a consequence:

- **`rosterFor()` is program-scoped**, so an attendance sheet stops listing
  people who are not in the room.
- **The dashboard reads real enrolments** ([data/enrolled.ts](src/lib/data/enrolled.ts)),
  so staff and student can no longer disagree about who is on what. Its own
  module rather than a function in `data/dashboard.ts`, because that file is
  reachable from a client component and one `server-only` import in the chain
  breaks the browser bundle — the pure helpers stayed there.

Every number on a dashboard card is still **derived from the tree**, never
stored on the enrolment: the row records that somebody is on a program and
nothing about how they are doing, so it cannot contradict the screens that
count. `ENROLLMENTS` itself survives as seed data for the migration scripts and
for `data/course-overview.ts`, whose metrics are still placeholders, and carries
a header saying not to add a caller.

### Batches (`/manager/batches`)

A **batch** is a named cohort inside one program, with a seat count.
`Enrollment.batch` used to be free text, deliberately — the model's own comment
argued a label nothing queried did not deserve a collection. Two things changed
that. Staff now *pick* a cohort instead of retyping it (free text meant
"Aug 2026 · Evening" and "Aug 2026 - evening" were different cohorts and nobody
could tell), and a cohort now has a **capacity**, which is a fact about the
group with nowhere to live on a string.

**The name is still the join, not an id.** [Batch](src/models/Batch.ts) is the
source of truth for what may be picked and how many fit; `Enrollment.batch`
keeps holding the *name*, so every existing row and every screen that renders it
works untouched. Renaming cascades to the enrolments in the same action
(`renameEnrollments` in [actions.ts](src/app/manager/batches/actions.ts)), which
is what stops the two drifting. Unique on `(programSlug, name)`.

**Occupancy is derived, never stored** — the same rule as attendance in
`data/sessions.ts`. How full a batch is, is a count of active enrolments naming
it ([data/batches.ts](src/lib/data/batches.ts)), one aggregation for the whole
screen rather than a count per card. A stored counter would drift the first time
somebody was withdrawn, and then two screens would disagree about whether a
cohort was full — the one question this feature exists to answer.

**Closed, not deleted.** A batch nobody should join again is `closed`: it leaves
the picker and stays on every enrolment naming it.

The fullness indicator is one component,
[BatchFill.tsx](src/components/staff/batches/BatchFill.tsx), with three states
rather than a gradient, because there are exactly three decisions: enrol into
it, enrol knowing it is nearly gone, or pick another. design.md §5 again — the
bar is always paired with the seat count, never shown alone. `batchOptionLabel`
is the same indicator as text, because an `<option>` can hold nothing else.

**Who may.** New capabilities `batch.view` and `batch.manage`, held by the
program manager and (as always) the admin. A teacher holds neither: they see the
batch label on a student row, but how many seats are left is not their call. One
screen serves both areas — the admin nav links to `/manager/batches`, exactly as
it does for sessions, rather than a second copy under `/admin` for a scope check
to drift in.

**Enrolling picks from the list.** The batch field on the students screen is a
`<select>` carrying each cohort's occupancy, with full ones disabled — and
`enrollStudent` re-reads the occupancy immediately before it writes and refuses
a full or closed batch, so the dropdown is the convenience and the action is the
control. It is still a check-then-write: two simultaneous enrolments into the
last seat can both pass, the window is milliseconds, and the consequence is one
student over — visible on the batch card and fixable. A unique index cannot
express "at most N".

`npm run seed:batches` backfills a `Batch` for every label already in use.
Dry run by default; the capacities it invents are guesses that staff are meant
to correct, and the printed list is what to go and check.

**The batch owns the end date, not the program (2026-09-01).** `Program.deadline`
exists and is editable, but it is one date for everybody on the program, so for any
given student it is usually wrong — two cohorts of one program finish on different
days. Every student-facing end date is read from *their* batch's `endsOn`:
`studentBatchDeadline` for one program, `batchDeadlines` for several at once (the
dashboard, which already holds the enrolments and should not pay three queries a
card). The dashboard card used to print `Program.deadline` while the course overview
one click away printed the cohort's — the same student, two different end dates.
Null when they have no batch, or it has a label with no `Batch` row, or that row has
no end date: the date line is dropped rather than invented, so a student in an
un-backfilled cohort now sees no date where they used to see a wrong one. That is
what `seed:batches` is for.

### Students (`/{admin,manager,teacher}/students`)

Three levels — programs → students → one student — written once in
[components/staff/students/screens.tsx](src/components/staff/students/screens.tsx)
and rendered by all three areas, the same way the curriculum screens are shared.
Nine route files, each a guard plus one component.

**The scope check lives in the loaders, not the pages**
([data/students.ts](src/lib/data/students.ts)). Every one of them calls
`assertScope`, so a manager or teacher sees exactly the programs on their own
assignments and a forged URL is a 404 — whether or not whoever adds the tenth
route remembers. An admin is admitted everywhere by the same call, the superset
rule again.

| Actor | Sees | May enrol |
|---|---|---|
| Admin | every program | yes |
| Program manager | their assigned programs | yes — `enrollment.create` was already theirs |
| Teacher | their assigned programs | **no** — read-only |

A teacher marks work and authors content; who is in the cohort is not their
decision. The controls are absent for them *and* the actions refuse them, so
neither half is load-bearing on its own.

**Cheap list, rich detail.** The roster's numbers are six aggregations
regardless of cohort size — a cohort of two hundred would otherwise mean two
hundred `getProgramCurriculum` calls to draw one table. So the list carries what
a group query can answer honestly (progress, assignments in, attendance, last
active) and deliberately **carries no mark**, because a real mark needs the
marksheet's maxima and the marksheet needs the tree. The individual screen loads
the tree once and shows the real thing — literally `getMarksheet`, the same
function behind the student's own marksheet, so staff and student cannot be
reading two different sets of numbers.

Decisions worth keeping:

- **Attendance counts marked rows only**, never scheduled sessions — the same
  rule the student's own attendance band uses. A staff screen quietly using a
  stricter definition would show a manager a worse number than the student sees
  over the same sessions. Nothing marked yet prints an em dash, never 0%.
- **"Last active" is the max of three collections** — progress, attempts,
  submissions. Reading progress alone would call a student inactive the week
  they sat their mid-term.
- **100% means published material only.** Counting drafts would make a
  student's percentage fall when a teacher starts writing.
- **A suspended account and a withdrawn enrolment are two different facts**, and
  the roster shows them as two different chips. A suspended student is still on
  the program; they just cannot sign in.
- The individual screen shows every published assignment with the student's
  hand-in — the uploaded filename where there is one, the bare link where they
  pasted one — plus its mark and feedback, which is the "assignments submitted
  by them" the screen exists for.

Verified against Atlas with real sessions for an admin, a program manager, an
assigned teacher, an unassigned teacher and a student: at level one each role
sees exactly their own programs and the unassigned teacher sees the empty state;
at levels two and three a teacher reaches his own program and 404s on one that
is not his, as does an unassigned teacher and a made-up slug; the enrol controls
render for admin and manager and not for a teacher, and the actions refuse a
teacher, refuse a manager on a program they do not run, refuse a non-student
account, refuse a duplicate, and accept a manager on their own program;
withdrawing keeps the row (`status: "withdrawn"`) and re-enrolling reactivates
that same row rather than adding a second; a withdrawn program disappears from
the student's dashboard while staff still see it; `rosterFor` now returns nobody
for a program with no enrolments where it used to return everybody; the Students
link appears in all three navs; and a student gets bounced from all three areas.

**Not clicked through in a browser** — as with everything since the uploads
work, this was verified through the loaders, the actions and the rendered HTML.

### Tasks (`/{admin,teacher}/tasks`, `/dashboard/[program]/tasks`)

Work a teacher or an admin sets that **nobody marks** — read this brief before
Thursday, set your Meta Business Suite up, fix the tracking on your landing
page. A title, a description, one handed-out document and any number of
resource links. Set for **everyone on a program**, or for **one student**.

**A `Task` is deliberately not an `Assignment`.** An assignment is a graded
artefact inside the curriculum tree: it hangs off a course, has a maximum mark,
a hand-in, a `Submission` row, and handing every one of them in is half of what
unlocks the next course. A task is none of that. Folding the two together would
have meant an assignment with a null mark, a null course and a null hand-in —
three nullable fields whose combinations every graded read would have to check.
So it is its own collection with its own screens.

**A program task is one row, not one row per student.** Who receives it is
derived from the live `Enrollment` rows at read time — the same rule attendance
percentages and batch occupancy follow. Fanning it out at write time would
freeze the cohort at the moment somebody pressed a button: a student enrolled
tomorrow would silently miss it, and a withdrawn one would keep it. The student
read is one query, `{ programId, $or: [{audience:"program"}, {studentId: me}] }`.

A task always names a program even when it is for one person: that is what
`assertScope` checks against, and a record belonging to nothing is a record no
scope check can be written for.

Decisions worth keeping:

- **The program manager cannot.** New capability `task.assign`, held by the
  teacher and (as always) the admin. Telling students what to do is teaching; a
  manager owns the cohort and the timetable, not the work. The nav item, the
  page's own capability check and both actions enforce it independently, so no
  one of them is load-bearing.
- **No draft state, unlike the curriculum.** A subtopic is written over several
  sittings so it starts unpublished; a task is written in one go and is closer
  to a `LiveSession`. Created is live, and the way to unsay one is to delete it.
- **Deleted, not archived** — the one place this codebase's "never delete" rule
  does not apply, because nothing points at a task and nothing is derived from
  one. There is no history to keep, and a task set by mistake should not sit on
  a student's screen with a line through it. Its document is destroyed in
  Cloudinary *after* the row is gone, the same order `saveSubtopic` uses.
- **A description or a document, not necessarily both** — the same call
  `Assignment` makes about `brief` / `briefFile`. A teacher whose task *is* the
  attached PDF should not have to retype it, and a rule demanding both is one
  people satisfy by typing "see attached".
- **Links are http(s) only, and every link needs a label**, both enforced in
  `lib/validation/task.ts`, which the composer and the action share. The scheme
  check is the security-shaped one: a stored `javascript:` URL rendered into an
  `href` on a page students open is the whole of that bug, and refusing it at
  the write means no renderer has to remember to. Everything rendered carries
  `rel="noopener noreferrer"`.
- **The recipient is re-checked against `Enrollment`.** Without it `studentId`
  is a free field and a forged post could aim a task at somebody on another
  teacher's program — which would then appear on a dashboard the author has no
  scope over. The picker is the convenience; the action is the control.
- Uploads got a **`tasks` scope** of their own (`LMS/{pdfs,documents,images}/tasks`,
  admin and teacher) rather than reusing `curriculum` — a task is not part of
  the tree, and the folder is where that becomes visible in the account.

**Where they appear.** Staff: one `TasksScreen` rendered by both `/admin/tasks`
and `/teacher/tasks`, the students-screens pattern again — two route files that
are a guard plus the component. Student: a **Tasks card on the program
overview** (main column, beside the work rather than beside the schedule)
showing the newest three and linking to the full screen, which splits them into
**"For you"** and **"For your program"**, in that order — a task addressed to
one person is usually a correction or a catch-up, and burying it under six
cohort-wide notices is how it gets missed. The document and links render through
one shared `TaskAttachments`, so a teacher checking how a brief looks is
checking what the student actually gets. The description is `whitespace-pre-line`,
not markdown, for the reason the reading subtopic gives.

The teacher's mobile tab bar took Tasks in **Grading's** slot (five primary
items is the cap). Grading was a disabled "Soon" row at the time and a real
screen beats a placeholder for the last tab; Grading is built now (see below)
but stays out of the tab bar for the same reason — the cap has not moved. It is
in the sidebar, and the overview's "Awaiting grading" tile links to it.

Verified against Atlas by replaying the real no-JS form posts as
`rohit.teacher@` and `priya.manager@`, and by driving the loaders directly: the
teacher and admin screens render and a manager posting either action is bounced
to `/manager` with nothing written; a student and an anonymous request are both
redirected; an unassigned teacher gets the empty state rather than another
program's cohort; a cohort task and an individual one are created, appear on the
staff list, on the student's overview card and on their tasks screen (the
individual one under "For you"), and are invisible to a second student on the
same program; a missing title, a `javascript:` link, a nine-link payload and a
document URL forged onto a non-Cloudinary host are each refused and write
nothing; a program outside the teacher's assignments 404s at `assertScope`; a
teacher's own id posted as the recipient is refused as not enrolled; withdrawing
a student removes the program from their read **and** removes them from the
composer's picker; both tasks are then deleted through the real delete form,
audited, and the database is left with no `Task` rows.

**Not clicked through in a browser** — as with everything since the uploads
work, the composer's audience toggle, the link repeater and the upload field
were exercised through the actions and the rendered HTML, not by hand. **Nothing
uploads a real document yet in that test**: the `FileUpload` path is the same one
the assignment brief already uses, but a task with a real Cloudinary file has not
been round-tripped.

#### Hand-ins, completion and individual screens (later pass)

A task is no longer one-way. Three things were added on top of the above.

**What comes back.** `Task.submission` is `{ kinds, note }`, where `kinds` is any
of **document / image / link** and **empty means nothing is expected** — one
field answering both "is anything expected" and "what", rather than a boolean
that can disagree with a list. The vocabulary is its own
(`lib/tasks/submission-kinds.ts`), deliberately not the curriculum's
`SUBMISSION_FORMATS`: that list carries `zip`, maps onto a marked `Submission`
and is what the marksheet reads, so reusing it would have tied a task's shape to
the graded rules. `submission.note` is stored apart from `description` because
it renders **directly above the student's hand-in field** — the instruction read
at the moment of submitting, not when the task is opened. A note with no kinds
is refused rather than stored: it would be advice no screen can ever show.

**The hand-in itself** is a new `TaskSubmission` collection (not `Submission`,
for the same reason `Task` is not `Assignment` — nothing is marked and nothing
unlocks), one row per student per task, upserted against a unique index. `url`
is where the work is whichever way it arrived; `file` carries the `publicId` and
a replaced upload is destroyed **after** the new row is written. Deleting a task
now deletes its hand-ins and their assets too — rows nothing can reach would
otherwise leave student uploads nobody can clean up. The student action lives in
`actions/task-submissions.ts`, and **`getStudentTask` is its scope check**, the
same way the curriculum tree is `submitAssignment`'s.

**Completion is a decision, not a count.** `completedAt` is set by a staff
button (`setTaskComplete`, reopen through the same action). Deriving it from
hand-ins would make a task unfinishable as soon as one student goes quiet, and
would leave a task that asks for nothing permanently incomplete. The card's "7
of 12 handed in" informs that judgement rather than replacing it — counted
against the **live** enrolment, like everything else about a program task. A
completed task stays on the student's screen, marked closed: hiding it would let
work nobody did quietly vanish.

**Screens.** `TasksScreen` became a client island for its **filters** (program,
student, and a "show completed" toggle that is off by default — the open tasks
are the ones with something to do about them); the student filter includes
cohort tasks that reach them, because those are theirs too. The composer is
**closed behind a "Create a task" button**, so the list is what the screen opens
on, and closing it on success **is** the form reset. Cards on both sides are
links to individual task screens — `/{admin,teacher}/tasks/[task]`, where the
hand-ins, the outstanding names and the complete/delete controls are, and
`/dashboard/[program]/tasks/[task]`, which is the only place a student submits.
Attachments render *outside* the card link on both, since an anchor inside an
anchor is invalid HTML.

**Status, on the student's side.** One `TaskStatusPill` — a green check and
"Done", or a timer and "Pending" — on the overview card, the tasks list and the
task's own header, so the answer never changes shape between screens. It decides
what "done" means rather than each caller doing so: a task wanting a hand-in is
done when **this student** submits (never the task's `completedAt`, which is
staff closing it for everyone and would tell a student who submitted nothing
they were finished), and a task wanting nothing has only `completedAt` to go on.
The tasks page leads with a "2 pending / All done" line, and its cards became a
**summary grid** (`sm:grid-cols-2 xl:grid-cols-3`) rather than full-width rows
carrying the whole description and every link — one card was a hundred-character
line of text, and making it a summary also made the whole card a single link,
which the attachment anchors had prevented. Overview rows link straight to their
task too.

Verified: `tsc`, eslint and a production build are clean, and all four new routes
render in dev. **Not driven end to end against Atlas** — unlike the first pass,
no real hand-in has been round-tripped through the form.

**Still out of scope:** a **due date**, and with it any notion of overdue. There
is also no notification when a hand-in arrives, and no per-student read receipt.

### Roles and access

Four actors, one product. The route prefix decides the area; the shell is shared; the nav
is derived from capabilities rather than hand-listed per role.

| Actor | Prefix | Owns | Scope |
|---|---|---|---|
| Admin | `/admin` | The institution | Everything, globally |
| Program manager | `/manager` | The cohort and the timetable | Their assigned **programs** |
| Teacher | `/teacher` | Content and marks | Their assigned **batches** (content is program-wide) |
| Student | `/dashboard`, `/learn` | Their own learning | Their own enrolments |

**Admin is a superset, not a fourth silo.** `requireRole` always admits an admin, so they
get the manager and teacher screens themselves — with a program picker where a scoped user
sees "assigned to me" — rather than duplicated admin-only copies of every screen.

The capability list lives in
[src/lib/auth/permissions.ts](src/lib/auth/permissions.ts). Admin is deliberately *not*
listed there (`can()` grants it everything), so a new capability can't be forgotten for
admin. Current grants:

- **Program manager** — `session.*` (schedule, update, cancel, assignTeacher,
  markAttendance), `enrollment.*`, `placement.manage`, `enquiry.*`, `marks.view`,
  `announcement.publish`, `user.view`, `program.view`.
- **Teacher** — `curriculum.author`, `curriculum.reorder`, `submission.grade`,
  `task.assign`, `marks.view`, `session.view`, `announcement.publish`,
  `program.view`.
- **Student** — `program.view`, `session.view`, `marks.view` (the student screens don't
  actually consult the map; they're scoped by being the signed-in user).
- **Admin only** — `user.*`, `program.create/publish/archive`, `audit.view`,
  `settings.manage`.

Two rules the code depends on:

1. **The map answers "what kind of thing", the scope check answers "which one".**
   `can(user, "session.schedule")` is never enough on its own; a mutation touching a
   program also calls `assertScope(user, { program })`.
2. **Nav, buttons and guards read the same map**, so a control that renders is a control
   that works. Screens that don't exist yet are shown in the sidebar as disabled "Soon"
   rows — visible, but never a link to a 404.

The program manager owns the **timetable as well as the cohort**: they schedule every
session and pick which teacher takes it. The teacher is a content-and-grading role with no
scheduling power — that was an explicit decision, not an oversight.

### Auth

Own implementation, no Auth.js and no Clerk: two small dependencies (`bcryptjs`, `jose`),
and the user records and the role field stay ours.

**The cookie.** `lms_session` — httpOnly, `secure` in production, `sameSite: "lax"`,
7 days. It holds a signed (not encrypted) JWT carrying `{ sub, role, name }` and nothing
else. Anything in it is readable by whoever holds the cookie, and anything cached in it
goes stale the moment an admin changes the record — which is why it only ever answers
*who is asking*.

**`src/proxy.ts` is not the authorization boundary.** (Next 16 renamed `middleware.ts` to
`proxy.ts` — same mechanics, see
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.) It
runs on the edge runtime with no database: it verifies the signature, redirects anonymous
requests to `/login?next=…`, and bounces a role that has wandered into someone else's
prefix. A user suspended a minute ago still looks fine to it.

**[guards.ts](src/lib/auth/guards.ts) decides.** Every layout, page and server action
starts with `requireUser` / `requireRole`, which read the database. Mutations follow one
order, always:

```
requireRole (who) → assertScope (which) → validate (what) → write → writeAudit → revalidate
```

`assertScope` calls `notFound()` rather than refusing, because "you may not see this"
still confirms the thing exists.

**A server action is its own front door.** Guarding the page is not enough — anyone who
can post to the action reaches it with or without the UI. That's why each action re-checks
rather than trusting the form that called it.

Deliberate choices in the login path, each easy to undo by accident:

- One message for every failure ("Email or password is incorrect") — never "no such user",
  which turns the form into a way of finding out who has an account.
- A hash comparison **always** runs, against `DUMMY_HASH` when the email is unknown;
  otherwise a missing account answers in ~1ms and a real one in ~250ms, and the timing
  says what the message refused to.
- Lockout after 10 failures for 15 minutes, tracked on the user document so it survives a
  serverless cold start.
- A suspended account is refused exactly like a wrong password.
- `passwordHash` is `select: false` on the schema, so a forgotten projection can't leak it.

**No public sign-up.** Staff accounts are created by an admin, students by enrolment.
An admin-set password sets `mustChangePassword`, and `requireUser` then diverts that user
to `/account/password` and nowhere else until they replace it — changing it still requires
the current password, because the flag means "someone else knows this", not "let whoever
holds this session set a new one".

**Env:** `AUTH_SECRET` (32+ chars, `openssl rand -base64 32`) plus `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`. Rotating `AUTH_SECRET` logs everybody out.

**Seeding:** `npm run seed` is idempotent and never overwrites an existing account. It
creates the admin from the env vars plus one account per role for local work
(`priya.manager@`, `rohit.teacher@`, `atul.student@` — all `Password123`).

### A stale encoding status now corrects itself

Fixed 7 September 2026. `video.status` is a **cache** of something only Bunny
knows. It is written once at upload — always `processing`, because encoding has
not begun — and `/api/webhooks/bunny` was the only thing that ever corrected it.
Two ways to get stuck there, and the second is not a localhost problem:

- **No webhook.** It cannot reach `localhost`, and in production it only fires
  if the URL is set in the Bunny dashboard.
- **A webhook that arrives too early.** The callback matches on
  `video.videoId`, and a short video can finish encoding before the author saves
  the form. The webhook then finds no subtopic, answers 200 and does nothing —
  correctly, so Bunny stops retrying — and the row is saved `processing` a
  moment later with nothing left to correct it.

**It was never only a badge.** `VideoStage` gates the player on this field, so a
stale `processing` meant students could not watch a video that had finished
encoding; and `seconds` never landed either, which is why such a lesson read
"0 min" everywhere a duration is shown.

`lib/video/reconcile.ts` refreshes the cache where it is consumed: the learning
screen (`getLearnScreen`) and the staff subtopic preview, which both the admin
and teacher routes render. **Not** in `getProgramCurriculum` — that is six flat
reads on every curriculum screen and would put an HTTP call per lesson on it.
One video, one call, and only while the cache still says `processing`; `ready`
and `failed` are terminal, because Bunny does not un-finish a video. A row
corrected on either screen is corrected for the tree too, since they read the
same document, so every stuck row self-heals the first time anyone opens it.

Bunny being unreachable is never fatal — the screen falls back to the cached
value. A video missing from the library is left alone rather than marked failed:
it may have been deleted by hand, and inventing a status would hide that.

`/api/video/status` stays read-only. Its reasoning — that a poll must not mutate
a record the author has not committed — is about an *open form*, and says
nothing about a row already in the database, which is what this is for.

### Student onboarding: landing page and sign-in (2026-10-27)

The public face a new student meets, tightened up for onboarding.

- **Hero** is two columns on desktop: the pitch on the left, a still of the
  student dashboard on the right (`DashboardPreview` in `Hero.tsx`, illustrative
  copy, `role="img"`). Under the CTAs, an "Already enrolled? Sign in / see how to
  get started" line for returning students.
- **`FirstDay`** (`#get-started`, after How It Works): the four steps from
  enrolment to first class, in the order the app enforces them: staff-made
  account, forced password change, fee gate, dashboard. The copy is `FIRST_DAY`
  in `data/home.ts`; change it if that flow changes. Not in the header nav,
  because a sixth item wraps the nav at 1440px.
- **`/login` and `/account/password`** share `AuthShell`: a dark brand panel
  (fixed `night-*` tokens, so it looks the same in both themes) beside the form,
  dropped on mobile. The login form gained a mail icon, a show/hide password
  toggle (`ui/PasswordInput`, also on the change form), a spinner while signing
  in, and a "First time signing in?" hint. "Forgot password?" is a pre-filled
  mailto to support because **there is no self-serve reset flow yet**.
- **Bug fixed in `Reveal`:** it rendered a plain tag when the visitor had reduced
  motion on. The server cannot know that setting, so it rendered the motion
  version at opacity 0, React did not patch the mismatch, and the hero and every
  revealed section were invisible to those visitors. It now always renders the
  motion element under `MotionConfig reducedMotion="user"`. The FAQ accordion
  still logs a harmless hydration warning under reduced motion (its open panel's
  inline style); its content is visible.

### A student can now sit a module test

Built 5 September 2026. A teacher could author a module test and
`finalTestLockReason` refused to open the final until it had been taken — but
`view.test` was referenced **only in staff components**. `startAttempt` had one
caller, the final/term page, and there was no route, link or control anywhere on
the student side. The final was therefore unreachable for any course whose
module carried a published test, in the same shape as the completion gap above:
a gate demanding something with no way to do it.

`ItemRow`'s own header already said where it belonged — *"a module test belongs
to its module"* — so that is where it went. The paper is addressed by adding
`?m=<moduleKey>` to the existing test route; everything below that is shared,
because to a student it is the same act. `findPaper` resolves the module's test
when a module is named, `startAttempt` carries the module through its redirects,
and the row renders as a sibling of the module in the curriculum, exactly as the
module's study material already does.

**Its gate is its own module's lessons** (`moduleTestLockReason`), not the
course's. A module test checks the material immediately behind it; waiting on
another module's work would make the order modules are taken in load-bearing,
which the tree does not otherwise care about. Unlimited attempts, so the row
offers a retake rather than going quiet once sat — the final only asks that it
*has* been sat, not passed, and the marksheet reads the best score.

Fixed alongside it: the test cover checked `course.locked` but not
`finalTestLocked`, so the curriculum said "Locked" while the paper's own page
offered "Start the paper" and the press landed on a 404. Two locks, and it was
only honouring one.

### Completion, for lessons that are not videos

Fixed 5 September 2026. `SubtopicProgress` had exactly one writer —
`recordVideoProgress`, called only by the video player — so a `text`, `pdf` or
`quiz` lesson could never be completed. The consequence was not cosmetic: a
module holding a reading never reached 100%, so `finalTestLockReason` kept
saying "finish the remaining N lessons" about lessons with no way to finish
them, the final test never unlocked, `nextCourseLockReason` never opened course
two, and **any programme containing a written lesson was impassable**. It cannot
have been noticed because the seeded data was almost entirely video.

`markLessonComplete(subtopicKey)` is the non-video counterpart. It takes the
lesson **key**, like `recordVideoProgress` does — that is what the curriculum
view carries and what the learn URL names — re-reads the subtopic, re-checks
enrolment, refuses `video` (which has a real watch signal and a clamp this would
be a way around), and never walks a finished lesson backwards.

**Completion is observed, not declared.** The alternative was a "Mark as
complete" button, which `SubtopicProgress`'s original note had planned for; the
call was made to match how video already behaves instead, so nothing asks a
student to confirm what they just did:

| kind | finished when |
|---|---|
| `video` | watched (unchanged — `recordVideoProgress`) |
| `text` | the end of the prose has been on screen |
| `pdf` | the last page has been shown |
| `quiz` | every question has been answered |

`useReachedEnd` is the shared piece. It watches a zero-height sentinel with an
`IntersectionObserver` rather than listening for scroll, because the element
that scrolls differs between the desktop split and the mobile drawer — and
because a sentinel answers `true` immediately for a lesson too short to scroll,
which is the case a scroll listener never fires for at all. A two-second dwell
stops click-through: progress that can be collected by accident is not progress.

The PDF pane moved from a bare `<iframe>` to `MaterialViewer`, the same pdf.js
viewer module study material uses. That was forced — a cross-origin iframe tells
you nothing about which page is on screen — and is an improvement anyway: the
document is now paged, zoomable and keyboard-navigable.

A refusal is logged in development rather than shown. A completion that fails
silently is the bug this whole section exists to fix, and the next one would
have been just as invisible.

### Public programs, curriculum page and Details

Built 10 September 2026.

The home page advertised **four hardcoded programs** from a `COURSES` array in
`data/home.ts`. They were not rows, so the site sold courses the LMS did not
have and hid every program created through the admin UI. Every card linked to
`/courses/[slug]`, which had no route and 404'd.

Three things landed together.

**`Program.marketing`** — a nested sub-object holding what a prospective student
sees: tagline, description, cover (WebP ≤ 2 MB), level, highlights, tools,
`placementGuarantee`, offers, `newBadge`, `nextBatch`. Nested rather than nine
columns because `saveProgram` writes an explicit field list, so editing a
deadline cannot wipe the copy and editing the copy cannot touch the slug. **Null
means nobody has filled it in**, which is a working state: the public pages fall
back to title, summary and the real curriculum rather than to placeholder text.

The price is *not* in there — `feeAmount`/`listAmount` already exist in paise
with an admin screen. Nor are duration, module or lesson counts: all derived, so
the number above the syllabus cannot disagree with the syllabus.

**`Course.startMonth` / `endMonth`** — what `/courses/[slug]` prints beside each
course ("Month 1", "Months 2–3"). Explicit rather than derived from `order`,
because courses are not one per month: two can share Month 1, one can span two,
and the numberless checkpoints sit between them. Both null prints no month
rather than a guess. `lib/curriculum/months.ts` groups *consecutive* courses
sharing a span — the timeline is a label on teaching order, never a re-sort.

**The Details screen** — `/admin/programs/[program]/details` and its
`/manager/...` mirror, sharing `ProgramDetailsEditor`. Admin **and program
manager** (`program.market`); a teacher gets neither, on the same reasoning that
keeps `/fees` away from them — a placement guarantee is a claim made on behalf
of the institution. Its own route rather than a section of `ProgramForm` because
of the cover: `saveModuleMaterial` records the bug where a picker inside a
multi-purpose form re-posted a file from a stale tab. The WebP/2 MB rule needed
no new code — `FILE_KIND_SPECS.image` and the unused `programs` upload scope
were already exactly that.

**What the array's removal touched.** Three consumers needed thought rather than
a swap:

| Site | Why it was hard | What it does now |
|---|---|---|
| `SiteHeader` | `"use client"` — cannot read Mongo | takes `programs` as a prop; `PublicHeader` in `SiteChrome.tsx` loads them with the theme |
| `data/dashboard.ts` | reachable from a client component, so no `server-only` in its chain | catalogue join moved to `availablePrograms()`; the module now has **zero imports**, making its purity structural |
| `validation/enquiry.ts` | pure, shared client + server | `validateEnquiry(input, { programs })` — the client checks membership, the **server stays lenient**: an enquiry is a lead, and 422-ing someone whose page loaded before a rename loses a sale over a free-text column |

`app/manager/page.tsx` moved to `programsFor(user)`, which fixes a live bug — a
manager assigned to an admin-created program saw zero programs.
`data/people.ts` `programTitle()` is gone in favour of `programTitles(slugs)`.

`data/home.ts` keeps only what has no row: stats, advantages, educators,
testimonials, FAQ. The old array survives as `LEGACY_PROGRAMS` in the superseded
`data/curriculum.ts`, where the migration script is its only reader.

**Counts are chained, not flat.** Every node denormalises `programId`, so
`Module.countDocuments({ programId, status: "published" })` would count a
published module inside a *draft* course — lessons nobody can reach, in a number
shown as a promise. `listPublicPrograms` walks program → course → module → topic
→ subtopic instead.

**No backfill.** One was written and then deleted: none of the four advertised
slugs (`performance-marketing`, `seo-aeo-geo`, `ai-marketing`,
`social-media-marketing`) has a row in `lms_db`, so there was no copy to
preserve. The database holds two QA programs, and those are what the site now
shows.

**Not verified:** the program-manager path. No manager credential was available
locally, so admin-yes and teacher-no were exercised and manager access was not.
It shares `requireRole("program_manager")` + `assertScope` with every other
`/manager` route.

### Program identity comes from the collection, not from `data/home.ts`

Fixed 5 September 2026. Several screens used to answer "does this program
exist, and what is it called?" out of `COURSES` in `data/home.ts`. That array is
marketing copy for the logged-out home page — it only ever held the four launch
programs — so every program created through the admin UI since was absent from
it, and a lookup against it answered "no such program" for real rows.

Where the answer only labelled something the cost was a slug shown instead of a
title. Where it *gated a query* the cost was a 404 on a page whose data was in
the database the whole time:

| Site | Was |
|---|---|
| `data/sessions.ts` | student's sessions screen 404'd |
| `data/manager-sessions.ts` | composer offered four slugs that are not rows, and no way to pick one that is |
| `app/teacher/sessions` | sessions listed under a raw slug |

`lib/data/programs.ts` now owns this: `listPrograms`, `programTitles(slugs)` for
a listing that has to label rows it already loaded, and `programsFor(user)` for
"what may this person act on". `schedulableProgramsFor` became async as a
result, and its three page callers await it.

At the time this was written `data/home.ts` was kept, on the reasoning that the
public page must render without a database read. **That array is now gone** — see
"Public programs, curriculum page and Details" above.
- `data/dashboard.ts` — the catalog of programs a student is *not* on, which is
  a marketing surface and arguably belongs on the marketing array.

### A PDF subtopic holds an uploaded file, not a link

Changed 5 September 2026. A `pdf` subtopic used to store `pdfUrl`, a link to a
document the teacher had hosted somewhere else, because there was no file
storage of our own. There is now — the same signed Cloudinary upload a module's
study material uses — so the field is `pdf`, an `UploadedFile`, and `pdfUrl` is
gone rather than kept as a fallback.

`video`/`videoUrl` deliberately kept both; this did not, and the difference is
worth stating. A video link is still a real way to hold a lesson: Bunny is
optional, and with no keys configured pasting a YouTube URL is the whole
feature. A PDF link was never that — it was the absence of a feature, and every
lesson pointing at one is a lesson that breaks when somebody moves a Drive file
or sets it to "restricted". Nothing pointed at a `pdfUrl` when this changed, so
there was no legacy to carry.

What the upload buys, beyond hosting: `publicId`. A record carrying only a URL
is an asset nobody can ever delete, so replacing a document now reclaims the old
one (`discardReplacedFile`, exactly as a swapped-out video calls `dropVideo`),
and deleting a subtopic reclaims its document too.

Accepted kinds are `["pdf"]` only — not `MATERIAL_KINDS` — because the kind is
named for it and `PdfStage` embeds it as a PDF; a `.docx` in that iframe is a
broken frame. The cap is `MATERIAL_MAX_BYTES` (20 MB), matching module study
material rather than the 10 MB an assignment brief gets.

**Changing the schema needs a dev-server restart.** `models.Subtopic ?? model(...)`
returns Mongoose's cached model, so a hot reload keeps the old schema and
silently drops the new field on write. This cost a debugging cycle; it will cost
the next person one too unless they read this.

### Wiping the data — `npm run reset:data`

[scripts/reset-data.ts](scripts/reset-data.ts) deletes every document in the
database and keeps users whose role is `admin`. Admins are kept because they are
the way back in: delete the last one and nobody can sign in to rebuild anything.
It deletes *documents*, never collections — the indexes survive, so the app
boots into an empty-but-valid database rather than a missing one.

**Read this before running it.** `MONGODB_URI` points at a shared Atlas cluster
that also hosts ~18 unrelated live client databases (`course-unbox-db`,
`lawpreptestportal`, `sales-crm`, …). A `deleteMany` aimed one database to the
left is not recoverable from here. So the script refuses to write unless three
independent things agree:

1. `db.databaseName` — what the server actually handed back, not what we asked for,
2. `MONGODB_DB` from `.env.local`,
3. the `--db=` name typed on the command line.

It never calls `dropDatabase`, never opens a sibling database, and only ever
names collections it read back from this one. **A bare `npm run reset:data` is a
dry run** that reports what it would delete and changes nothing; the wipe needs
`-- --yes --db=lms_db`.

Note that it clears database rows only. Files already pushed to Cloudinary and
videos in the Bunny library are *not* deleted and become orphaned — they cost
storage until removed from those dashboards.

Run on 2026-09-05: cleared 236 dummy documents (2 programs, 4 courses, 3 batches,
5 enrolments, 178 audit rows, 8 non-admin users, …), leaving only
`admin@courseunbox.com`.

### Audit log

`AuditLog` is written by one function and read by one screen.

**Writing** — [auth/audit.ts](src/lib/auth/audit.ts). `recordAudit(actor, entry)`
is the primitive; `writeAudit(user, entry)` is the common wrapper every staff
mutation already used and still uses. It never throws, and it is always called
*after* the write succeeds — except `auth.login.failed`, where the failure is
the event. Three actor shapes, because not everything that acts is signed in:
`user`, `anonymous` (a failed sign-in with an email and nothing else) and
`system` (the Bunny webhook).

The vocabulary lives in [auth/audit-actions.ts](src/lib/auth/audit-actions.ts) —
pure and dependency-free, so scripts and client components can import it.
`ACTIONS` maps every dotted verb to a screen label and a category, `recordAudit`
types its `action` against it (so a typo is a compile error), and the category
is derived there rather than passed by call sites. **Adding a logged action
means adding a row to `ACTIONS` first.**

Summaries are the column a human reads: past tense, names not ids, subject
implied — "Suspended Priya Nair", not "user.suspend on 66f1a2…". Ids and
before/after values go in `meta`, never credentials.

**What is logged:** every sign-in (success, failure, lockout) and sign-out with
IP and user agent; password changes and profile edits (which fields moved, not
their values); every staff mutation across people, curriculum, sessions,
batches, enrolments and tasks; student submissions, test starts/submissions and
proctoring flags; destructive media deletes. **Deliberately not logged:**
`recordVideoProgress` and `saveAnswer` — per-tick autosaves would bury
everything else.

**Reading** — [data/audit.ts](src/lib/data/audit.ts) and
[/admin/audit](src/app/admin/audit/page.tsx). Filters are URL state
(`?q=&role=&category=&action=&from=&to=&page=`), so a filtered view is
linkable. `q` matches actor email, actor name or summary. This is the codebase's
only paginated list (50/page) — the log grows without bound, so the `.limit(200)`
the other list screens use would quietly stop being the truth.

**Purge** — [actions.ts](src/app/admin/audit/actions.ts), admin only. The one
exception to append-only. It reuses `parseAuditFilters`/`auditWhere`, so what is
deleted is exactly what was on screen; an empty filter set is refused, so
clearing the whole log cannot be a stray click; and it writes its own
`audit.purge` entry naming the filter and the count, so the trail never has an
unexplained gap.

`npm run backfill:audit` fills `actorEmail` and `category` on rows written
before those fields existed (already run against `lms_db` — 103 rows).

> **After changing a Mongoose schema, restart `next dev`.** The long-lived dev
> process caches the registered model, and Mongoose silently *drops* query
> conditions on paths its cached schema doesn't know — new filters appear to do
> nothing while old ones work. This cost real debugging time once already.

### Staff panel

design.md §5's app shell, finally built: left sidebar (17rem) from `lg`, bottom tab bar
below, 64px top bar with the account menu.
[StaffShell](src/components/staff/StaffShell.tsx) is server-rendered; only the links
themselves are a client island, [StaffNav](src/components/staff/StaffNav.tsx).

That split was a bug fix (2026-09-01). The shell used to take the pathname as a prop,
which the layout read from an `x-lms-pathname` request header set by the proxy — a
server layout cannot otherwise see the URL. But **a layout does not re-render when you
navigate between its own pages**, so the header's value was whatever the last *full*
page load saw: the active-item highlight only moved on reload. StaffNav uses
`usePathname` instead, and the header is gone from the proxy and `auth/cookie.ts`.
Capability filtering still happens on the server (`navFor`), so the client only ever
receives items the user may see; icons travel as *names* (`NavItem.icon: IconName`,
mapped to components in StaffNav) because a component reference cannot cross the
server→client boundary.

[StaffLayout](src/components/staff/StaffLayout.tsx) is "guard, then shell", and each
area's `layout.tsx` is three lines of it. The guard lives there rather than in each page
so a screen added later cannot forget it.

**Admin landing** shows live counts only — staff by role, students, suspended accounts,
new enquiries, recently added people. Metrics whose models don't exist yet (sessions this
week, enrolments this month) are **absent rather than faked**: staff act on these numbers,
so a plausible invented one is a lie with consequences.

**People (`/admin/people`)** — list with `?role=&status=&q=` URL filters, table from `md`
and a card list below it. Create sets a temporary password (there's no mail provider, so
the admin passes it on themselves — no fake "invite sent"). The detail screen edits
details and assignments, suspends/reactivates, and resets passwords.

Rules enforced in the action, not just hidden in the UI: **nobody can change their own
role or suspend themselves** (the last admin locking themselves out is unrecoverable
without database access), and a role change **drops assignments the new role can't hold**.
Suspension is never a delete — a deleted teacher orphans every session they taught.

### Live sessions

The first feature that runs the whole way through: a program manager schedules, a student
sees it, the manager marks attendance, the student's percentage moves.

**Student side** (`/dashboard/[course]/sessions`) — attendance band with a "View details"
dialog, Upcoming / Completed tabs, session-type and date filters on completed, cards
grouped by kind. All URL state; the dialog is the one client island.

**Staff side** (`/manager/sessions`) — list scoped to the manager's programs *in the query
itself*, schedule/edit form, and the attendance roster.

Decisions worth keeping:

- **`startsAt` is a real UTC datetime.** The placeholder stored minutes-from-midnight so it
  could never go stale; real sessions carry real instants, and IST formatting happens at
  the edge of the UI (`formatSessionDate` / `formatSessionTime`). Staff type IST wall-clock
  time; `toUtcInstant` converts with a fixed +05:30, since India has no daylight saving.
- **Upcoming vs completed is decided by the clock**, not by whether attendance happens to
  be marked. A finished session nobody has marked yet is still finished.
- **Unmarked ≠ absent.** An Attendance row exists only once someone marks it, so a session
  the manager hasn't got to yet is excluded from the percentage rather than counted as an
  absence. The student's card says "Not marked" — a distinct third state from
  Present/Absent. Cancelled sessions are excluded too; nobody can attend one.
- **Attendance percentages stay derived**, never stored, exactly as the placeholder did.
- **Cancelling keeps the row** (`status: "cancelled"`), because a student who arranged
  their week around a session must still see what happened to it.
- **The roster is marked with radios, not checkboxes** — an unticked box would mean both
  "absent" and "haven't looked yet", which is the ambiguity the null state exists to
  avoid. Marking again corrects the existing row (upsert against the unique
  `(sessionId, studentId)` index) rather than duplicating it.
- **Attendance can only be marked once the session has finished**, so nobody is recorded
  absent before they have had the chance to turn up.
- `rosterFor()` currently returns every active student, because enrolments are still
  static. It is the single place to change when the Enrollment model lands.

#### Google Meet links (2026-08-31)

Scheduling a session can now **create the Google Meet itself**, rather than the manager
setting a meeting up elsewhere and pasting the URL. It is a checkbox on the schedule form,
on by default for a new session; unticking it restores the paste-a-link field.

[lib/googleCalendar.ts](src/lib/googleCalendar.ts) is the whole integration — a service
account with domain-wide delegation impersonating `GOOGLE_ADMIN_EMAIL`, inserting a
Calendar event with `conferenceDataVersion: 1`. A Meet URL cannot be created on its own;
it is a side effect of the event, which is why the event is what we store.

- **No credentials means a mock link, not a crash.** With the Google env vars unset or
  still `.env.example` placeholders, `createGoogleMeetEvent` logs a warning and returns
  `https://meet.google.com/mock-cls-room` with a `mock-`-prefixed event id. That is what
  let the flow be built and used before the Cloud project existed. Every screen that can
  show a generated link **says plainly when it is a placeholder**, because a mock link
  looks exactly like a real one and the failure mode is emailing it to a cohort.
- **`googleEventId` on LiveSession is the join between the two systems.** Empty for a
  pasted link. Its presence is what lets a reschedule move the real calendar event and a
  cancellation withdraw the invite, instead of the event drifting from the row.
- **Create mints before writing the row; update and cancel reach Google after, and fail
  quietly.** If Google fails at create time nothing is stored — better than a session in
  every student's timetable with no way in. By update time the app's own record is already
  correct, and refusing the edit over a Calendar outage would punish the manager for
  something they cannot fix. Cost of that choice: an orphaned calendar event is possible.
- **A reschedule `patch`es, never `update`s.** `update` replaces the whole event and drops
  the conference, minting a link nobody has been given; patching keeps the Meet URL
  students already hold.
- **A generated link is not editable in the form.** Either we own the URL or the manager
  does. Offering a generated link *and* a text field invites someone to overtype a URL that
  is already in students' calendars.
- The teacher's email for the invite is read from the `User` record, never from the posted
  form — otherwise the form would be a way to mail a calendar invite to any address.
- Teacher (`/teacher/sessions`) and student (`/dashboard/[course]/sessions`) screens needed
  no changes: both already render `joinUrl`.

`ClassSchedule`, a parallel collection drafted for this, was deleted before it shipped —
`LiveSession` already had every field it held plus attendance, cancellation and session
kind, and two live-class tables would have been two answers to "what is on my timetable".

### Container widths

[Container](src/components/ui/Container.tsx) has two sizes. `default` is design.md §8 —
1152px, a reading measure, right for the marketing pages. `wide` is 1440px with a smaller
gutter, for signed-in app screens: those are dashboards, not prose, and holding them to a
reading width leaves cards cramped between empty margins on a laptop. Both signed-in curriculum
screens use `wide`; the marketing pages stay on `default`.

### Enquiry form

The first thing on the site that writes to the database. One dialog, opened from every
enquiry CTA: header "Apply now" (desktop and mobile menu), hero "Talk to a counsellor",
and the contact band's "Apply now". The band's second button is a `tel:` link.

`EnquiryProvider` wraps the page and holds the open state; `useEnquiry().open(source)`
triggers it, and `EnquiryButton` lets server components fire it without becoming client
components. `source` records which CTA was used and is stored on the lead — that is how
we will learn which CTA actually converts.

**Four fields only** — name, mobile, email, program. Deliberately short: every extra
field on a lead form costs completions, and the counsellor gets the rest on the call.

[src/lib/validation/enquiry.ts](src/lib/validation/enquiry.ts) is imported by both the
dialog and the route handler, so the rules can't drift. The client validates for fast
inline feedback; the server re-validates because client validation is a convenience,
never a guarantee. A 422 returns field-level errors the dialog renders inline.

Behaviour worth preserving: errors appear only after the first submit attempt (not while
someone is still typing their name), focus jumps to the first invalid field, and a failed
save keeps every value in the form with a retry and the phone number — nobody retypes
after a server error.

Dialog is a centred modal at `md+` and a bottom sheet below, with focus trap, Escape to
close, scroll lock, and focus restored to the trigger.

### Database

MongoDB Atlas via **Mongoose**. Two env vars, both read through
[src/lib/env.ts](src/lib/env.ts):

- `MONGODB_URI` — the Atlas SRV string, **without** a database name in the path
- `MONGODB_DB` — database name, passed as `dbName` so dev and prod can share a cluster

Why the accessors in `env.ts` instead of `process.env` directly: a missing or
still-placeholder value throws one clear message instead of surfacing as `undefined`
inside the driver.

[src/lib/db.ts](src/lib/db.ts) exports `connectToDatabase()`. It caches both the
connection *and* the in-flight promise on `globalThis`, because Next hot-reloads modules
in dev and runs many serverless invocations in prod — a plain `mongoose.connect()` at
module scope opens a new pool each time and exhausts the Atlas connection limit. A
rejected promise is cleared so the next request retries rather than re-awaiting a dead
one. `bufferCommands: false` means queries fail fast when the cluster is unreachable
instead of hanging.

Call it at the top of any server component, route handler, or server action that touches
data:

```ts
import { connectToDatabase } from "@/lib/db";
await connectToDatabase();
```

`db.ts` and `env.ts` both import `server-only` — importing them from a client component
is a build error by design.

**Verify the connection:** `npm run dev`, then `curl localhost:3000/api/health/db`.
`{"ok":true,...}` means Atlas is reachable; 503 means it isn't, and the real reason is in
the server console (never in the response — Mongo errors contain the username and host).

Atlas setup checklist: create the cluster, add a database user, allow your IP under
Network Access (Atlas blocks everything by default — this is the usual cause of a
timeout), then paste the string into `.env.local`. Percent-encode any of `@ : / ? # [ ] %`
in the password.

### File uploads (Cloudinary)

One reusable field, [FileUpload](src/components/ui/FileUpload.tsx), for every
document in the staff panel: images, PDFs and Word files. Not archives — a zip
is deliberately not a kind, so enabling one is an edit to `FILE_KIND_SPECS`
rather than something that happens by accident.

**The browser uploads straight to Cloudinary; we only sign.** `POST
/api/uploads/sign` returns a signature for one asset, and the file goes from the
browser to Cloudinary without passing through Next. Routing a 10 MB PDF through
a route handler would spend our bandwidth and hit the body-size limit for
nothing, and this way the field gets real upload progress (which is why it uses
`XMLHttpRequest` and not `fetch` — `fetch` has no upload progress event).

**No SDK.** A signed upload is a SHA-1 of the sorted parameters plus the API
secret, and a destroy is one form POST; that is two small functions in
[lib/uploads/cloudinary.ts](src/lib/uploads/cloudinary.ts) against a documented
HTTP API, versus a dependency. Same trade as auth.

**No transformations, anywhere.** Nothing sends `eager`, `transformation` or a
format, and delivery URLs are used exactly as Cloudinary returns them. Assets
are stored and served as uploaded.

**One folder per type of file, then per part of the app:**

```
LMS/images/{curriculum,programs,sessions,people,submissions}
LMS/pdfs/…            (Cloudinary resource_type: raw)
LMS/documents/…       (.docx, .doc — also raw)
```

PDFs and Word files go in as `raw`, not `image`: they are documents to be
downloaded, and `raw` delivers the exact bytes under the exact filename. That is
also why a raw asset's extension is part of its `public_id` — it is what makes
the URL end in `.pdf` — while an image's is not, since Cloudinary appends the
format it detects.

**The scope is an allowlist, not a free string.** The folder comes from the
browser, so without `UPLOAD_SCOPES` in
[lib/uploads/kinds.ts](src/lib/uploads/kinds.ts) anyone with a session could
write anywhere in the account. The same map says who may upload where —
curriculum is admin and teacher, programs and sessions bring in the manager,
people is admin only, and `submissions` is the one scope a student may use.
Admin is admitted everywhere, the superset rule again.

`kinds.ts` is imported by **both** the component and the route handlers, like
`validation/enquiry.ts`: the browser validates for fast feedback, the server
validates because client validation is a convenience.

**Size limits are two numbers, not one.** Each kind carries a default in
`FILE_KIND_SPECS` (2 MB for a WebP or a photo, 10 for a PDF or a Word file),
and a *field* may raise its own to `MAX_UPLOAD_BYTES` by passing `maxBytes` —
which module study material does, and nothing else. `MAX_UPLOAD_BYTES` is 20 MB
because that is exactly what the account accepts: uploading a byte over it
answers `File size too large. Got 22020096. Maximum is 20971520.` It is not a
policy number, so `npm run check:cloudinary` asserts it rather than trusting it.
`maxBytes` arrives in the sign route's request body and is therefore clamped in
`validateUpload` — otherwise a forged post would pick its own ceiling.

Decisions worth keeping:

- **The public id is minted and signed server-side** from a slugged filename plus
  a timestamp and random bytes, with `overwrite: false`. Two people uploading
  `notes.pdf` cannot collide, and nobody can choose where their file lands —
  a name of `../../../evil.pdf` becomes `LMS/pdfs/curriculum/evil-….pdf`.
- **What we cannot check is the bytes.** The declared name and size are a claim;
  the upload goes browser → Cloudinary. The signed folder and extension, and the
  fact that only a signed-in account can get a signature at all, are the boundary
  that actually holds.
- **`publicId` is stored beside the URL** (`UploadedFile`), because a record with
  only a URL is a file nobody can ever delete.
- **A removed file is destroyed only if this session uploaded it.** One that came
  in through `defaultValue` belongs to a saved record, and abandoning the form
  after deleting its bytes would leave the record pointing at nothing.
- **The field posts JSON in one hidden input**, the `QuestionBuilder` pattern, so
  a server action parses one field instead of `files[0][publicId]` name soup.
  Client parents can pass `onChange` instead; it fires when the value moves, not
  on every progress tick.
- Destroy sends `invalidate`, so a deleted file stops being served from the CDN
  rather than living on in cache for hours.

Both route handlers answer JSON for every outcome, **never a redirect** — they
are called by `fetch`, and a 307 to `/login` would arrive as a parse error
instead of "you are signed out". That is why they use `getCurrentUser()` rather
than `requireUser()`.

Verified against the real Cloudinary account by replaying signed uploads: all
three kinds sign, upload, deliver (`200 application/pdf` for a PDF) and delete,
leaving nothing behind (`npm run check:cloudinary`); anonymous requests to both
routes get 401; a teacher is refused the `people` scope and a student the
`curriculum` one, while a student may write to `submissions`; a `.zip`, a 40 MB
PDF, and a PNG in a PDF-only field are each refused with the message the field
shows; an unknown scope and a public id outside `LMS/` are refused. **Not yet
clicked through in a browser** — the drag-and-drop, progress and remove states
were built but not exercised by hand.

**Three callers:** the assignment builder's brief document (see "Assessment and
assignment builders"), the student's hand-in (see "Handing work in"), and a
module's study material (below — its own screen, not a form field). The
PDF-subtopic form still takes a pasted URL;
it is the obvious next one. Video went elsewhere — see below.

### Module study material (2026-09-01, moved to its own screen 2026-09-04)

A module can carry **one** file — a PDF or a Word document, up to 20 MB.
`Module.material` is the shared `uploadedFileSchema`, exactly as
`Assignment.briefFile` is.

**It is managed on the module's own screen, not in the module form.**
`ModuleMaterial` (in `staff/curriculum/`) is the section between the
"Add a topic" bar and the topics, and it holds all three things you can do to
the file: attach one, replace the file or rename it, and remove it. That
replaced a field on `NodeForm` that only appeared on create/edit-details, which
is why in practice nobody ever changed or removed a handout — the upload was
findable and the update and the delete were not.

Three consequences, all deliberate:

- **One writer.** `saveModuleMaterial` and `removeModuleMaterial` are the only
  actions that touch the field; `saveTreeNode` no longer posts it. When it was
  also a form field, a module form left open in another tab re-posted the *old*
  file on save — resurrecting a record pointing at bytes already destroyed.
- **Removal is a decision, not an empty field.** It has a confirm
  (`useConfirmSubmit`) and its own action. A save with an empty picker is
  rejected — that is far more often a failed upload than "take it down".
- **A module is created without material**, the same way it is created without
  topics or a test: the create form redirects to the module screen, where all
  three are added. `NodeInput` lost `materialTitle`; the title now validates on
  its own through `validateMaterial`.

The old file is destroyed only after the record stops pointing at it
(`discardReplacedFile`, best effort) — a record pointing at a deleted file is
worse than a file nothing points at. A module *delete* still reclaims material
through `dropModuleMaterials`.

One file rather than a list, and on the module rather than the topic: it is what
a student takes away from the *module*, and anything more granular already has a
home on the subtopic it explains.

`MATERIAL_KINDS` is `pdf | document`, and the field passes `MATERIAL_MAX_BYTES`
so a 15 MB PDF is fine here while the same PDF is still refused on an assignment
brief.

**The title is the teacher's, and it is required whenever a file is attached**
(`validateMaterial`, `hasMaterial` — the same arrangement as the assignment's
`hasBriefFile`). `Q3 notes FINAL v2 (1).pdf` is what it was called on their
laptop, not what the reading is. A student never sees the filename; it survives
only as the `download` attribute, which is the name the file saves as. Clearing
the file clears the title with it — a title with nothing under it would be a
link to nowhere. The staff module page is the one place the filename still
shows, because a teacher replacing the file needs to know which one is up there.

**Students open it in the pane, not in a new tab.** `?v=material` on the
module's own learn URL (`materialHref`) puts `MaterialStage` in the right pane
where the video and the quiz go — the outline, the course header and their place
in it all stay put. Both doors lead there: the block in the learning screen's
sidebar (outside the module disclosure, since behind the module *switcher* is
the one place nobody would look) and the strip under the module row on the
course page. Neither links to the file. A stale `?v=material` on a module with
nothing attached falls back to the lesson rather than 404ing.

No footer on that pane: the document is not a step in the sequence, so "Next"
would have to mean something arbitrary, and the outline is already on screen.

**Rendered by us, in our own chrome.** This started as an embedded
`view.officeapps.live.com` frame and that is gone: it was somebody else's page
inside ours — their chrome, their fonts, their uptime, a ~10 MB ceiling under
our own 20 MB cap — and it looked like it. Now a PDF goes through Mozilla's
pdf.js (`react-pdf`) onto a canvas we own, and a Word file through
`docx-preview` into a div we own, both in `MaterialDocument`. The toolbar —
page back/forward, page counter, Fit width, Fit page and the zoom — is ours.

**PowerPoint is refused at the picker, on purpose.** There is no
pdf.js-equivalent for `.pptx`: the browser renderers that exist are two orders
of magnitude smaller and approximate on real decks. A preview that quietly
misrepresents a document is worse than no preview, so `MATERIAL_KINDS` is
`pdf | document` and a teacher exports the deck as a PDF. Enabling it later
means a `slides` kind *and* a renderer to match, in that order.

Both libraries fetch the file from Cloudinary **in the browser**, which works
only because raw delivery sends `access-control-allow-origin: *` and answers
range requests with a 206 (checked against the account, not assumed). If that
changes, these fetches fail and the file needs proxying through a route of ours.

Decisions worth keeping:

- **`ssr: false`, not just `"use client"`.** A client component is still
  rendered once on the server for the initial HTML, and pdf.js reaches for
  `DOMMatrix` on import — which threw during SSR and made the whole learn route
  a 500 *invisibly*, because the page then hydrated and looked right in the
  browser. `MaterialViewer` exists solely as the `dynamic(..., { ssr: false })`
  boundary, since a server component may not pass that flag.
- **Zoom grows the document, never the page.** It scrolls inside its own
  container at every size, so the toolbar stays on screen — which is exactly
  when you need it. Both viewers share `useDocumentZoom` and mean the same
  thing by a percentage: `scale` is the document's **true** size, so 100% is
  the page at the size it prints, Fit width spans the pane, and Fit page shows
  a whole page. The two fits are *derived* from the pane on every render rather
  than remembered, so they survive the sidebar opening and a phone being
  turned. A PDF's paper size comes from `originalWidth` in points (× 96/72); a
  Word file's from the section's `min-height`, which is where `docx-preview`
  writes the paper size — its `.docx` element is a *section*, often many pages
  long, so its own height is not a page.
- **Four ways to zoom, and none of them zooms the browser.** The buttons,
  ⌘/Ctrl + wheel, a trackpad pinch and a two-finger pinch on a touchscreen.
  This is the fix for the bug that made it a real complaint: a pinch anywhere
  on the document used to zoom the whole window, document and all. Three things
  together are what stop it — `touch-action: pan-x pan-y` on the pane (one
  finger still scrolls, the pinch is ours), listeners registered by hand
  because React's wheel and touch props are *passive* and a passive listener
  may not `preventDefault`, and Safari's own `gesturestart`/`gesturechange`,
  which is all a Mac trackpad sends there — no ctrl+wheel at all.
- **A pinch is previewed with a transform and committed on release.**
  `react-pdf` keys its canvas on the scale, so a committed step *remounts* it —
  and a touch sequence keeps being delivered to the element it began on, which
  by then is detached. The gesture died after one step. Scaling the wrapper
  re-renders nothing, so the fingers keep their target and the document is
  rasterised once, at the end.
- **The page box is sized by us, and that is what keeps the scroll.** The same
  remount leaves the document with no height for a few frames, the browser
  clamps the scroll to what is left, and every zoom step threw the reader back
  to the top. Holding the space the page is about to take fixes it, and only
  then does the anchoring work: ⌘/Ctrl + wheel and pinch both zoom about the
  pointer, with the scroll offset corrected in a `useLayoutEffect`. The wheel
  delta is capped before use: raw values differ wildly between devices and took
  the zoom from 140% to 300% in one flick.
- **`min-w-max` on the row that centres the page.** A flex item wider than its
  centred container overflows on *both* sides, and the half that goes off the
  left cannot be scrolled back to — so a zoomed-in page lost its left margin.
- **One page at a time.** A canvas per page would have a 200-page handout
  allocating 200 of them before anything was readable.
- **docx-preview's stylesheet is overridden in `globals.css`** (`.docx-host`),
  which replaces its grey page-gutter with our own surface. Only the frame —
  everything inside `.docx` is the document's own formatting.

**A pre-existing layout bug turned up here.** `main` on the learn screen sets
`lg:h-[calc(100dvh-4rem)]`, but it is a `flex-1` item of a column `body`, so its
default `min-height: auto` let tall content push it past that height — the "two
independent scroll areas" the file's own comment describes were silently one
long page. `lg:min-h-0` fixes it, and it affects the video, reading and quiz
panes too, not only this one.

`AttachmentLink` is the shared card for *offering* a file (staff pages, forms);
`MaterialDocument` is the one place a student *reads* one.

Cleanup follows the assignment's: replacing the file destroys the one it
replaced (`discardReplacedFile`), and `dropModuleMaterials` reclaims assets
before a module — or a course, or a program — is deleted, for the same reason
`deleteSubtopics` reclaims Bunny videos. Storage is billed monthly.

Verified: `npm run check:cloudinary` signs, uploads, delivers and deletes every
kind and asserts the 20 MB ceiling; a probe wrote a `material` subdocument
to Atlas and read it back intact (absent reads as `null`), then deleted it; and
`/api/uploads/sign` was driven over HTTP with real minted sessions — admin and
teacher get a signature at 19 MB and at 15 MB, 25 MB is refused (with or
without a forged `maxBytes` of 999 MB), a `.zip` is refused, the same 15 MB PDF is still refused as an
assignment brief, a student gets 403 and a signed-out request 401.

The student side was then driven end to end against the running server as a real
enrolled student, with material attached to a live module and the module put
back afterwards: `?v=material` returns 200, shows the teacher's title, never
renders the filename (it appears only as `download=`), frames the Office viewer
pointed at our URL, offers the download and shows no Prev/Next; without the flag
the pane is the lesson and the sidebar still links across; a stale flag on a
module with nothing attached falls back to the lesson; and the course page row
links into the learn screen rather than at the file.

The viewer was then driven in **real Chrome** (Playwright, `channel: "chrome"`)
against a real 3-page PDF and a real `.docx` uploaded to Cloudinary and attached
to a live module: pdf.js paints a canvas and its text layer carries the page's
actual words, the page count comes from the file, Next advances it, button zoom
and ⌘/Ctrl + wheel both work, the page's own scroll height does not change when
zooming, the document overflows only its own container, the toolbar stays on
screen, docx-preview renders the Word file's heading and body, and there are no
console errors. Module restored and both assets deleted afterwards.

**The zoom was driven the same way (2026-09-04)**, against the live `.docx` on
`pm-c1-m1` and a 14-page PDF, in Chromium at desktop, iPad and iPhone sizes.
What the numbers said: Fit width 148% and Fit page 69% on a Letter PDF, with
the pane's scroll height exactly the page at that size and *no* scrolling at
all under Fit page; Actual size 100% = 1056 px for an 11-inch page, so the
percentage means what it says; two zoom-ins from there = 144%, one wheel notch
= +13%, and the keys `0`, `+`, `-` do the same as the buttons. A wheel zoom at
a point 480 px down the pane moved the scroll to 506 where the anchoring
predicts ~500 — before the sized page box it went to 0, which is the jump-to-
top bug. A two-finger pinch tracked the whole gesture (123% → 390% out, → 137%
back, both to the pixel of what the finger spread asks for) while
`visualViewport.scale` stayed **1** throughout: the document zoomed and the
page did not.

**Still not done by hand:** the upload field itself (drag-drop, progress,
remove) has never been exercised in a browser.

### Lesson video (Bunny Stream, 2026-08-31)

**Video does not go through Cloudinary, and that is the point.** Cloudinary
stores a file. A lecture needs a *ladder* of encoded renditions, a player that
picks a rung from the viewer's connection, and delivery priced for gigabytes —
which is Bunny Stream. So video has its own field, its own uploader, its own
stored shape, and the two never mix.

**Configuration is optional, exactly like Google Meet.** With `BUNNY_STREAM_*`
absent, `isConfigured()` is false: the uploader is hidden, the video subtopic
falls back to a pasted link, and the app runs. That is deliberate — a feature
nobody has keys for must not be a crash.

The account: free tier, $20 credit, **Volume** delivery ($0.005/GB flat — the
Standard tier costs up to 12x more per GB and buys latency a recorded lecture
has no use for), free H.264 encoding, transcribing off. Working numbers: an
hour of 1080p is roughly 1–1.5 GB stored and ~0.6–1 GB per student-hour
watched, so delivery is about **half a cent per student-hour** and the credit is
worth 3,000–4,000 of them. Storage is ~$0.01/GB/month per region, and
**replication regions cannot be removed** without deleting the library — two
regions, not nine.

#### The upload path

```
browser                     our server                    Bunny
   |  POST /api/video/sign  ---->                            |
   |                          (role check, then)             |
   |                          POST /library/{id}/videos  ---->  creates a record
   |                          <----------------------------  guid
   |  <---- {videoId, signature, expires, libraryId}         |
   |                                                          |
   |  TUS: POST + PATCH chunks, 5 MB at a time  ------------->  bytes land
   |                                                          |  (then minutes
   |  POST /api/video/status (every 5s)  ---->  GET video  --->   of encoding)
```

**The bytes never touch Next.** Same trade as Cloudinary, for a much bigger
reason: a 1.5 GB lecture through a route handler would blow the body limit,
spend our bandwidth twice, and give the uploader no progress bar. What the
server keeps is the API key and the decision that this person may create a
video at all.

**TUS, not a plain PUT**, because a lecture is gigabytes and a dropped
connection halfway through has to resume rather than restart. `tus-js-client`
is the one dependency added here; the signature itself is ours —
`SHA256(libraryId + apiKey + expires + videoId)`, scoped to one video id, so a
stolen credential can only fill a record we already created.

**Uploading is not the end.** Bunny then encodes for minutes, and a video that
has arrived is not one that plays. Two mechanisms report that, and the second
is only an optimisation:

- `VideoUpload` **polls** `/api/video/status` every 5s and shows "Encoding"
  until it is genuinely ready. This is the path that always works — a webhook
  cannot reach `localhost`, and cannot help a form that is open right now.
- `/api/webhooks/bunny` writes the status back without anyone opening a form.
  Verified `HMAC-SHA256(rawBody, readOnlyApiKey)`; the body is read as **text**
  and hashed as the exact bytes that arrived, because re-serialising the parsed
  JSON reorders keys and the hash never matches. An unverifiable call is
  refused, not trusted — the URL is public.

`Subtopic.video.status` is a **cache**, not the truth. Bunny owns the encoding
state; this is the last thing it told us, and it is allowed to be briefly stale
so a student's page needn't make an API call per render.

#### Playback

`VideoStage` now picks between three players: an uploaded Bunny video (wins
whenever present), a link to a media file (`<video controls>`), or a link to a
page that embeds one (`<iframe>`). The last two are the old path, kept because
lessons already point at such links and because an install with no keys still
has to work.

**The embed URL is built on the server, and that is the whole security model.**
`embedUrl()` signs it `SHA256(tokenKey + videoId + expires)`; the key never
reaches the browser, so the only playable URLs that exist are the ones this
component rendered, for pages `getLearnScreen` already decided the student may
see, and they expire.

**The token key is the library API key** — not a separate secret. Bunny's
mobile-SDK guide says it outright and the library object carries no other key,
so `BUNNY_STREAM_TOKEN_KEY` is an override that should normally stay empty.

The token authenticates the *iframe load*, not the stream — once the player is
up it fetches its own segments — so the expiry only has to outlast the gap
between render and the frame loading. **30 minutes**: Bunny recommends 1–5, but
that is advice for an API call, and a learning screen can sit open in a tab.
The same reasoning is why that iframe is deliberately **not** `loading="lazy"` —
a frame waiting for a scroll can wait past its own token.

A video that is still encoding gets a sentence saying so rather than Bunny's
player showing a black rectangle, which a student would read as a broken page.

#### Cleaning up

Storage is billed monthly and delivery by the GB, so an orphaned video is a
standing charge rather than untidiness. Three places delete:

- `VideoUpload` removing a video **it** uploaded (never one loaded from a saved
  record — abandoning the form would then break the saved lesson);
- `saveSubtopic`, when a video is swapped or removed. It reads the document
  `before` the update precisely to learn what it used to own, and deletes
  **after** the write commits: deleting first and then failing to save would
  leave a lesson pointing at nothing, which is worse than an orphan;
- `deleteSubtopics`, which reads the videos before the rows go, then deletes
  them one at a time — a course's worth of parallel deletes is how you get
  rate-limited.

All of it is best effort and logged. Bunny being unreachable must never undo a
write that has committed.

`/api/video/destroy` **refuses to delete a video a subtopic still points at.**
That check is what makes the route safe to expose: the id comes from the
browser, so without it any signed-in teacher could take down a published lesson
by posting its GUID. (The Cloudinary equivalent cannot do this yet — its
records are spread across collections. A video has exactly one owner.)

#### Recommended library settings

Free MediaCage Basic DRM **on** (stops casual downloading; costs MP4 fallback
and Early-Play, which is a fair trade), Embed View Token Authentication **on**
with the key in `.env.local`, allowed domain `courseunbox.com`, 2160p/1440p
encoding **off** (every enabled resolution is stored and billed). `.env.example`
carries the click-by-click.

**Verified against the live account (2026-08-31):** `npm run check:bunny` does a
full create → TUS → read → delete round trip — credentials, both hashes, and
cleanup all pass, and the library is empty afterwards. A real upload through the
authoring form reached Bunny and encoded. Playback under DRM has not been
watched end to end yet.

Two things the live run taught, both about TUS and both already handled by
`tus-js-client` (so they only ever bit the check script): Bunny answers the
creating POST with a **relative** `Location` (`/tusupload/<id>`), and **every**
TUS request must carry the four auth headers — a bare `PATCH` gets
`400 Library ID missing or invalid`.

#### Progress, and how much it trusts the browser

`recordVideoProgress` is deliberately **less paranoid than `actions/attempts.ts`**
and says so in its header. A paper is a grade, so its clock is the server's and
nothing from the client is believed. A watched lecture moves a progress bar and
a sidebar tick; marks are what a certificate is computed from. So the seconds
come from the player, and the server does three things instead:

- clamps `secondsWatched` to the video's real duration, which it knows because
  **Bunny measured it** — a forged number cannot claim more watching than the
  video contains;
- never downgrades a completed row, so a re-watch cannot un-finish a lesson;
- re-checks enrolment, because an action is a public endpoint whatever renders it.

Someone determined can still mark a lecture watched without watching it — so can
anyone who plays it at 2x in another tab. That is the honest ceiling for video
anywhere, and the module test behind the module is the real gate.

The heartbeat writes every 15s, but only **revalidates when a screen would say
something different** (i.e. on the transition to completed). Revalidating on
every beat would rebuild the whole tree four times a minute for a field nothing
renders.

#### The stale-model trap (cost an afternoon; read this before debugging a lost field)

A subtopic saved with an uploaded video came back with `video` **missing from
the document** — while the schema, `Subtopic.create()` and the validator each
tested correct in a fresh process.

The cause is the model-caching line every model in this repo ends with:

```ts
(models.Subtopic as Model<SubtopicDocument>) ?? model("Subtopic", subtopicSchema)
```

Mongoose registers models globally on first import. The dev server had been
running since before the `video` field existed, so when HMR re-imported the
edited file, `models.Subtopic` was **already registered from the old schema** and
`??` handed the stale one back. Mongoose then strips unknown paths silently in
strict mode. New validator, new action, **old model** — so validation passed and
the write dropped the field with no error anywhere.

**The rule: after changing anything in `src/models/`, restart `next dev`.** HMR
cannot reload a Mongoose schema. The symptom is always the same and always
silent — a field that validates, saves "successfully", and is not in the
database. `.env.local` changes need a restart for the same reason (Next reloads
env, but already-registered models and already-compiled server components do not
re-derive from it).

### Tailwind v4 specifics

v4 has no JS config file. Styling setup lives entirely in
[src/app/globals.css](src/app/globals.css): `@import "tailwindcss"`, then a `@theme`
block whose custom properties *generate utilities* (`--color-brand-600` → `bg-brand-600`).
All design tokens live there; creating a `tailwind.config.js` will do nothing. Components
should never contain raw hex values — if a colour isn't a token, add the token.

The file also sets a global focus-visible ring and a `prefers-reduced-motion` reset, so
components get both for free.

### Dark mode (2026-09-01)

The bet above paid off: dark mode is a **token flip**, not a `dark:` sweep. There are
zero `dark:` utilities in the app.

`globals.css` now has, after the light `@theme` block, two blocks with identical values
— `:root[data-theme="dark"]` and, inside `@media (prefers-color-scheme: dark)`,
`:root[data-theme="system"]`. **Edit both.** The ink ramp is *inverted* rather than
renamed: `text-ink-900` still means "strongest text", it is just near-white in dark, so
every existing class keeps its meaning.

Three consequences worth knowing before you add a screen:

- **`bg-white` is banned.** Use `bg-surface`. A literal white card stays white in dark
  mode. The old 130 uses were swept; the only survivor is a deliberate `bg-white/10`
  overlay in `CtaBand`.
- **Fixed tokens exist for things that must not flip**: `brand-solid` /
  `-solid-hover` / `-solid-active` (any brand fill carrying `text-white`),
  `success-solid`, `on-gold` (text on a gold fill), and `night-900…300` (always-dark
  surfaces: the marketing footer, the video letterbox, modal scrims). Never redefine
  these in the dark blocks. If you write `text-white` on a fill, that fill must be a
  fixed token — `bg-brand-600` is light blue in dark mode.
- A `dark:` variant is wired up as an escape hatch (both branches, attribute and
  media query) but should stay unused — prefer fixing the token.

**Plumbing.** [src/lib/theme.ts](src/lib/theme.ts) has the type and cookie name (no
imports, so edge and client can share it); `theme-server.ts` reads it, `theme-actions.ts`
writes it. `layout.tsx` renders `<html data-theme>` from the cookie, which is the entire
anti-flash story — "system" is a stored value resolved by a media query, so no blocking
inline script is needed and the OS preference never travels to the server.

The toggle is [ThemeToggle](src/components/ui/ThemeToggle.tsx) (`variant="full"` shows
labels, `"compact"` is icon-only). It lives in the staff sidebar above "Switch view"
(plus the mobile staff header), the student `DashboardHeader`, and `SiteHeader` +
its mobile menu. A component that mounts it must hand it `await getTheme()`; `SiteHeader`
is a client component, so `app/page.tsx` reads the theme and passes it as a prop.

### Fonts

Geist and Geist Mono are loaded in `layout.tsx` via `next/font/google` and exposed as
`--font-geist-sans` / `--font-geist-mono`, which `globals.css` wires into Tailwind's
font tokens.

### Program content management (in progress — 2026-08-25)

The curriculum is moving from a static file to the database, so teachers and
admins can author it. **Partly landed.** Full plan:
`~/.claude/plans/read-project-md-for-understanding-rippling-river.md`.

**Done and verified against Atlas:**

- `src/lib/curriculum/` — `kinds.ts` (subtopic is now video / **text** / **pdf** / quiz),
  `submission-formats.ts` (zip/pdf/image/docx), `rules.ts` (all programme policy
  in one place: 50% pass, 10 warnings, 3 retakes, 24h cooldown, the maxima moved
  out of `data/marksheet.ts`), `types.ts`, `status.ts`, `links.ts`, `format.ts`.
- `src/lib/validation/curriculum.ts` and `validation/attempt.ts`.
- Ten models: `Program`, `Course`, `Module`, `Topic`, `Subtopic`, `Assessment`
  (module test + final test in one collection), `Assignment`, `Submission`,
  `SubtopicProgress`, `Attempt`, plus the shared `question-schema.ts`.
- `npm run seed:curriculum` — idempotent, ported the whole static seed
  (10 courses, 13 modules, 18 topics, 42 subtopics, 20 tests, 7 assignments).
  `-- --with-progress <email>` replays the old statuses as real rows for one
  student; without it every student correctly starts at 0%.
- `src/lib/data/curriculum-db.ts` + `data/progress.ts` — the new read seam. A
  whole program is six flat queries assembled in memory; draft filtering happens
  there once; per-student status is joined in, never stored on content.

**Browsable, in all three staff areas.** The curriculum is now clickable end to
end — program → course → module → topic → subtopic — so what exists can be seen:

Two more modules joined the set since: `lib/data/staff-work.ts` (the loader for
a test or an assignment and its builder) and `canDeleteWork` in
`lib/curriculum/authoring.ts` — both described under "Assessment and assignment
builders" below.

| Area | Route | What they get |
|---|---|---|
| Admin | `/admin/programs/**` | Everything, drafts included, down to a subtopic |
| Teacher | `/teacher/programs/**` | The same screens, scoped to their assignments |
| Manager | `/manager/programs/**` | Read-only, **published only** — the student's view |

The three areas share `CourseDetail` / `ModuleDetail` / `SubtopicDetail` and
differ only in the `CurriculumHrefs` they pass, so the screens aren't
duplicated. Every teacher route goes through `loadTeacherProgram` /
`loadTeacherCourse` in `src/app/teacher/programs/load.ts`, which does
requireRole → assertScope in that order so a screen added later cannot forget it.

**Content is program-wide; the scope that narrows is the cohort.** A teacher
assigned to one batch of a program still authors the whole program's tree —
every cohort studies the same courses, so a per-batch curriculum would be a
second copy of the same material to keep in step. The teacher's area is
therefore still rooted at a program (`My programs`), mirroring the admin's, and
`loadTeacherProgram` still checks `assertScope({ program })` and nothing more.
What batches narrow is **people**: which students they see, whose work they
mark, who their tasks reach, whose register they take. See "Teachers are
assigned to batches" below. `Assignment.courseIds` and `ownsCourse` survive, so
a narrower *content* scope stays expressible, but nothing in the UI sets one.

The subtopic screen doubles as a **preview**: it shows staff what a student will get, including the gaps: a
video with no URL says so, and a quiz marks which option is correct, which is
the thing an author most needs to check and cannot see from the student side.

Verified with real sessions: admin/teacher/manager all render; a teacher hitting
a course outside their assignments 404s; a manager hitting `/teacher/courses` or
`/admin/programs` is redirected; an unknown program 404s.

**Staffing** — see "Teachers are assigned to batches" below, which replaced
staffing-by-program. `/manager/batches/[program]/[batch]` carries the panel that
assigns; `/admin/programs/[program]` and `/manager/programs/[program]` carry a
read-only roll-up of who teaches what, plus the one control a batch panel cannot
express (take somebody off the whole program).

New capability **`program.assignTeacher`**, granted to program managers. It is
deliberately *not* `user.assign`, which is the admin's power to set anyone's
role and assignments anywhere — this grants only "staff a program I manage", and
the action still calls `assertScope` to decide which programs those are.

**Authoring — create, edit, reorder, publish, delete.** Admins and teachers now
write the tree from the browser. Ten routes, mirrored across both areas:

```
/{admin,teacher}/programs/[program]/courses/new              …/courses/[course]/edit
  …/courses/[course]/modules/new                             …/modules/[module]/edit
  …/modules/[module]/topics/new                              …/topics/[topic]/edit
  …/topics/[topic]/subtopics/new                             …/subtopics/[subtopic]/edit
/admin/programs/new                                          /admin/programs/[program]/edit
```

Each route file is a guard plus one shared screen from
`components/staff/curriculum/editors.tsx`, so twenty pages cannot drift into two
behaviours. `lib/data/staff-program.ts` is the single loader for both areas —
requireRole → assertScope, in that order — and `app/teacher/programs/load.ts` is
now a two-line delegate to it.

Every mutation lives in `src/lib/actions/curriculum.ts` and follows the house
order: **requireRole → can() → assertScope → validate → write → writeAudit →
revalidate**. `requireRole("teacher")` admits teachers and admins and never a
program manager, which is the whole of "a manager cannot change content".

Three invariants the write path holds:

- **New nodes start as drafts.** Publishing is a separate act, and publishing a
  parent never publishes its children — a module published with half its
  subtopics still drafts is what a teacher wants mid-write.
- **`order` is contiguous 0..n−1 and `number` is derived from it**, rewritten
  across the whole sibling set on a reorder *and after a delete*. "Module 2"
  cannot end up third, and deleting topic 1 renumbers the survivor to 1. A new
  sibling takes `max(order) + 1`, not a count — an archived sibling still holds
  its position, so counting would hand out a position already taken.
- **Delete cascades; archive is the reversible door.** Deleting a course takes
  its modules, topics, subtopics, assignments, tests and the student progress
  and attempts pointing at them, because a `SubtopicProgress` row aimed at a
  subtopic that no longer exists is a percentage nobody can account for.

**Who may delete what** is `lib/curriculum/authoring.ts`, a table of node types
rather than a role check, because that is what the rule actually is:

| Node | Admin | Teacher |
|---|---|---|
| Program, course, module | delete | archive only |
| Topic, subtopic | delete | delete |

The Delete button and the action read the same `canDeleteNode`, so a control
that renders is a control that works — and where a teacher has no button the row
says who does and points at archiving, rather than hiding silently.

Reordering is two one-button forms per row (`MoveButtons`), not drag-and-drop:
it works without JavaScript, from a keyboard, and on a phone. The action accepts
a whole ordered set, so drag-and-drop can be added later with no server change.

`QuestionBuilder` posts the question list as **JSON in one hidden field** rather
than `questions[0][options][1][text]` name soup — one parse on the server, and
the payload matches `QuestionInput` exactly, so the same validator runs on both
sides. The correct-answer radio sits *in* the option row, because marking the
right answer is the whole reason MCQs can grade themselves.

**PDF subtopics** were added as a fourth kind. Like video, they store a hosted
URL and nothing else, and the student gets the document embedded in the page
plus the same link as a download. The form says that plainly rather than letting
an "upload" label imply a service that does not exist. (There *is* a file store
now — see "File uploads" — but this form is not wired to it yet, so what it says
is still true.)

Verified against Atlas by replaying real form posts as `rohit.teacher@`: created
a course → module → two topics → a published PDF subtopic and a graded quiz
subtopic; moved a topic up and watched the numbering follow; publishing a quiz
with no questions was refused; the draft course was invisible to
`atul.student@`; deleting a topic took its subtopics with it and renumbered the
survivor; a teacher has no course-delete button and is refused when the post is
forged; the manager screen carries no content control and a manager replaying a
real delete form is bounced to `/manager` with nothing written.

**Assessment and assignment builders.** The last dead links inside the tree are
now screens. Eight more routes, mirrored across both areas:

```
/{admin,teacher}/programs/[program]/courses/[course]/tests/final
  …/courses/[course]/modules/[module]/test
  …/courses/[course]/assignments/new    …/courses/[course]/assignments/[assignment]
```

Same shape as the rest: each route file is a guard plus `AssessmentEditor` or
`AssignmentEditor` from `components/staff/curriculum/editors.tsx`, the writes are
`saveAssessment` / `saveAssignment` / `deleteAssessment` / `deleteAssignment` in
`lib/actions/curriculum.ts` in the house order, and `QuestionBuilder` was reused
untouched.

Four decisions worth keeping:

- **A test has no create/edit mode and no key.** A course has one final test and
  a module has one test — the unique partial index on `moduleId` enforces the
  second — so the URL is the identity. `…/tests/final` for a course with no
  final test is a *create*, not a 404, and the action decides create-or-update
  by looking rather than by trusting a hidden `mode`. A form posted twice
  therefore can't mint a second paper for the index to reject.
- **The builder reads the assessment straight from the model, not from
  `curriculum-db.ts`** (`lib/data/staff-work.ts`). That tree hides archived
  content, and an archived test is still the module's test: a builder that
  couldn't see it would offer to create a second one and collide. It also needs
  the questions with their answers and the attempt/submission counts, none of
  which belongs in a view type shared with the student screens.
- **`scope` decides `proctored` and `countsTowardMerit`, never the author.** A
  module test is unproctored and counts toward nothing; a final test is
  proctored and counts. Offering those as checkboxes would let someone build an
  unproctored final paper.
- **`version` bumps only when the questions actually change**, compared field by
  field rather than by stringifying both sides — what comes back from Mongo
  carries the schema's `kind: "single"` default and the form posts only what was
  typed, so a stringify comparison called every save a change and made the
  version meaningless. An attempt freezes the paper it was served along with the
  version, so a teacher can fix a typo in a title without touching a paper
  someone is sitting.

**An assignment's brief comes in two halves, and either can stand alone.**
`brief` is the text a teacher types; `briefFile` is a PDF handed out to every
student on that assignment — the rubric, the printed spec, the dataset
description. Publishing requires *one* of the two, not both: a teacher whose
brief **is** the PDF should not have to retype it into the box, and a rule like
that is one people work around by pasting "see attached".

Four things about it worth keeping:

- **`briefFile` is an embedded document, not a URL string** (`UploadedFile` —
  url, publicId, resourceType, kind, name, bytes). The `publicId` is what makes
  the file deletable; a record holding only a URL is an asset nobody can ever
  clean up. Same shape everywhere, so the next model that stores a file reuses
  the sub-schema rather than inventing one.
- **The posted JSON is re-checked, never trusted.** `parseUploadedFiles` in
  `lib/uploads/kinds.ts` verifies the URL is on Cloudinary's delivery host, the
  public id is under `LMS/` in a known scope, and the kind is one the field
  accepts — otherwise a forged post could store any URL on the internet as
  though we had hosted it. One bad entry rejects the whole payload; a partly
  trusted list is worse than none.
- **A replaced or removed brief is destroyed by the action, not by the field.**
  The upload component only deletes what it uploaded in this sitting, because a
  file that came from the record must survive an abandoned form. Once the save
  has landed that reasoning inverts, so `saveAssignment` deletes the one it just
  orphaned — and `deleteAssignment` does the same for the whole row. Both are
  best effort: a Cloudinary hiccup must never undo a write that has committed.
- **The student's hand-in is still a link.** The teacher uploading a brief and
  the student submitting work are different things, and the form says so — the
  accepted-formats hint had to be rewritten so "there is no upload" didn't sit
  directly under one.

Because the student's assignment screen doesn't exist yet, the brief would
otherwise be uploadable and unreachable, so it sits behind the **⋮ on the course
panel's assignment row**, alongside the hand-in form — see "Handing work in".
The staff tree marks an assignment that has one with "brief attached".

**Who may delete a test or an assignment** is `canDeleteWork` in
`lib/curriculum/authoring.ts`, alongside the node table. For graded work the
honest rule is not about the type — it is about whether a student has already
done the work: a teacher may delete a paper **nobody has sat or handed in to**,
and once there are attempts or submissions it is the admin's call. The button
and the action read the same function, and the button is replaced by a line
saying who can and pointing at archiving.

Verified against Atlas by replaying the real no-JS form posts as
`rohit.teacher@`: all three builders render for admin and teacher; a manager is
bounced to `/manager`; a program outside the teacher's assignments 404s;
publishing a paper with no questions is refused and writes nothing; a created
final test is proctored and counts, a module test is neither and carries its
`moduleId`; a title-only edit keeps `version` at 1 and a question change bumps
it to 2; saving twice leaves exactly one paper; an assignment with no accepted
format is refused, a duplicate key is refused, both ticked formats are kept, and
a teacher deletes one nobody has handed in to; and after an attempt is recorded
the teacher's Delete button is replaced by the explanation, a forged delete post
writes nothing, and the admin still has the button.

**The student screens now read the database.** `data/curriculum.ts` has one
caller left. Everything that used to read the static tree — the curriculum page,
the learning screen, the overview's Resume link, the teacher's landing page and
the admin's assignment picker — goes through `curriculum-db.ts`, and the types
and helpers they share come from `lib/curriculum/` rather than from a data
module. Verified with a real student session: a draft course is invisible and
reappears when published, completing one subtopic moves the student's percentage
while writing nothing onto the shared content, and a locked course 404s when its
URL is typed.

What that changed, beyond the imports:

- **`CoursePanel` takes the curriculum, not just the course**, because
  `entryHref` needs the program around it. Every caller has the tree loaded
  already, which is exactly why that function stayed pure instead of becoming a
  second database read.
- **Tests are no longer rows in the item list.** A `CourseItem` is a module or
  an assignment; the module test belongs to its module and the final test to the
  course, each with its own place. The final-test card now has three real
  states — locked with the reason, open with the way in, or sat with the best
  attempt and whether that passed — instead of one seeded score.
- **The course project card is gone.** There is no `Project` model, so it had
  nothing to read and inventing a status for it would be the fake-metric mistake
  this codebase avoids. The certificate card survives, now *derived* from the
  course being 100% complete rather than a boolean on the seed.
- **An assignment row shows a mark, not a percentage** — `80/100`, because a
  teacher sets what it is out of and "80%" stops being true the moment they set
  it out of 50.
- **The teacher's landing page** lists the programs they author with their draft
  counts and links into them, via `programsForTeacher`. It used to list courses
  that were not links.
- **`assignablePrograms()` is async** and reads real programs and courses,
  drafts included — a program still being written is the normal thing to staff.

**The four subtopic kinds all have a pane now**, because authoring shipped
before consumption did and a teacher could otherwise write a reading that no
student could open. `ReadingStage.tsx` holds the reading and the PDF; `EmptyPane`
is the shared "this lesson has nothing in it yet", which is a real state — a
teacher publishes a subtopic and fills it in over several sittings. These are
deliberately the plain versions: **the reading renders paragraphs, not markdown**
(adding a renderer means sanitising HTML on a page students read, which is worth
doing deliberately rather than as a side effect), and **nothing writes progress
yet** — a student can open every lesson and their percentage will not move on
its own.

`VideoStage` stopped being a placeholder. Teachers can author a link now, so a
link ending in a media extension gets a real `<video controls>` and anything else
gets an `<iframe>`, with an "open in a new tab" line under both because an embed
can be refused by the host. A subtopic with no link at all says so.

**One thing to know until the marksheet is rewritten:** `data/marksheet.ts` is
the last caller of the static tree, so a student's marksheet and their curriculum
page are two different pictures of the same program — the marksheet still shows
the old seed. That is the next piece of work, and `data/curriculum.ts` carries a
header saying not to add a caller in the meantime.

**Not yet done:** writing progress from the student side (marking a subtopic
complete, and the reading/PDF panes recording that they were read), the module
test on the student side (the runner serves final tests and term papers; a
module test has no entry point yet) and teaching `QuizRunner` the three new
question kinds. Grading a hand-in from the teacher's side landed on 2026-09-12
— see "Grading, at last". The assignment hand-in,
the term papers, the test runner and the marksheet rewrite all landed — see
their own sections.

**Two decisions worth knowing:**

- `entryHref`/`resumeHref` did **not** become async. They take an
  already-loaded `ProgramCurriculum`, which every caller has anyway — so
  `lib/curriculum/links.ts` stays pure and client-safe.
- **A course with no published final test does not gate the next course.** A
  freshly migrated database has no authored final tests, and demanding a pass in
  a paper that does not exist makes the whole program impassable. A teacher who
  forgets to publish one leaves that half of the gate open, which is recoverable;
  the alternative is not.

### Mobile: curriculum and the learning screen (2026-09-03)

Two screens reshaped below `lg`. Desktop is untouched in both — the changes are
breakpoint-scoped, not redesigns.

#### Curriculum is a drill-down on mobile

`/dashboard/[program]/course_details` used to put a native `<details>` picker
above the course panel. It hid the thing the page exists to show: the progress
bar, the percentage and the "8 of 12 done" were desktop-only, so a phone got a
collapsed line of text where a laptop got progress. Backwards, for the device
most students use.

Now, below `lg`:

- **no `?c=`** → [CourseCards](src/components/dashboard/curriculum/CourseCards.tsx),
  one full-width tappable card per course with the same progress bar the desktop
  rail has (full width here rather than half — on a phone the card *is* the row,
  so the bar is its main signal rather than one element in a dense list);
- **`?c=<id>`** → an "All courses" back link, a compact course switcher, and the
  panel.

`insideCourse` is the new distinction and **only mobile reads it**: from `lg` the
rail and panel sit side by side, so defaulting to a course is right there and
there is nothing to drill into. The switcher is the old `<details>`, relabelled
for its new job — jumping sideways without going back out.

`CourseRail` now takes an explicit `variant: "rail" | "switcher"` instead of
emitting both behind `lg:hidden` / `hidden lg:block`. The page places the two
shapes in different parts of the layout now, and emitting both would put the
whole course list in the DOM twice.

A locked course still renders as a card and still links: the course page explains
*why*, which is the answer the student wants. Cards use `active:` rather than
`hover:` — a phone has no hover, and a card that only responds to a state touch
devices don't have reads as dead.

#### The lesson owns the phone screen

The outline used to stack above the pane, so every visit to a video began by
scrolling past the whole contents list. Below `lg` it is now a hamburger in a
slim sticky bar and [LearnDrawer](src/components/learn/LearnDrawer.tsx) — a
left-slide drawer with the module switcher (collapsed), the module's handout, and
the topics as animated accordions.

**It is a client component while `LearnSidebar` stays a server one**, and that is
the whole reason both exist. Native `<details>` cannot animate their height, and
a drawer that appears instantly with topics that snap open reads as a page
redrawing rather than a panel opening. So the animated half is framer-motion and
the cost is confined to the breakpoint that needs it; from `lg` the drawer
renders nothing.

Two details that are behaviour, not polish:

- **It closes on navigation, derived during render** — watching
  `pathname + searchParams`, not just the path, because picking another subtopic
  in the same module only changes `?s=` and is the commonest tap in there. An
  effect would close it one paint *after* the new lesson painted behind it.
- **Topics seed their open state from the current topic and are then free**,
  rather than syncing to the prop — re-forcing it open every render would fight
  a student who deliberately collapsed it.

#### A video lesson reads like a video app

[LessonScaffold](src/components/learn/LessonScaffold.tsx) holds the layout;
`VideoStage` still decides which player and signs its URL, because signing must
not go near a client bundle.

Below `lg`: video edge-to-edge at the top in a 16:9 box, then the title, the
meta line, the lesson's one-line description, then the module's handout behind a
button. From `lg`: the title moves above the video via `order`, and the player
goes back to flexing into whatever height is left after the footer.

**`order`, not two branches** — rendering the player twice would mean two
iframes, two sets of progress writes, and a lesson that could mark itself watched
from a player nobody can see.

**The handout opens in place.** Tapping it reveals the document below the title
*without touching the player*, so the video keeps playing while the student
reads. That is why the material arrives as a prop rather than as a route:
`?v=material` replaces the pane, which stops the video. It mounts only when
opened — a six-megabyte PDF should not load for every student who never taps it —
inside a box with a height of its own, because a PDF viewer has no intrinsic
height and would otherwise collapse to nothing or run to hundreds of pages.

**That box has to be a flex column, and for a long time it was not** (fixed
2026-09-04). `MaterialDocument` is `flex-1` inside its own column, which a
*block* parent ignores: the document laid itself out at full length — 5,800 px
for one Word file — the pane never scrolled internally, and the viewer's own
toolbar ended up **five thousand pixels below the fold**. Which is the whole of
the complaint that the handout had no page controls and no zoom on a phone: the
controls existed, on a part of the page nobody could reach. Three things go
with the fix:

- **It scrolls itself to the top of the screen once it has finished opening**
  (`onAnimationComplete`, not the click — the height is still growing). `start`
  rather than `end` because the footer is `sticky bottom-0` and aligning the
  bottoms puts the toolbar under Prev/Next; `scroll-mt-16` does the same job
  for the sticky header. There is no arrangement that shows the video *and* a
  readable document on a 660 px screen, so the controls win and the video plays
  on above.
- **The height is the screen less the header and footer** (`calc(100dvh-8rem)`),
  since the scroll makes that the whole of what the reader sees. `dvh`, not
  `vh`, which on a phone measures against the viewport with the URL bar hidden.
- **The bleed moved to the clipping wrapper.** `-mx-4` on the inner box widened
  it to the screen while the animating wrapper went on clipping at the sheet's
  padding, which quietly cut the right-hand end off the toolbar — the zoom-in
  button included. The box keeps a `px-3` gutter of its own instead.

`subtopic.caption` is rendered again after being dropped when it was a grey line
under the player nobody read. Under the title on a phone it is the description it
was written to be.

Fullscreen and landscape are **the player's own**: Bunny's iframe and the native
`<video>` both have a fullscreen button and phones rotate from it. A control of
ours could not reach inside Bunny's iframe anyway — it would only stretch our
frame around an unchanged video.

#### Verified

Rendered against a real session on the dev server, not just compiled: the
top-level curriculum page returns 200 with the cards and the panel hidden behind
`hidden lg:block`; `?c=` returns 200 with the back link, the switcher and the
panel; the learn screen returns 200 with the hamburger, the desktop sidebar and
the study-material button all present. (That student had a ₹50,000 fee paid in
mock mode, so the gate was legitimately open — worth saying, since a 200 on a
gated route otherwise proves nothing.)

**Not clicked through in a browser.** Every interaction added here is
client-side — the drawer opening, the accordions animating, the handout
expanding — and none of it has been exercised by a human or a headless browser.
The markup and the props are right; the motion is unproven.

### Fees and payments (2026-09-03)

Course fees, collected through **Razorpay**. **Both routes are built**: one-time
payment as an Order, and instalments as a Subscription (2026-09-07). Progressive
module unlocking by cycle is the remaining piece — see "What is expected next".

#### The student's path

```
admin creates the student → enrols them on a program + batch → sets a fee plan
      ↓
student signs in with the temporary password → forced password change
      ↓
/dashboard         amber notice at the top, naming the program and the amount
                   the program's card reads "Payment pending", button = "Pay fees"
      ↓
/dashboard/[program]/fees      what's included, the price, one Pay button
      ↓
Razorpay Checkout → verify → /dashboard/[program]/overview
```

Typing a course URL directly gets a **redirect to the fee page, not a 404**. That
is a deliberate departure from the house `notFound()` rule in `auth/guards.ts`:
that rule is right for a program a manager doesn't run, where "you may not see
this" still confirms it exists. Here the student *knows* they are enrolled — an
admin told them and it is on their dashboard — so a 404 reads as a broken site
and produces a support ticket instead of a payment.

#### The gate is a route group

`src/app/dashboard/[course]/(paid)/layout.tsx`. `(paid)` does not appear in any
URL; it exists so `/dashboard/[course]/fees` can sit one level up, **outside**
the gate. A layout directly on `[course]` would gate the fee page too and
redirect it to itself forever.

One gate, not seven — the seven pages under it were moved into the group rather
than each growing its own check, because the eighth is the one somebody forgets.
`/learn/[program]/…` is the other door into the same lessons and is not under
that layout, so it carries the same call itself. A gate on one of two doors is
not a gate.

#### The price, and who pays what

**`Program.feeAmount` is what gets charged. `Program.listAmount` is what it is
discounted from** — display only, struck through on the student's page, and
never charged. Two explicit amounts rather than a `discountPercent`, because a
percentage has to be recomputed into money before it can be checked, and a
struck-through price nobody ever paid is exactly the thing an advertising
regulator asks about. `listAmount` must be **strictly greater** than the fee;
equal is refused too, since a discount of nothing is not a discount. Clearing the
fee clears the struck price with it.

**`Enrollment.customFeeAmount` is a price for one student** — the scholarship,
the staff child, the fee agreed over the phone. Admin-only, audited with both the
old and the new figure. Precedence is one line in `getFeeStatus`: custom price,
then the chosen plan's total, then the program's fee.

Three things about it that are decisions rather than details:

- **₹0 is a free seat**, and is distinct from having no custom price. Hence
  `customFeeAmount !== null` throughout rather than a truthiness test — a
  truthy check would silently charge a free student the full fee.
- **A custom price withholds instalment plans.** A plan's schedule adds up to
  that plan's own total; against a custom price the arithmetic no longer closes,
  and charging somebody a schedule that does not match the figure they were
  promised is worse than not offering it. Setting one clears any plan already
  chosen.
- **It also drops the struck-through price.** "Was ₹34,999, now ₹12,000 —
  just for you" invites a comparison the student was never offered; the list
  price is a claim about the public price, not about their arrangement.

`setCustomFee` refuses a price **below what they have already paid**, rather than
creating a phantom credit the fee page would then have to explain. Setting it to
exactly what they have paid is allowed, and is how a balance gets written off.

#### The fee is read-only until you ask

The price used to sit in a live input on a screen admins open to read a roster.
Now it renders as text behind a **Change pricing** button, and saving is
confirmed — but only when somebody is part-way through paying, because a dialog
on every edit is a dialog nobody reads. The dialog says how many students that
is, and the collapsed view says it too.

The confirmation earns its place: repricing moves the balance of everyone still
paying, since the ledger records amounts rather than percentages. Nothing already
settled is refunded or re-charged.

Both this form and the per-student one close on success by **deriving state
during render** (compare against the previous `state.ok`, act on the transition)
rather than in a `useEffect`. The effect version is the cascading-render
antipattern the lint rule flags, and closing on `state.ok` alone would jam the
form shut, because `ok` stays true until the next submit.

#### The roster, by cohort

`FeeRoster` is one client island over `groupRosterByBatch`: a **search box**
across name and email, **batch filter chips**, and a group per cohort carrying
its own collected/outstanding/unpaid subtotals.

- **Filtering is client-side.** A roster is hundreds of rows and arrives with the
  page; a round trip would put a spinner between an admin and a name already on
  screen.
- **Subtotals recompute against what is visible.** A header reading "₹2.4L
  outstanding" above three rows owing ₹30,000 is a number nobody can reconcile.
- **Groups survive a search** rather than flattening into one list — which cohort
  somebody is in is part of the answer to "who do I ask about them".
- Batches sort by **who owes most**, and the no-batch bucket always sorts last:
  it is a data-tidiness problem, not a cohort, and it should not head a screen
  about chasing money.

#### Paying in full is not a plan

**`Program.feeAmount` is the fee.** Paying it in one go needs nothing else — a
one-time payment is a Razorpay *Order*, created per payment. Only instalments
need a Razorpay *Plan*, so only instalments get a `FeePlan` row.

That is the whole reason there is no "pay in full" plan, and it is worth stating
because an earlier cut of this feature had one. A `kind: "full"` row would be a
fake plan mirroring nothing on Razorpay's side, and it would make "you can always
pay in full" a rule somebody has to remember not to break rather than a fact
about the shape of the data. **There is no row to archive, so the option cannot
be taken away.**

So a program offers: paying in full, always, plus up to
`MAX_FEE_PLANS_PER_PROGRAM` instalment schedules. Three, because a fourth card
turns a choice into a comparison exercise. The cap counts *active* plans, so a
program whose terms have been revised twice is not locked out of ever offering a
second schedule.

**`Enrollment.feePlanId === null` means "paying in full"**, not "hasn't decided".
That matters: it means there is no state a student can get stuck in. Someone who
never opens the chooser owes the full fee, which is correct, and the Pay button
is there from the first visit. Whether fees apply at all is a fact about the
*program* (`feeAmount === null` → free to reach), never about the enrolment —
which is what keeps every pre-fees enrolment working untouched.

An EMI plan carries **its own `totalAmount`**, usually more than the base fee,
because paying over time normally costs more. So switching plans changes what is
owed, and switching back to full re-prices against `Program.feeAmount`.

#### Choosing, and changing your mind

`chooseFeePlan` (`actions/fee-choice.ts`) is the student's action. Free choice
until money has moved; after that **the only move left is back onto paying in
full**. That exception is the point rather than a loophole — a student who signed
up for instalments and later comes into the money must have somewhere to settle
up, and the arithmetic already works, since `amountDue` is `total − paid`.

Every other post-payment switch is refused: moving between plans of different
totals rewrites what somebody owes — a cheaper one silently marks them paid up, a
dearer one reopens a settled fee. A full fee *lower* than what they have already
paid on a dearer plan is refused too, rather than handing out a course and a
silent credit.

**Staff recommend, they do not assign.** `Enrollment.recommendedFeePlanId` badges
one option on the student's chooser and does nothing else. It is a separate field
from `feePlanId` precisely so the two cannot be confused: one is what somebody
was advised, the other is what they chose, and collapsing them would turn a
suggestion into an assignment the first time anyone read the wrong field. Because
a suggestion cannot change what anybody owes, it stays editable for the life of
the enrolment — no "already paid" lock.

**Instalment plans are collectable when they have a Razorpay plan behind them.**
`FeePlanOption.available` is `Boolean(plan.razorpayPlanId)` — truthiness, not a
null test, so a query that forgot to select the field fails closed rather than
offering a plan with nothing behind it. `createFeePlan` mints the Razorpay plan
*before* it writes the row, so anything created from now on is live immediately.
Rows predating this keep `razorpayPlanId: null` and stay visible-but-unpickable,
which remains the honest answer for them: the terms were agreed with somebody and
nothing exists to collect them. They cannot be back-filled — a plan minted later
would be a different object from the one those terms describe. Re-create instead.
`chooseFeePlan` refuses unavailable plans independently of what renders.

The chooser itself only appears when there is more than one option — a list of
one card is a question nobody asked.

An **archived plan still resolves** for whoever is already on it. It leaves the
menu but keeps its terms: a student who signed up at last term's rate keeps that
rate, and archiving must never silently reprice anyone.

#### Three collections, and one field

| | Holds | Rule |
|---|---|---|
| `Program.feeAmount` / `listAmount` | the fee, and the price it's cut from | editable, behind a Change button |
| `FeePlan` | one instalment schedule | append-only, archived never deleted |
| `Payment` | the ledger, one row per attempt | write once, settle once, never edit |
| `Enrollment.feePlanId` | their instalment plan, or null for in full | a choice, never a total |
| `Enrollment.recommendedFeePlanId` | what staff suggest | advisory, never binding |
| `Enrollment.customFeeAmount` | one student's own price | admin-only; ₹0 is a free seat |

**Nothing about money is stored as a running total.** How much has been paid,
whether a student is paid up, which instalment they are on and how many are left
are all counted from the ledger by `lib/data/fees.ts`, which is the only thing
that counts them. Same rule the curriculum already runs on — progress is derived
from the tree and never stored on the enrolment, "so it can never contradict the
screens that count".

The concrete failure that prevents: Razorpay **retries webhooks**, and they can
arrive out of order. A stored `installmentsPaid++` double-increments on a retry
and unlocks a module nobody paid for. Counting rows behind a unique index cannot.

`getFeeStatus` is the single answer to "has this student paid?" — the banner, the
card, the gate, the fee page and the staff roster all call it. Two definitions of
"paid" is how a dashboard invites somebody into a course the gate then throws
them out of.

**Money is paise, everywhere.** `3499900` is ₹34,999. Integers, never floats —
`0.1 + 0.2 !== 0.3`, and a fee summed from float rupees eventually tells a
student who has paid in full that they owe a paisa. Razorpay takes paise too, so
there is no conversion at the boundary, which is where conversions go wrong.
`lib/payments/money.ts` is the only place rupees and paise meet.

**An enrolment with no fee plan is not gated.** `feePlanId: null` opens the
program exactly as before this feature existed. Treating "unconfigured" as
"unpaid" would lock out every enrolment made before today, which is a worse
failure than a forgotten plan — and the admin fees screen shows unpriced students
in amber, so a forgotten one is visible rather than silent.

#### Two routes settle a payment, and they race on purpose

- `POST /api/payments/verify` — the browser came back from Checkout. A
  **convenience**: it makes the course open immediately instead of whenever
  Razorpay's queue gets to us.
- `POST /api/webhooks/razorpay` — **the mechanism**. A student who pays and closes
  the tab is let in by this and nothing else, and every future EMI instalment
  happens with no browser open at all.

Both call `capturePayment` in `lib/payments/settle.ts`, which is idempotent the
only way that holds: a conditional update matched on the row's status, so of two
concurrent calls exactly one writes. Reading then deciding would leave a window
where both see `created`.

Two things there that look like details and are not:

- **`failed` is in the capture match.** One Razorpay order accepts several
  attempts — a declined card then a successful UPI produces `payment.failed`
  followed by `payment.captured` on the same row. Matching only `created` would
  let the failure lock the row and silently drop real money.
- **The unique index on `razorpayPaymentId` is partial, not sparse.** A sparse
  unique index still indexes an explicit `null`, so the second unpaid row would
  collide with the first. It matches `$type: "string"`, indexing only rows that
  have actually been paid.

#### Verified against real test keys (2026-09-07)

Razorpay test keys are in `.env.local`, so `mode()` is now **live** in
development, not mock. `npm run check:razorpay` creates a real ₹1 order against
the API, reads it back, and exercises both HMACs including the cases they must
refuse; `node --env-file=.env.local qa/check-doublepay.mjs` drives the browser.
Neither charges anything. Two real bugs came out of that first run:

- **A receipt is NOT an idempotency key.** The order route relied on Razorpay
  refusing a repeated `receipt`, which the docs imply and the API does not do —
  uniqueness is an account setting, off by default, and two creates with one
  receipt returned two order ids. A double-clicked Pay button therefore opened
  two orders and could take two payments. The guard is ours now, in two layers:
  a **partial unique index on `{enrollmentId, kind}` where `status: "created"`**
  (at most one open intent per enrolment; the route upserts against it), and a
  **conditional `razorpayOrderId: null` claim** after the order is created, so
  simultaneous requests that all minted their own order still hand every caller
  the same one. Losing orders are abandoned unpaid — an order is not money.
  Verified: six clicks, one row, one order.
- **A webhook carrying an id we did not issue 500d.** `notes.paymentId` went
  straight into `findById`, and a non-ObjectId string threw a CastError — a 500
  is exactly what makes Razorpay retry for hours, and the route's own docs say
  such an event should be acknowledged and ignored. `looksLikeOurId` in
  `settle.ts` guards both `capturePayment` and `failPayment`; `/api/payments/verify`
  had the same hole from its request body and now 404s instead.

**Test cards — use a DOMESTIC one.** `4111 1111 1111 1111`, the card in every
generic tutorial, is read by Razorpay as *international*, and the account accepts
domestic payments only until international is applied for and approved. It fails
at `payment_initiation` with `international_transaction_not_allowed` — nothing to
do with our code. Use:

| | Card | Result |
|---|---|---|
| Visa debit | `4100 2800 0000 1007` | success |
| Mastercard credit | `5555 5100 0008 1006` | success |
| Visa debit | `4100 2800 0006 0003` | `card_declined` |

Any future expiry, any CVV. OTP: 4–10 digits succeeds, under 4 digits fails.

**Consequence for the QA suite:** `qa/phase8-fees.mjs` assumes mock mode ("the
intended route past the gate") and FEE-04 pays by simulation. With keys present
that route is gone. Clear the two `RAZORPAY_KEY_*` values before running phase 8,
or rewrite it against a test card.

#### Three signatures, three different secrets

Easy to get wrong, so all of it lives in `lib/payments/razorpay.ts`:

| | Formula | Secret |
|---|---|---|
| Checkout reply | `HMAC(order_id + "\|" + payment_id)` | `RAZORPAY_KEY_SECRET` |
| Webhook | `HMAC(rawBody)` | `RAZORPAY_WEBHOOK_SECRET` |
| Subscription reply | `HMAC(payment_id + "\|" + subscription_id)` | `RAZORPAY_KEY_SECRET` |

Note the operands reverse between the first and the third. The webhook body is
read with `request.text()` and hashed as the exact bytes that arrived —
`request.json()` reorders keys and the hash then never matches, the same note the
Bunny webhook carries.

The verify route uses **our** stored order id, never the one in the request body:
verifying a pair the caller supplied only proves they can compute an HMAC.

#### Mock mode

No SDK — Razorpay is plain `fetch` against a documented HTTP API, the same trade
made for Cloudinary and auth. `mode()` returns one of three:

- **live** — keys set. Real orders, real money.
- **mock** — no keys, and not production. Orders are minted locally with an
  obvious `order_mock_…` id, the fee page carries an amber "this is a test
  payment" banner, and pressing Pay settles the fee without charging. This is
  what let the whole flow be built before a Razorpay account exists, the same way
  `googleCalendar.ts` hands out a mock Meet link.
- **off** — no keys, in production. The Pay button is disabled and says so.

**There is no path from mock to a live student.** The mode is decided from
`NODE_ENV` on the server, never from a request, header or query string.

#### Admin

`/admin/programs/[program]/fees`, in the order the decisions happen:

1. **The fee** — one number, and the whole of paying in full. Editable, unlike a
   plan: it mirrors nothing on Razorpay's side, so there is no immutable object
   to drift from, and a price that could never be corrected would be its own
   problem. Blank means the program is free to reach, which is a legitimate
   choice and an easy oversight — hence the amber banner when it is unset.
2. **Instalment plans** — `n of 3`, form closed at the cap and refused entirely
   until a fee exists, because a schedule for paying an unknown number is not a
   schedule. Added and archived, never edited: a Razorpay plan is immutable on
   their side, and terms somebody already signed up on must not move under them.
3. **Who has paid** — grouped by batch with per-cohort subtotals, searchable by
   name or email, with a **recommendation dropdown** and a **custom-price
   control** on each row. The dropdown submits on change (one field, so a Save
   button would be a second click for nothing) and never locks, because a
   suggestion cannot change what anybody owes; the price control is collapsed
   behind a button, because it does.

**The enrol form deliberately has no fee picker.** Its job is putting somebody on
a program, and a plan dropdown there would imply the choice is the admin's —
which is exactly what it is not. Recommending one on the fees screen straight
after enrolling costs one click and says the right thing about who decides.

`fee.manage` is admin-only. A program manager holds `fee.view` — chasing a
cohort's unpaid fees is cohort work — but not the power to reprice a program.

#### Verified

Driven against Atlas with real rows, then cleaned up. Payments: no-plan opens the
program; a plan set and unpaid blocks it; capture flips it; a replayed capture is a no-op
and does not double-count; a failed-then-captured row still lands; an amount
mismatch is refused and the row marked failed; a duplicate `razorpayPaymentId` is
rejected by the index while two unpaid rows coexist; the roster reads correctly.
The EMI validator's arithmetic and the ₹15,000 warning were exercised too.

Plan choice, separately: a program with no fee opens and its roster is empty; a
fee alone yields exactly one option (pay in full) which the student is already
on; three EMI plans make four options with full leading and every instalment
marked not-collectable; a recommendation badges a card without moving anybody
onto it; being on an EMI plan prices against *that plan's* total, not the
program's; a captured instalment locks `canChoose`; switching back to full
re-prices against `Program.feeAmount` minus what was paid; a one-time payment row
carries no `feePlanId`; an archived plan leaves the menu; clearing the fee
reopens the program.

Pricing and cohorts, separately: a list price above the fee validates and one
equal to or below it does not; a list price without a fee is refused; the
discount reaches the student's option; a custom price overrides the program's,
withholds instalment plans, beats a plan already chosen, and drops the struck
price; ₹0 reads as a priced free seat rather than an unpriced program; the roster
labels a custom row and clears its plan; batches group with correct subtotals,
the no-batch bucket sorts last, a capture moves that cohort's collected and
outstanding figures, and clearing a custom price restores everything.

**Not clicked through in a browser.** Checkout itself has never been opened — the
`PayPanel` flow, the `PlanChooser` cards, the amber banners and the card's unpaid
state were verified through the actions, the types and the build, not by hand.

#### Instalments, as built (2026-09-07)

The collecting half now exists. Shape, end to end:

1. **`createFeePlan`** POSTs `/v1/plans` and stores the returned `razorpayPlanId`
   on the row — Razorpay first, then Mongo, so a failure leaves no dud option.
2. **`POST /api/payments/subscription`** creates one subscription per enrolment
   against that plan, `total_count` = the schedule's cycles, the down payment as
   an `addons[]` entry. The id is kept on `Enrollment.razorpaySubscriptionId` and
   **reused** while Razorpay still reports it live, so a second press authorises
   one mandate rather than two.
3. **Checkout opens with `subscription_id`** and no amount — Razorpay prices the
   authorisation from the plan and its addons.
4. **`subscription.charged`** records each cycle. `/api/payments/verify` handles
   the return trip as a fast path, exactly as the order flow does.

Three things about this are worth keeping in mind, because each is a trap:

- **A subscription's `notes` are on `payload.subscription.entity`, not on the
  payment.** Reading `payment.entity.notes` — the obvious move, having written
  the order flow first — silently finds nothing, and every instalment goes
  unrecorded while the webhook returns a cheerful 200.
- **EMI rows are created by the settle path, not pre-allocated.** Nobody knows
  in advance how many cycles will be paid, so there is no row to transition.
  `captureSubscriptionCycle` upserts on `razorpayPaymentId`, which makes the
  partial unique index on that field load-bearing for the first time: it is the
  only thing standing between a replayed webhook and a double-credited student.
- **`cycleNumber` is Razorpay's `paid_count`, never our row count.** The down
  payment rides inside the first transaction rather than being a cycle of its
  own, and an out-of-order replay would move a computed count backwards.

Verified against the live test account by `qa/check-subscription.mjs`: mandate
created and reused, cycle 1 recorded at ₹14,999 (down payment + first
instalment), three concurrent replays of one event writing exactly one row,
cycles 2-9 accumulating, and the ledger closing at ₹54,999 exactly.

**Still to build: progressive module unlocking.** `FeePlan.unlockSchedule` is
modelled — "once cycle N is paid, modules up to order X open" — and is written
as `[]` by `createFeePlan`, with no admin UI to fill it in and nothing reading
it. The gate today is binary: `getFeeStatus().isPaid`, whole course or none of
it. `cyclesPaid` is already counted correctly, so the read side is half done;
what is missing is the admin screen and a gate that consults the table.

**It is a Razorpay Subscription, not "EMI".** Razorpay's own EMI product
(`method: emi`) is a bank loan: the merchant gets the full fee on day one and the
bank carries the student. That is a different business, and worth knowing exists
— it is nearly free to enable on the one-time flow. What was asked for here is
mandate-based instalments, which is Subscriptions.

**A Razorpay plan is thinner than it looks.** It holds only `period`, `interval`
and `item.amount` — "₹8,000 every month, forever". It has no idea how many
months, and no concept of a down payment. So of the fields on `FeePlan`:
`period`, `interval` and `cycleAmount` duplicate the Razorpay plan (safe,
because it is immutable); `totalCycles` and `upfrontAmount` exist nowhere on
Razorpay's side until a student signs up, becoming `total_count` and `addons[]`
on the *subscription*; `unlockSchedule` is ours alone. And nothing at all
corresponds to paying in full, which is why that is `Program.feeAmount` rather
than a plan.

**The constraint that shapes the whole design: RBI caps frictionless auto-debit
at ₹15,000 per transaction** on cards and UPI AutoPay. Above it the student must
authenticate every single debit, which is not an auto-debit and collects badly.
Education is not one of the exempted merchant categories (mutual funds, insurance,
credit card bills). e-NACH clears much higher but takes days to register rather
than seconds. `validateFeePlan` warns above ₹15,000 rather than refusing, because
a bigger instalment is a decision, not a mistake.

**Instalments must sum to the total exactly.** Every cycle of a Razorpay plan is
the same amount — there is no smaller last instalment — so an arbitrary total
rarely divides evenly and the remainder goes in the down payment, which is an
addon and therefore free to choose. Already enforced.

**Unlocking is a written table, not arithmetic.** `unlockSchedule` is
`[{ afterCycle, throughModuleOrder }]`, set by an admin. Proportional maths
(`paidCycles / totalCycles × moduleCount`) produces fractional modules, silently
re-gates everyone when a teacher reorders the curriculum, and cannot express
"cycle 1 opens three short modules, cycle 2 opens one long one".

Still to do, in order: enable Subscriptions (and possibly eMandate) on the
Razorpay account — separate approvals, weeks not days; get the ₹15,000 answer in
writing from the account manager for an education MCC; decide the grace policy
for `pending` (Razorpay retries T+1, T+2, T+3) and `halted`; then create-plan and
create-subscription calls, the subscription branch of `getFeeStatus`, and the
subscription webhook events — which are already listed in
`/api/webhooks/razorpay` as explicitly unhandled so the next person can see what
is expected.

Access, when it lands, should **stop future unlocks rather than revoke earned
ones**. Clawing back paid-for modules is what generates refund demands.

One thing the current gate will need changing for: it is `isPaid`, which is right
while everybody pays in full. An EMI student must get in after their *first*
instalment, with `unlockSchedule` deciding how far — so the gate becomes "has
started paying" plus a per-module check, not "has paid everything".

## Where things stand

What is built, what is fake, and what will bite you.

**Working end to end, against Atlas:**

- Marketing site → enquiry dialog → `POST /api/enquiries`.
- Sign in → role-correct area → sign out; forced password change on a temporary password.
- Admin → create/edit/suspend people, assign programs and courses.
- Program manager → schedule a session → the student sees it → mark attendance → the
  student's percentage changes.
- Admin → set a program's fee → assign it to a student → that student's dashboard shows
  the notice and the gate closes → payment settles → the course opens. Verified against
  Atlas end to end **except Checkout itself**, which needs Razorpay keys; without them the
  app runs in mock mode outside production. See "Fees and payments".

**The database is `lms_db`** on a shared Atlas cluster that also holds unrelated client
databases, including the live `course-unbox-db` (blogs, 90 real enquiries, programs).
`MONGODB_DB` is what scopes us to `lms_db` — `db.ts` passes it as `dbName`, which
overrides whatever is in the URI path. Don't point it at `course-unbox-db`: our `Enquiry`
model maps to `enquiries`, which there holds real leads.

**Static placeholder data**, each behind one lookup function that is the seam to swap for
a database read (all of them return `null` for "no such thing *or* not enrolled", which
the pages turn into a 404):

| Module | Seam | Feeds |
|---|---|---|
| `data/course-overview.ts` | `getCourseOverview(slug)` | overview metrics only — its schedule is real now |

`Submission` is now written as well as read: a student hands in from the
curriculum page, and the row is what opens the next course.

Real database reads now: `User`, `LiveSession`, `Attendance`, `Batch`, `AuditLog`,
`Enquiry`, and
the whole curriculum — `Program`, `Course`, `Module`, `Topic`, `Subtopic`, `Assessment`,
`Assignment`, `SubtopicProgress`, `Attempt`, `Submission` — via `data/people.ts`,
`data/sessions.ts`, `data/manager-sessions.ts`, `data/curriculum-db.ts`,
`data/curriculum-staff.ts`, `data/staff-program.ts`, `data/staff-work.ts`,
`data/batches.ts` and `auth/guards.ts`.

Only two programs have curriculum seeds: `performance-marketing` (in progress) and
`ai-marketing` (completed). Any other slug 404s on the signed-in pages — that is correct
behaviour, not a bug. Seed depth is uneven on purpose: `pm-c1` and `pm-c4` have full
module/topic/subtopic trees, the rest have one or two modules.

**Known gaps — links that point at routes which don't exist yet** (they 404; the screens
were never in scope):

- `/dashboard/[slug]/assignments/[key]` — the student's hand-in screen. Not a
  dead link any more so much as a screen that never got built: the brief and the
  hand-in form live behind the ⋮ on the assignment row instead. See "Handing
  work in".
- `/dashboard/[slug]/placement`, `/dashboard/[slug]/sessions/[id]` — overview cards
- `/dashboard/forum`, `/refer` — header, banner
- Staff screens shown as disabled "Soon" in the sidebar: `/admin/enquiries`,
  `/admin/settings`, `/manager/enquiries`
  (`/admin/audit` and `/teacher/grading` are built — see "Audit log" and
  "Grading, at last")

**Other things to know:**

- **Enrolments are real.** `Enrollment` rows decide who is on a program, the
  attendance roster is scoped to them, and the dashboard reads the same rows the
  staff roster does. `npm run seed:enrollments` migrated the old static array.
- **Video is uploaded for real** — teachers pick a file, it goes browser→Bunny
  over TUS, Bunny encodes it, and students watch it in Bunny's player through a
  server-signed embed URL (see "Lesson video"). Pasting a link still works and
  is still the fallback when Bunny has no keys. **Written but not yet run
  against a live Bunny account:** `npm run check:bunny` first, then click the
  authoring form. Quiz results are still not persisted — `QuizRunner` state dies
  with the page — and **nothing on the learning screen writes progress yet**, so a
  student's percentage only moves for rows seeded by
  `npm run seed:curriculum -- --with-progress`.
- **Video completion is wired** (2026-08-31). `VideoPlayer` listens to Bunny's
  player.js (`timeupdate`/`ended`) and calls `recordVideoProgress`, which writes
  `SubtopicProgress` — the first thing in the app to do so outside the seed.
  Completion fires at `ended` **or 95%**, whichever comes first, because the
  tail of a lecture is usually an outro. A linked media file reports the same
  way through native `<video>` events; a link to a *page* that embeds someone
  else's player (YouTube, Drive) has no signal and cannot self-complete.
  **Text, PDF and assignment subtopics still have no way to be completed** —
  there is no "mark as done" control anywhere, so only video and quiz move a
  percentage.
- The three footer tools on the learning screen (Q&A forum, Test your code, Practice
  questions) are inert buttons.
- `Subtopic.caption` exists but is no longer rendered (see the learning-screen notes).
- `EnquiryDialog` duplicates the `Modal` primitive's logic; see Decisions.
- **Admin can open `/dashboard`** and sees the static student view. Harmless, but it is
  the superset rule leaking somewhere it wasn't designed for.
- **No email anywhere.** New accounts and password resets are passed on by hand.
- The write paths were verified at the data layer and by HTTP guard checks; the forms
  themselves (create person, schedule session, mark attendance) have not been clicked
  through in a browser.

## Commands

```bash
npm run dev     # dev server on http://localhost:3000
npm run build   # production build (verified passing)
npm run start   # serve the production build
npm run lint    # eslint
npm run seed    # create the first admin + one account per role (idempotent)
npm run check:cloudinary   # sign, upload and delete one file of each kind
npm run check:bunny        # create, TUS-upload, read back and delete one Bunny video
npm run seed:enrollments   # enrol the seeded students (idempotent)
npm run reset:data         # DRY RUN: report what a wipe would delete
npm run reset:data -- --yes --db=lms_db   # actually wipe it
```

## Other files in the repo

- `AGENTS.md` — auto-generated and re-added by `next dev`. Warns that Next 16 differs
  from older training data and points at `node_modules/next/dist/docs/` for current
  API docs. Don't delete it; it comes back.
- `CLAUDE.md` — one-line pointer to `AGENTS.md`, also generated.
- `project.md` — this file. The hand-written one.

## Git

Repo initialized by `create-next-app` with the scaffold as the initial commit.
No remote configured.

## Decisions

- **2026-08-20** — Scaffolded with `create-next-app` using: TypeScript, Tailwind,
  ESLint, App Router, `src/` directory, `@/*` alias, npm. Because npm rejected the
  capitalized `LMS` directory name, the project was generated in a temp dir as `lms`
  and moved in; nothing about the result differs from a direct scaffold.

- **2026-08-20** — Design system written to [design.md](design.md), tokens implemented in
  `globals.css`, `framer-motion` + `lucide-react` installed. No third-party UI kit: we
  build primitives on the tokens so the app matches the client's brand exactly. Light mode
  only. Mobile and desktop are the two first-class breakpoints (tablet must work but isn't
  designed for).

- **2026-08-20** — MongoDB Atlas chosen as the database, accessed through **Mongoose**
  rather than the raw driver: the Course→Module→Lesson model benefits from schemas,
  validation, and populate, and role-based documents get real typing. Schema files will
  live in `src/models/` (one model per file, guarded with
  `models.X || model("X", schema)` so hot reload doesn't redefine them).

- **2026-08-20** — Public home page built with static content. No UI kit, no CMS yet:
  content lives in a typed module so the eventual database swap is a one-file change.

- **2026-08-20** — Enquiry form kept to four fields (name, mobile, email, program) after
  an initial version with topic and message. Shorter lead forms convert better and the
  counsellor collects the detail on the call. `Enquiry` is the first Mongoose model;
  it carries `status` (new/contacted/enrolled/closed) for the future admin view.

- **2026-08-21** — Curriculum page built at `/dashboard/[course]/course_details` (the
  path mirrors the Internshala reference URL). Module selection kept in the query string
  so the page needs no client components at all; lessons, assignments and assessments
  unified into one `ModuleItem` type rather than three parallel lists.

- **2026-08-21** — Learning screen put at `/learn/...`, outside `/dashboard`, because it
  is a different mode: full-bleed workspace, its own scroll behaviour, no dashboard
  chrome around the content.

- **2026-08-21** — Settled the hierarchy at five levels: **Program → Course → Module →
  Topic → Subtopic**, replacing an earlier four-level shape where the top level below a
  program was called "module". A real module level was inserted rather than renaming the
  existing ones, so `/learn/[program]/[course]/[module]` now means literally what it
  says. `data/course-curriculum.ts` and `data/learn.ts` were merged into
  `data/curriculum.ts` — the two files described the same tree and would have drifted.

- **2026-08-21** — Marksheet built. Marks are *derived* from the percentages already on
  the curriculum tree so the two screens cannot disagree; the maxima are constants in
  `data/marksheet.ts`. Module-test results are seeded there rather than on the tree,
  because a mark belongs to a student and the tree is the shared syllabus.

- **2026-08-21** — `Modal` extracted as a UI primitive (scroll lock, focus trap, Escape,
  focus restore) for the graduation-criteria dialog. `EnquiryDialog` still has its own
  copy of that logic — deliberately not migrated, since it is the one flow that writes to
  the database and tidiness isn't worth destabilising it.

- **2026-08-24** — Live sessions built, student side first
  (`/dashboard/[course]/sessions`): attendance band with a details dialog, upcoming /
  completed tabs, filters as URL state. Session **kinds** (`learning`, `placement`) were
  fixed then, chosen so the admin panel would schedule into the same vocabulary.

- **2026-08-24** — **Auth: own cookie sessions**, not Auth.js or Clerk. Two small deps
  (bcryptjs, jose), and the user records and role field stay ours — consistent with a
  codebase that builds its own primitives on its own tokens. Auth was built *before* any
  staff screen, so no screen was ever written against a fake role.

- **2026-08-24** — **Four roles in one `User` collection**, not four collections: they
  share everything that matters and differ only in `role` and `assignments`. Assignments
  are embedded rather than a join collection — few, always read with the user, only ever
  written by an admin.

- **2026-08-24** — **Admin is a superset**, implemented as one line in `requireRole`
  rather than admin-only copies of the manager and teacher screens.

- **2026-08-24** — **Program manager owns the timetable as well as the cohort**: they
  schedule sessions and assign teachers. The teacher is content-and-grading only. Decided
  with the client; the alternative (teachers schedule their own sessions) was rejected.

- **2026-08-24** — **The proxy is a redirect, not a guard.** It cannot see the database,
  so every layout, page and action re-checks with `requireRole`. Server actions re-check
  independently of the page that renders their form, because an action is its own front
  door.

- **2026-08-24** — Attendance kept as a separate collection with a unique
  `(sessionId, studentId)` index, and **"not marked" kept distinct from "absent"**. The
  percentage is derived from marked sessions only, so an unmarked session can never
  quietly count against a student.

- **2026-08-24** — Sessions and users are **suspended or cancelled, never deleted**.
  Deleting a teacher orphans their sessions and marks; deleting a session hides what
  happened from the students who planned around it.

- **2026-08-26** — **`Enrollment` became a real collection**, which is what
  finally made program-scoped student screens possible: `rosterFor()` used to
  return every student whatever program it was asked about. Withdrawn rather
  than deleted, re-enrolment reactivates the same row, and the student dashboard
  was moved onto the same rows so staff and student cannot disagree.

- **2026-08-26** — **The students screens are one component for three areas**,
  with the scope check in the loaders rather than the pages. A teacher gets them
  read-only: enrolling is the admin's and the manager's job, and both the
  controls and the actions enforce that independently.

- **2026-08-26** — **Mid- and end-term assessments built on the existing
  checkpoint course** rather than as a new level of the tree, with
  `Assessment.scope: "term_test"` + `term`. One attempt, proctored, 20 marks a
  question. Four question kinds landed with them (single, multi, true/false,
  matching), all marked all-or-nothing, all defined once in
  `lib/curriculum/question-kinds.ts`.

- **2026-08-26** — **The test runner and the attempt pipeline**, finally
  implementing what the `Attempt` model had specified since it was written:
  server clock, server-counted warnings, answers written as they are given,
  grading from the frozen snapshot. No cron job — an overdue attempt is
  finalised by the next read of it.

- **2026-08-26** — **The marksheet is database-backed**, derived from the same
  `ProgramCurriculum` the curriculum page renders so the two cannot disagree.
  The project row was dropped rather than faked; `data/marksheet.ts` and
  `data/curriculum.ts` survive only as inputs to the migration script.

- **2026-08-26** — **Students hand in from the curriculum page, behind the row's
  ⋮**, rather than waiting for an assignment screen that does not exist. Upload
  is the path and a pasted link the fallback, because a ZIP is never uploaded to
  Cloudinary and a file over the cap needs an escape hatch. The accepted-format
  rule is enforced in the picker, the select and the action, and only the action
  counts. `submitAssignment` uses requireUser plus an explicit student check —
  deliberately not `requireRole("student")`, which admits an admin.

- **2026-08-26** — **An assignment's brief can be a PDF as well as text**, and
  publishing needs either one rather than both. `Assignment.briefFile` stores the
  whole `UploadedFile` (publicId included, so it stays deletable) rather than a
  URL string, and the action — not the upload field — destroys a brief it has
  just replaced or deleted. First caller of `FileUpload`.

- **2026-08-26** — **Cloudinary for file uploads, signed server-side, uploaded
  browser-to-Cloudinary.** One `FileUpload` primitive for images, PDFs and Word
  documents; no SDK (a signature is a SHA-1, a destroy is a form POST); no
  transformations at all; `LMS/<type>/<scope>` as the folder layout, with the
  scope an allowlist that doubles as the role check. Zips deliberately excluded.

- **2026-09-01** — **Tasks: unmarked work, set at a program or at one student.**
  Its own collection rather than a nullable-everything `Assignment`, and one row
  per task rather than one per recipient — membership is the live `Enrollment`,
  read at render time, so a cohort cannot be frozen at the moment somebody
  pressed a button. New capability `task.assign`, held by the teacher and the
  admin and **not** the program manager: setting work is teaching, and a manager
  owns the cohort and the timetable rather than the work. No draft state (a task
  is written in one go, like a session) and deleted rather than archived (the one
  record here that nothing points at). See "Tasks".

- **2026-08-31** — **Bunny Stream for lesson video, not Cloudinary.** A lecture
  needs an encoded quality ladder, an adaptive player and per-GB pricing, none
  of which is what a file store is for — so video got its own field, uploader
  and module rather than becoming a fourth `FileKind`. Browser→Bunny over TUS
  (resumable, because a lecture is gigabytes); the API key never leaves the
  server; embed URLs are signed server-side so a student cannot mint one for a
  lesson they are not enrolled in. **Optional as a set**, like Google Meet: no
  keys, no uploader, pasted links still work. `tus-js-client` is the single
  dependency — the rest is two SHA-256s against a documented HTTP API, the same
  trade as Cloudinary. Volume delivery tier and free encoding, because this is
  a $20 credit and 2160p renditions nobody watches are pure cost.

  The judgement calls worth remembering: `videoUrl` was **kept** rather than
  migrated (existing lessons point at links, and the fallback is what makes the
  keys optional); polling is the mechanism and the webhook is the optimisation
  (a webhook cannot reach a laptop); and deletion always happens **after** the
  write commits, because a lesson pointing at a deleted video is worse than an
  orphan that costs cents.

## Domain vocabulary

Use these exact words in code, UI, and discussion — no synonyms like "chapter" or "unit":

**Program → Course → Module → Topic → Subtopic** (a subtopic is a video, a reading, a
PDF or a quiz — the atom), plus Assignment, Assessment, Submission, Enrollment. See "The
curriculum tree".

An **assignment** is marked; a **task** is not. Never call one the other: an
assignment lives in the tree, gates the next course and produces a `Submission`;
a task is an instruction with a document and some links, set at a program or at
one student. See "Tasks".

An earlier draft of design.md says "Course → Module → Lesson"; that shape is superseded —
the five levels above are what the code and the URLs use.

Roles: **Admin, Program manager, Teacher, Student** — one shell, different nav, not four
separate products. In code the enum values are `admin`, `program_manager`, `teacher`,
`student`; print `ROLE_LABEL[role]`, never the raw value. An earlier draft listed only
three roles; program manager is the fourth.

Live sessions: a **session** has a **kind** (`learning` or `placement`), a **teacher**
assigned by a program manager, and **attendance** per student (`present` / `absent` /
not marked).

### Teachers are assigned to batches (2026-09-04)

The unit of staffing was the program. It shouldn't have been: a program runs
several cohorts at once and one teacher rarely takes all of them, so assigning
by program said they did — every roster, every task, every register of every
cohort was theirs.

**`User.assignments[]` gained `batches: string[]`**, holding `Batch.name`s, the
same key `Enrollment.batch` already carried. **Empty means every batch**, the
convention `courseIds` set — which is what makes every assignment written
before this keep working untouched, and what lets a program manager (who owns
all of a program's cohorts, because batches are theirs to create) hold none.

Two consequences of that convention are load-bearing, and both are enforced in
`lib/actions/teacher-assignments.ts`:

- **Removing somebody's last batch removes the whole assignment.** Leaving an
  empty `batches` behind would take a teacher off their only cohort and hand
  them the entire program — the narrowest mistake becoming the widest grant.
- **Assigning a batch to someone who already holds the whole program is
  refused, not applied.** Pushing a name onto an empty list would silently
  *narrow* them from every cohort to one, from a button labelled "Assign".

#### Where the line falls: content is program-wide, people are not

A teacher on one batch still authors the whole program's tree. Every cohort
studies the same courses, so per-batch curriculum would be a second copy of the
same material to keep in step, and `loadTeacherProgram` still checks only
`assertScope({ program })`. What batches narrow is **who**: the roster, the
individual student screen, the task audience, the register, the session picker.

#### The guards

`lib/auth/guards.ts` grew two functions and one option, and they are the whole
of the feature:

- **`batchScopeFor(user, programSlug)` → `string[] | null`.** `null` is "every
  cohort" — an admin, a manager, a teacher whose `batches` is empty. Null
  rather than an empty array for "everything" is deliberate: an empty array is
  the natural shape of *nothing*, and a caller confusing the two would either
  leak every cohort or hide them all. Callers read as
  `scope === null ? {} : { batch: { $in: scope } }`.
- **`ownsBatch(user, programSlug, batch)`.**
- **`assertScope(user, { program, course?, batch? })`** — `batch` narrows the
  way `course` does.

**The two empty-batch defaults are opposites, and that is the one thing to hold
in your head.** A *session* with no batch is program-wide, so every cohort's
teacher sees it — `assertScope`'s `batch` skips the check when it is empty. A
*student* with no batch on their enrolment belongs to no cohort, so no cohort's
teacher holds them — those readers call `ownsBatch` directly, which refuses.
They stay visible to the admin and the manager, which is where an unbatched
enrolment gets noticed and fixed.

#### Where staffing happens

**On the batch** — `/manager/batches/[program]/[batch]` carries
`BatchTeachers`, because that is where the cohort lives. A teacher who covers
the batch by holding the whole program is listed with an "Every batch" chip and
no Remove button, rather than a button the action would refuse.

**The program screens roll it up.** `ProgramTeachers` on
`/admin/programs/[program]` and `/manager/programs/[program]` is now read-only —
each teacher with the cohorts they take — bar one control: **Remove from
program**, the only staffing change a batch panel cannot express. An assignment
naming no batches has no single batch to be removed from, so without it a
grandfathered teacher could never be taken off at all.

Reads live in `data/teacher-assignments.ts`; the actions in
`actions/teacher-assignments.ts` (both renamed from `program-teachers.ts`, since
what they do changed). "Covers this batch" is a two-branch `$or` — named on the
assignment, **or** naming no batches at all — written in the query rather than
filtered in memory, so the database returns what the guards would say.

#### The rename cascade got three new legs

`Enrollment.batch` was the only thing holding the name. Now
`User.assignments[].batches`, `LiveSession.batch` and `Task.batch` do too, so
`renameBatchEverywhere` in `app/manager/batches/actions.ts` updates four
collections. The teacher update is positional with `arrayFilters`, scoped to the
one program — a teacher with an "Evening" batch on two programs must not have
both renamed by one program's edit. Miss this and a rename unstaffs a cohort
*and*, because empty means every batch, could silently widen the teacher who
was on only that one.

#### Sessions belong to a cohort

`LiveSession.batch` is new; `""` is the program-wide session (the induction, the
placement talk) that every cohort attends. `lib/data/session-batches.ts` states
the matching rule once for all three readers, including that **a missing field
reads as no batch** — Mongoose defaults apply on write, never retroactively, so
without `null` in the `$in` every session written before this would have dropped
off every timetable.

The schedule form picks a batch beside the program and narrows the teacher list
to whoever takes it; `resolveTeacher` re-checks the triple. Attendance calls
`rosterFor(programSlug, batch)` — marking a register that lists the other three
cohorts is how somebody gets marked absent from a class they were never in.
`/teacher/sessions` needed no filter (`teacherId` is already narrower) and just
prints the cohort on the row.

#### Tasks got a third audience

`TASK_AUDIENCES` is now `program | batch | student`, still **one row whatever
the audience** — recipients are derived from the live `Enrollment` at read time,
so a student moved between batches picks up their new cohort's tasks and drops
the old one's with nothing to migrate.

`"batch"` exists because "everyone on this program" is wider than a teacher's
own scope: it would reach a colleague's students on a program the two share. So
`createTask` **refuses `program` from a teacher who does not hold every
cohort**, and the composer simply does not offer it (`mayAddressProgram` comes
off the loader already scoped) — the house rule that a control which renders is
a control that works. An individual task's recipient must now be enrolled *and*
in a cohort the author teaches.

On the staff list a program-wide task **stays visible** to a batch teacher — it
was set for their students too, and hiding it would leave them answering
questions about a task they cannot see — but `refuseOutsideCohort` stops them
completing or deleting it. On the student's screen a cohort task sits under "For
your program" with the program-wide ones: to them it is the same thing, work set
for a group they are in, and a third heading would ask them to care about a
staffing arrangement that is none of their business.

`TASK_AUDIENCES` moved to `lib/tasks/audiences.ts`. It has to: `validation/task.ts`
needs the list, the composer imports the validator, and the composer runs in a
browser — one value import of a Mongoose model in that chain drags the driver
into the client bundle and the build dies on `dns`/`fs`/`net`. The model
re-exports it, so every existing `from "@/models/Task"` still works.

#### The admin's person form

`assignmentKindFor` now returns `"batches"` for a teacher and `"programs"` for a
manager. Tick a program, then the batches under it; posted as
`"<programSlug>:<batchName>"` so the pairs cannot be mismatched, split on the
*first* colon only because a batch name may contain one ("Aug 2026 · 6:30pm").
**Ticking a program with no batches under it still means every batch** — this
form is the blunt instrument ("they teach on these programs") and the batch
screens are where staffing is done cohort by cohort; making an empty tick mean
*nothing* would turn a ticked program into a grant of nothing.

#### Verified

58 assertions against Atlas on throwaway fixtures (own program, two cohorts, a
sibling program with a same-named cohort, three students including one with no
batch, a cohort teacher, a grandfathered teacher and an unassigned one), all
removed afterwards and the collection counts confirmed back to where they
started: the guards across every role and shape; the roster, the student card
counts and the individual screen (a batch teacher 404s on both a sibling
cohort's student and an unbatched one); the staffing panels and the
"already covers it" exclusion; the `$addToSet` / `$pull` / last-batch-removal
operators, including that adding twice does not duplicate and that removing the
last one drops the assignment; the four-collection rename, including that the
same name on another program is untouched; the session filter for each cohort,
for the unbatched, for staff, and for a legacy row with no `batch` key; both
registers; and the task audiences from both sides.

**Not clicked through in a browser** — as with everything since the uploads
work, this was verified through the guards, the loaders and the operators, not
by hand. What that leaves unexercised is the two panels' pending/error states,
the schedule form's batch→teacher re-filtering in the browser, and the
composer's audience toggle.

#### Still open

`npm run seed` now gives Rohit one named cohort and Sneha the whole program, so
both shapes exist locally — but the cohort it names is a label
`npm run seed:batches` has to turn into a real `Batch` row first. And a batch
teacher's `getMarksheet` / grading reads are scoped by the student screens that
reach them rather than at the submission itself; that is fine while every route
in goes through `studentDetail`. **The grading queue landed, and it is scoped at
the submission itself** — `batchScopeFor` narrows the read and `ownsBatch` guards
the write. See "Grading, at last".

### The lesson screen, rebuilt for a phone (2026-09-04)

The video was the wrong size at every width, and on a phone it was wrong by a
factor of three.

**The bug.** `VideoPlayer` wrapped its frame in `mx-auto max-w-5xl flex-1
flex-col`, and `LessonScaffold` put that wrapper inside an `aspect-video`
**block**. `flex-1` on a child of a block is not a flex rule — it did nothing —
so the column had no definite height and the iframe fell back to its intrinsic
**150px** inside a box 219px tall. That is the whole of "the video isn't
covering the screen". The `max-w-5xl` was the desktop half of the same problem:
a 1024px cap centred in a 1104px pane, with the player letterboxing inside it.

**One owner of the frame's size, and it is the scaffold.** All three players —
Bunny's iframe, the native `<video>`, a third-party embed — are now `h-full
w-full` and nothing else. The box, its aspect ratio, its corners and its border
belong to `LessonScaffold`.

#### The phone: a full-bleed stage, then a sheet

The video runs edge to edge under a dark bar that carries the way back, where
you are, and the outline hamburger; the lesson's details sit below on a card
with rounded top corners, separated from the player by an 8px black gutter.

**That gutter is load-bearing, not styling.** The sheet first rode `-mt-3` up
over the black, which looked right and broke the player: a `relative z-10` box
overlapping the video also *takes the taps* over the strip it covers, and the
strip it covered was the bottom of Bunny's control bar — play, mute and
fullscreen under an invisible white edge. Measured with `elementFromPoint`, the
topmost element 98% of the way down the player was the sheet. **Nothing may
overlap the player.** The rounded corners now read against the gutter instead.

**The app header is hidden below `lg`** (`hidden lg:contents`, not a wrapper —
a `sticky` header inside a plain wrapper div takes that div as its containing
block and stops sticking). Two stacked bars cost 7rem above a 16:9 video, which
was most of the rest of why the player looked small. This route already carries
its own bar, and the file always said the lesson owns the screen below `lg`.

`lg:contents` is the load-bearing detail; so is the dark bar being the
*player's* chrome rather than the app's, which is what lets it be 52px.

#### Desktop: sized from the height, not the width

The pane's height is fixed (a lesson must not scroll — the footer controls have
to stay on screen), so the stage is an `aspect-video` box capped at
`max-w-[calc((100dvh_-_13rem)*16/9)]`: below the cap it fills the pane, above it
the cap stops the box growing taller than the space left after the header, the
title block and the footer. Measured at 1440×900 it comes out 1102×619 in a
1104px pane with 111px left for the footer — full width, no letterbox, no
scrollbar.

#### Three flex facts this cost an afternoon to learn

1. `flex-1` on a child of a **block** parent does nothing. See the bug above.
2. `min-h-full` on a child of a box whose height came from `flex-1` collapses.
   The parent's computed `height` is still `auto`, and a percentage resolved
   against `auto` is nothing — measured: a 671px pane, a 413px child. The fix is
   to make the pane a flex column and grow the child into it, which is why the
   video branch of the pane class is `flex flex-col` at every width.
3. A flex item's `min-height: auto` is what stops `flex-basis: 0%` collapsing a
   sheet to nothing. Do not add `min-h-0` to the sheet — and, below `lg`, not to
   the pane either: that omission is what lets a long lesson grow the page
   instead of overflowing a fixed box.

Without (2) a short lesson left a band of page background between the last card
and the footer.

#### The pane is not a scroll container on a phone

Below `lg` the video pane is `flex flex-1 flex-col` and nothing else — no
`min-h-0`, no `overflow-y-auto`. A cross-origin iframe inside a scrolling box is
the one arrangement mobile browsers are unreliable about (taps land in the
scroller rather than the player), and it was the *only* structural difference
between the phone and the desktop, which never misbehaved. Without `min-h-0` the
pane cannot shrink below its content, so a long lesson grows the page and the
**document** scrolls — which is what a phone should do anyway. The constrained,
non-scrolling pane comes back at `lg`, where the rule is that a lesson never
scrolls.

#### The signed URL must not reach the iframe twice

`embedUrl` mints a **new** signed URL on every server render — fresh token,
fresh `expires` — so the `src` prop changes whenever anything re-renders the
page. Passing that straight through reloads the iframe and throws the student
back to the start of the lecture. And it was guaranteed to happen:
`recordVideoProgress` calls `revalidatePath("/learn", "layout")` the instant a
lesson completes, and `VideoPlayer` calls `router.refresh()` immediately after,
so **every lesson reloaded its own player at the 95% mark**.

`VideoPlayer` now pins the first URL per `subtopicId` and only swaps it when the
lesson changes. Nothing is lost: the token authenticates the iframe *load*, and
the load already happened. It is state adjusted during render rather than a ref,
because the compiler's lint rule forbids reading `.current` while rendering.

#### Fullscreen rotates the phone, and we do not own the button

The fullscreen control belongs to the player, and for a Bunny video the player
is inside an iframe we cannot reach into. A control of our own could only
stretch our frame around an unchanged video, and would sit next to Bunny's real
one — two buttons, one of them lying.

So `lib/useFullscreenLandscape.ts` hooks the **event** instead. When something
inside an `allowfullscreen` iframe goes fullscreen, the *parent* document's
`fullscreenElement` becomes that iframe and `fullscreenchange` fires on the
parent. One listener therefore covers all three players without any of them
knowing about it, and `screen.orientation.lock("landscape")` does the rest.

Every call is best-effort: iOS Safari does not implement the lock and does not
need to (its fullscreen video is the system player, which already rotates), so a
missing method, a rejected promise and a thrown `NotSupportedError` are all the
same non-event. Gated on `(pointer: coarse)` — rotating a desktop monitor is
meaningless. The cleanup unlocks, or navigating away mid-fullscreen leaves the
phone pinned sideways on the next lesson.

#### Smaller decisions

- **The "Completed" tick moved out of the player and into the sheet as a chip**,
  rendered from the server's `subtopic.status`. `VideoPlayer` no longer holds
  completion state at all — it calls `router.refresh()`, and the chip, the
  outline's tick and the module percentage then change together off one server
  render. Two sources for one fact is how a player and a sidebar end up
  disagreeing about whether a lesson was watched.
- **The "not playing? open it in a new tab" line moved into the sheet.** It only
  ever appears for a third-party embed, and the frame now runs to the edges of a
  phone: grey text on black is text nobody reads.
- **`LearnDrawer` took a `triggerClassName`** — colours only, never size or the
  `lg:hidden` — because an ink-coloured hamburger is invisible on the new dark
  bar. A drawer whose trigger can be resized from outside is a drawer whose tap
  target can be made too small from outside.
- **The footer's three side-tools are hidden below `sm`.** They are placeholders
  with no handler; on a 390px screen they wrapped onto two rows and pushed
  Prev/Next onto a third — three controls that do nothing costing more of the
  footer than the two that do.
- `playsInline` on the native `<video>`, so iOS plays it in the page rather than
  throwing up the system player the moment somebody presses play.

#### Verified

Driven in a real browser (Playwright, headless Chromium) against the seeded
Bunny lesson at `/learn/performance-marketing/pm-c1/pm-c1-m1?s=pm-c1-m1-t3-s1`,
signed in as the student:

- **390×844**: the iframe measures 390×219 at `left: 0` — full width, exactly
  16:9, edge to edge — under a 52px bar, an 8px gutter, then the sheet filling
  the rest of the pane with the footer pinned at the bottom.
- **Nothing overlaps the player.** `elementFromPoint` down the middle of the
  frame at 5/25/50/75/88/94/98% returns the iframe at every depth, and the
  sheet now begins 8px *below* the frame's bottom edge.
- **It plays, and its controls work**, driven in real Google Chrome (the bundled
  headless shell has no H.264): a touch tap on the centre overlay starts
  playback, and a touch tap on Bunny's own control-bar play button toggles it —
  both in a `hasTouch` phone context.
- **The completion round trip no longer reloads the player**: seeking to 96% on
  a deliberately-incomplete lesson fires `revalidatePath` + `router.refresh()`,
  after which the iframe's `src` is byte-identical, the video sits at 60s rather
  than back at 0, and the "Completed" chip appears. (The progress row was reset
  before the run and restored after.)
- With the handout open the document grows to 1153px and scrolls, and the
  player's `src` survives that too.
- **1440×900**: 1102×619, no page scroll (`scrollHeight === innerHeight`).
- **Fullscreen**: requesting it on the iframe from a real click makes the parent
  document's `fullscreenElement` the `IFRAME` and calls `lock("landscape")`;
  exiting calls `unlock`. On a desktop context (`pointer: coarse` false) neither
  fires — which is the gate working, not the feature failing.
- The handout still opens in place with the **player's `src` unchanged**, so the
  video keeps playing; the outline drawer still opens over the dark bar; a text
  lesson still renders with no page scroll; no console errors.

Driven again after the flex-column fix (2026-09-04, iPhone 15 Pro and iPhone SE
emulation, the live `.docx` on `pm-c1-m1`): the pane is 485 px against 5,446 px
of document, so it scrolls **inside itself**; the toolbar sits at 567 px on a
659 px screen, clear of the sticky footer; a two-finger pinch inside the sheet
takes the document from 42% to 118% while `visualViewport.scale` stays 1 — the
document zooms and the page does not; and the toggle is still absent from the
`lg` layout, where the outline links to the document's own pane.

The one error the run did surface is unrelated seed rot: the module's handout
PDF 404s from Cloudinary (the asset was deleted), and `MaterialViewer` correctly
falls back to "This document couldn't be shown here."

**Not checked on real hardware.** The rotation was verified through a stubbed
`screen.orientation`, because a desktop Chrome has no orientation to lock — the
listener, the iframe-boundary crossing and the coarse-pointer gate are all real,
the rotation itself is not. Everything else above is Chrome's phone emulation
with touch events, which is not a phone: it shares Chrome's engine, so the
hit-testing and the flex arithmetic transfer exactly, but nothing here has met
iOS Safari or a real Android build.

## Not yet decided

Deployment target, and how email gets sent (invites and password resets are hand-delivered
until then).

**Fees, open questions** (all four block EMI, none blocks one-time payment): whether
per-debit AFA is genuinely waived for e-NACH under an education MCC — get this in writing
from Razorpay, it sets the maximum viable instalment; the grace policy when an instalment
fails; whether to also enable Razorpay's native bank EMI on the one-time flow; and whether
a paid-in-full student who later withdraws keeps access to what they paid for.

The next phases, in dependency order: **curriculum authoring** (teacher/admin, replaces
`data/curriculum.ts`) → video upload and the quiz builder → submissions and grading
(replaces the `data/marksheet.ts` seeds) → **enrolments and batches** (which fixes the
static roster and the static `ENROLLMENTS`) → the enquiry inbox (`Enquiry` already carries
`status` for exactly this) → placement management → announcements and Q&A → settings.

Also open: whether tests and projects get their own routes or become dialogs (the links
under "Where things stand" are waiting on that), and whether the student header should
become the staff shell now that both exist side by side.
