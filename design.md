# Course Unbox LMS — Design System

Compact, opinionated system for the LMS product. Derived from the Course Unbox
marketing site (courseunbox.com) so the app feels like the same company, but tuned for
a **workspace** people use for hours, not a landing page they skim once.

Tokens live in [src/app/globals.css](src/app/globals.css) — this file explains the rules.
If a value here disagrees with the CSS, the CSS wins; fix this doc.

**Core principle:** every pixel earns its place. If an element does not help the user
answer *"what do I do next?"* or *"how am I doing?"*, it does not ship.

---

## 1. What we inherited from the marketing site

| Signal | Value | How it carries into the app |
|---|---|---|
| Primary blue | `#2563EB` | Primary buttons, links, active nav, progress fill |
| Gold/amber | `#FFC629` → `#F2B01E` | Achievement only — certificates, streaks, one hero CTA |
| Ink navy | `#0B1220` | Headings and primary text |
| Page wash | Near-white with blue tint | `--color-surface-muted` `#F7F9FE` page, white cards |
| Cards | Generous radius, hairline border, very soft shadow | Same recipe, one step tighter |
| Rhythm | Lots of whitespace, few competing colors | Kept — density comes from structure, not from cramming |

**The one deliberate departure:** the marketing site uses gold as a co-primary CTA. In the
app, gold is *never* an action colour. Blue means "do this", gold means "you earned this".
Mixing them makes progress feel like an advertisement.

---

## 2. Colour

### Roles, not names

| Role | Token | Use |
|---|---|---|
| Primary action | `brand-600` (hover `brand-700`, active `brand-800`) | One per view |
| Primary tint | `brand-50` / `brand-100` | Selected rows, active nav pill, info banners |
| Text primary | `ink-900` | Headings, key numbers |
| Text body | `ink-700` | Paragraphs |
| Text muted | `ink-500` | Labels, meta, timestamps, helper text |
| Text disabled | `ink-400` | Only with a disabled control |
| Page background | `surface-muted` | The app canvas |
| Card / panel | `surface` (white) | Anything holding content |
| Sunken | `surface-sunken` | Track behind progress bars, code blocks, empty wells |
| Border | `border` `#E5EAF2` | Default hairline; `border-strong` for inputs on hover |
| Success | `success-500` | Lesson complete, passed quiz, saved |
| Warning | `warning-500` | Due soon, unsubmitted work |
| Danger | `danger-500` | Destructive actions, failed submission, overdue |
| Achievement | `gold-400/500` | Certificate, badge, streak, top-scorer |

### Rules

1. **Max 3 hues on screen at once**: blue + ink + at most one semantic colour.
2. **Never colour-only.** Status = colour **+** icon **+** text. Colourblind users and
   grayscale printouts must still work.
3. **Contrast floor:** 4.5:1 for text, 3:1 for icons and borders that carry meaning.
   `ink-400` on white is decorative only — never body text.
4. **Gradients:** at most one, on marketing-facing surfaces (auth screen, certificate).
   Never behind reading content.
5. **Light mode only** for now. Tokens are already indirection-ready; when dark mode comes,
   redefine the tokens, don't rewrite components.

---

## 3. Typography

Geist Sans throughout (already wired in `layout.tsx`). Geist Mono only for code and IDs.

| Step | Size | Weight | Line height | Where |
|---|---|---|---|---|
| `4xl` | 48px | 800 | 1.05 | Marketing hero only |
| `3xl` | 36px | 700 | 1.15 | Course landing title |
| `2xl` | 28px | 700 | 1.2 | Page heading (one per page) |
| `xl` | 22px | 600 | 1.3 | Section / card group heading |
| `lg` | 18px | 600 | 1.4 | Card title, lesson title |
| `base` | 16px | 400 | 1.65 | Body, lesson prose |
| `sm` | 14px | 400/500 | 1.5 | **UI default** — nav, buttons, table cells, labels |
| `xs` | 12px | 500 | 1.4 | Meta, timestamps, breadcrumbs |
| `2xs` | 11px | 600 | 1 | Badge text, uppercase eyebrows (`tracking-wide`) |

Rules:
- **Lesson prose is 16px minimum** with `max-w-[68ch]`. Reading comfort beats fitting more.
- Chrome (nav, tables, forms) sits at 14px so the content stays the loudest thing.
- Two weights per screen, normally 400 + 600. Bold (700+) is for headings and numbers.
- Numbers in tables and stats: `tabular-nums`.
- Never centre a paragraph longer than two lines.

---

## 4. Space, radius, elevation

**4px grid.** Allowed gaps: 4, 8, 12, 16, 24, 32, 48, 64. Nothing else.

- Inside a card: 20px mobile / 24px desktop.
- Between cards: 16px.
- Between sections: 32px mobile / 48px desktop.
- Related things get ≤8px; unrelated things get ≥24px. Proximity is the cheapest
  grouping tool — use it before borders, and borders before shadows.

**Radius:** inputs/small buttons `md` (10px) · buttons/chips `lg` (14px) · cards `xl` (16px)
· modals/panels `2xl` (20px) · avatars and status dots full.

**Elevation — four levels, no more:**

| Level | Token | Meaning |
|---|---|---|
| 0 | border only | Default card. **This is the right answer most of the time.** |
| 1 | `shadow-sm` | Hoverable/clickable card |
| 2 | `shadow-md` | Dropdown, popover, sticky header once scrolled |
| 3 | `shadow-lg` | Modal, mobile drawer |

Shadow means "floats above". A static card that never moves gets a border, not a shadow.

---

## 5. Components

Only what an LMS actually needs. Build these; resist inventing more.

### Button
Heights: `sm` 32px · `md` 40px (default) · `lg` 48px (mobile primary, hero).
Padding `md`: 16px horizontal, icon 16px with 8px gap.

| Variant | Look | Use |
|---|---|---|
| Primary | `bg-brand-600` white text | The one main action |
| Secondary | white, `border`, `ink-800` text | Supporting action |
| Ghost | transparent, `ink-600`, hover `ink-100` | Toolbar, table row actions |
| Danger | `bg-danger-500` white | Destructive, always behind a confirm |
| Gold | `bg-gold-400` `ink-900` text | Certificate/celebration only |

States: hover darkens one step · active darkens two + `scale-[0.98]` · focus `shadow-focus`
· disabled `opacity-50` + `cursor-not-allowed` · loading = spinner replaces the icon, label
stays, width frozen (never let a button resize mid-click).

### Input / Select / Textarea
40px tall (48px on mobile), `radius-md`, `border`, white. Label **above**, 14px `ink-700`,
always visible — never placeholder-as-label. Placeholder is an example, not an instruction.
Helper text 12px `ink-500` below; on error it is replaced by the error in `danger-500` with
an alert icon, and the border turns `danger-500`. Leading icons (lucide, 16px, `ink-400`)
are allowed for recognisable fields only — email, search, phone.

### Card
White, `radius-xl`, `border`, `p-5 md:p-6`. Interactive cards: `shadow-sm`,
hover `shadow-md` + `-translate-y-0.5`, whole card is one link, and there is **one**
nested interactive element at most.

### Badge / Pill
Height 22px, `2xs` semibold, `radius-full`, tinted background + darker text
(e.g. `bg-success-50 text-success-700`). Status set: `Not started` (ink) · `In progress`
(brand) · `Completed` (success) · `Overdue` (danger) · `Locked` (ink, lock icon).

### Progress
- **Bar:** 6px, `surface-sunken` track, `brand-600` fill, `radius-full`, animated width.
  Always paired with a number ("6 of 14 lessons · 43%"). A bar without a number is decoration.
- **Ring:** 40–56px, for course cards and the dashboard header.
- **Checklist:** the module tree itself is the truest progress display.

### Navigation
- **Desktop:** left sidebar 272px — logo, primary nav (Dashboard, My Courses, Assignments,
  Certificates), role section (Teacher/Admin) below a divider. Active item =
  `bg-brand-50 text-brand-700` + 3px left bar. Collapsible to 72px icons.
- **Mobile:** bottom tab bar, max 5 items, 56px tall, icon + 11px label, safe-area padded.
- **Top bar** 64px: breadcrumb (desktop) or back arrow + title (mobile), search, notifications,
  avatar menu. Sticky, gains `shadow-md` only after scroll.

### Course → Module → Lesson
The spine of the product.

```
Course
└── Module (accordion, collapsed except the active one)
    └── Lesson row: [status icon] Title · type icon · duration · [locked?]
```
Lesson row 48px (56px mobile). Status icon on the left: circle-dashed (not started),
half-filled circle (in progress), check-circle `success-500` (done), lock `ink-400`.
Active lesson: `bg-brand-50`, title `brand-700`, 3px left bar. Module header shows
"4/7 · 52 min". Locked rows explain *why* on tap ("Finish Module 2 to unlock").

### Lesson player
Desktop three-pane: module outline (280px, collapsible) · content (max 800px) · notes/resources
(320px, optional). Sticky footer bar: `← Previous` · **Mark complete & continue** · `Next →`.
Mobile: content full-width, outline in a bottom sheet, footer bar sticky above the tab bar.

### Table (grades, roster, submissions)
Header `xs` uppercase `ink-500` on `surface-sunken`, sticky. Rows 52px, hairline separators,
hover `ink-50`. Numbers right-aligned `tabular-nums`. **On mobile a table becomes a card list**
— never horizontal-scroll a data table.

### Feedback
- **Toast:** bottom-right desktop / top mobile, auto-dismiss 4s, one line + optional undo.
  Success and info only.
- **Inline alert:** for anything the user must act on. Tinted card, icon, title, body, action.
- **Modal:** max 480px, only for confirms and short focused forms. Anything longer is a page.
  Destructive confirms name the object: "Delete *Module 3: Keyword Research*?"

### Empty states
Every list has one: lucide icon in a 48px `brand-50` circle, `lg` semibold line saying what
goes here, one `sm` `ink-500` sentence, one primary action. No illustrations, no jokes.

---

## 6. Motion (framer-motion)

Motion explains change. It never entertains.

**Durations:** 120ms micro (hover, toggle) · 200ms default (dropdown, tab, toast) ·
320ms large (modal, drawer, page). Nothing over 400ms.
**Easing:** enter `[0.22, 1, 0.36, 1]` (ease-out-soft) · exit `[0.4, 0, 1, 1]` faster than enter.

Standard variants — keep these in `src/lib/motion.ts` and import; don't re-invent per component:

```ts
export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger = {
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};
```

Where motion is allowed:
- Lists/cards on first mount: `fadeUp` + `stagger` (cap the stagger at ~8 items).
- Accordion open/close: height + opacity, 200ms.
- Modal/drawer: overlay fades, panel scales `0.98 → 1` (desktop) or slides up (mobile).
- Progress bar fill: animate `width`, 320ms — the one place a slower tween is right.
- Lesson complete: check icon `scale 0.8 → 1` with a short spring. **One** celebration
  moment per course completion (gold, confetti-free).
- Layout shifts between routes: `layoutId` on the active-nav pill.

Where it is banned: anything blocking input, looping animation outside a loader, parallax,
animated numbers in tables, hover effects on touch devices, motion on every re-render.

Always respect `prefers-reduced-motion` — the global CSS kills durations, and in JS gate
transforms behind `useReducedMotion()`.

---

## 7. UX rules

**Orientation**
1. Every screen answers: where am I, what's next, how far along am I.
2. The dashboard's first element is **Continue where you left off** — course, lesson name,
   progress, one button. Not a welcome banner.
3. Breadcrumbs on every nested page (Course → Module → Lesson); mobile uses a back arrow
   labelled with the parent.
4. Titles are specific: "Module 3: Keyword Research", never "Lesson Page".

**Action clarity**
5. One primary action per screen. Two primaries means neither is primary.
6. Destructive actions: confirm, name the object, never make it the default focus.
7. Buttons say the verb — "Submit assignment", not "OK".
8. Never disable a submit button silently; let them press it and show what's wrong.

**Feedback & trust**
9. Every action gets a response in <100ms — optimistic UI, or a spinner *in place*.
10. Skeletons that match the real layout; never a full-page spinner for partial data.
11. Autosave drafts (notes, assignment text) with a visible "Saved 14:32". Warn before
    leaving with unsaved changes.
12. Errors say what happened, why, and the next step, plus retry. No raw codes.
13. Never lose user work to a failed request — keep it in the field and let them retry.

**Progress & motivation**
14. Progress is visible at every level: course card, module header, sidebar, dashboard.
15. Completion is one obvious tap, and immediately advances to the next lesson.
16. Resuming restores video position and scroll depth.
17. Locked content always states the unlock condition inline.
18. Celebrate module and course completion once, briefly. Nothing on every lesson.

**Reducing effort**
19. Never make the user type what we know. Prefill everything available.
20. Search is one shortcut away (`/` or `⌘K`) and covers courses, lessons, resources.
21. Long forms: group into ≤3 sections, show progress, allow save-and-exit.
22. Remember filters, sort order, sidebar collapse per user.
23. Show real numbers, not vague words: "3 assignments due this week", not "Some pending".

**Roles**
24. Students see a learning app; teachers see the same course with an authoring/grading layer;
    admins get analytics and user management. Same shell, different nav — never three
    unrelated products.
25. Teacher/admin destructive actions affecting students (unpublish, delete module) warn
    with the number of students impacted.

**Accessibility (non-negotiable)**
26. Keyboard reaches everything; visible focus ring always; modals trap and restore focus.
27. Semantic HTML first (`button`, `nav`, `main`, `h1`→`h6` in order). ARIA only when needed.
28. Icon-only buttons need `aria-label`. Video needs captions. Images need alt text.
29. Announce async results to screen readers via a live region.
30. Support 200% zoom without horizontal scrolling.

---

## 8. Responsiveness

**Mobile and desktop are the two first-class targets.** Tablet is a graceful in-between —
it must work, but no layout is designed *for* it alone.

| Name | Width | Layout |
|---|---|---|
| Mobile | 320–767 | Single column, bottom tab bar, sheets instead of modals |
| Tablet | 768–1023 | Two columns, sidebar collapses to icons, top nav returns |
| Desktop | 1024–1439 | Full sidebar + content, three-pane player |
| Wide | 1440+ | Content capped at 1152px, centred; extra space stays empty |

Tailwind defaults are the breakpoints: `md:` 768, `lg:` 1024, `xl:` 1280. Design at 375px
first, then 1440px; the middle falls out of fluid layout.

Rules:
1. **Mobile-first CSS.** Base styles are mobile; `md:`/`lg:` add, never undo.
2. Touch targets ≥44×44px, with ≥8px between adjacent ones. Buttons go 48px on mobile.
3. No hover-only affordances. Anything revealed on hover must be visible or tappable on touch.
4. Reflow, don't shrink: 3 cards → 2 → 1. Never scale text below the minimums to fit.
5. Primary action stays reachable — sticky bottom bar on mobile, not buried below the fold.
6. Tables → cards on mobile. Wide diagrams and code blocks scroll inside their own container;
   the page body never scrolls horizontally.
7. Modals become full-height bottom sheets under `md`.
8. Sidebar → off-canvas drawer under `lg`; the bottom tab bar carries primary nav.
9. Video is always 16:9 responsive, edge-to-edge on mobile.
10. Respect safe areas (`env(safe-area-inset-bottom)`) on the mobile tab bar.
11. Test each screen at 375, 768, 1024, 1440.

---

## 9. Conventions

- **Icons:** `lucide-react` only. 16px inline with text, 20px buttons, 24px nav, 48px empty
  states. `strokeWidth={2}` (1.75 at 24px+). Never mix icon libraries.
- **Component files:** `src/components/ui/*` for primitives, `src/components/<domain>/*` for
  course/lesson/grading pieces. One component per file, named export.
- **Styling:** Tailwind utilities with tokens. No arbitrary hex values in components — if a
  colour isn't a token, either it's wrong or the token is missing. Add it to `globals.css`.
- **Client components:** `"use client"` only where interaction or motion needs it. Lesson
  prose and lists stay server-rendered.
- **Naming:** Course · Module · Lesson · Assignment · Submission · Enrollment. Use these words
  in code, UI, and conversation. No synonyms ("chapter", "unit", "class").

---

## 10. Quick checklist before shipping a screen

- [ ] One primary action, clearly the loudest thing
- [ ] Loading, empty, and error states exist
- [ ] Works at 375px and 1440px
- [ ] Keyboard-navigable with visible focus
- [ ] No colour-only status
- [ ] No element that doesn't serve a user need
- [ ] Motion under 400ms and reduced-motion safe
- [ ] All colours and spacing from tokens
