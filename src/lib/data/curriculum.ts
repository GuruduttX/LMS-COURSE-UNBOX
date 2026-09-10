/**
 * SUPERSEDED — the tree is `data/curriculum-db.ts`, read from Mongo.
 *
 * This static copy is now only the input to `scripts/migrate-curriculum.ts`,
 * which ported it into the database. Nothing in the app reads it. Do not add a
 * caller: a second description of the same curriculum is a second thing to keep
 * in step, and it will not be kept in step.
 */
/**
 * The static curriculum tree. **Superseded — one caller left.**
 *
 * Every screen that used to read this now reads `data/curriculum-db.ts`: the
 * curriculum page, the learning screen, the overview's Resume link, the
 * teacher's landing page and the admin's assignment picker. The types and
 * helpers moved to `lib/curriculum/` (`types.ts`, `status.ts`, `links.ts`,
 * `format.ts`), where they are pure and shared by both sides.
 *
 * What is left is `data/marksheet.ts`, which still derives its marks from the
 * percentages seeded below, and this file exists only to keep it standing until
 * the marksheet is rewritten against `Attempt` and `Submission`. **Until then a
 * student's marksheet and their curriculum page are two different pictures of
 * the same program** — the marksheet shows the old seed. Do not add a caller.
 *
 * Everything below is as it was.
 *
 * ---
 *
 * One source of truth for both curriculum screens.
 *
 * ## Five levels, and the words we use for them
 *
 *   Program → Course → Module → Topic → Subtopic
 *
 * | Level    | Example                          | Where it shows                      |
 * |----------|----------------------------------|-------------------------------------|
 * | Program  | Performance Marketing            | What a student enrols in            |
 * | Course   | Course 4: Meta Ads end to end    | Rail + panel on `/course_details`   |
 * | Module   | Module 2: Audiences              | The dropdown on `/learn`            |
 * | Topic    | Custom audiences                 | The accordions under the dropdown   |
 * | Subtopic | A video, or a quiz               | The right-hand pane — the atom      |
 *
 * The route segments match exactly: `/learn/[program]/[course]/[module]?s=<subtopic>`.
 *
 * Alongside its modules, a course also carries the graded work that belongs to
 * the course rather than to any one module — assignments, assessments, the
 * final test, the project, the certificate. That is why `CourseItem` is one
 * flat ordered list with a `type`: a student meets modules and assignments
 * interleaved, and the order is the teaching order.
 *
 * Everything countable is **derived** (`coursePercent`, `moduleMinutes`, …),
 * never stored, so seed data cannot contradict itself.
 *
 * Static placeholder. `getProgramCurriculum()` and `getLearnScreen()` are the
 * two seams to swap for database reads; both return null for "no such thing
 * *or* not enrolled", which the pages turn into a 404.
 */
import { COURSES, type Course as Program } from "./home";
import { ENROLLMENTS } from "./dashboard";

export type Status =
  | "completed"
  | "in-progress"
  | "not-started"
  | "locked"
  | "submitted"
  | "evaluated";

export type ItemType = "module" | "assignment" | "assessment";

/* ------------------------------- the tree -------------------------------- */

export type QuizQuestion = {
  id: string;
  prompt: string;
  /** Only "single" today; the field exists so multi-select isn't a migration. */
  kind: "single";
  options: { id: string; text: string }[];
  correctOptionId: string;
  /** Shown after submitting, right or wrong — the explanation is the teaching. */
  explanation: string;
};

export type Subtopic =
  | {
      id: string;
      title: string;
      kind: "video";
      status: Status;
      /** Runtime in seconds; the UI prints "6m 15s". */
      seconds: number;
      /** One line of transcript, shown under the player. */
      caption: string;
    }
  | {
      id: string;
      title: string;
      kind: "quiz";
      status: Status;
      questions: QuizQuestion[];
    };

export type Topic = {
  id: string;
  number: number;
  title: string;
  subtopics: Subtopic[];
};

export type CourseModule = {
  id: string;
  number: number;
  title: string;
  topics: Topic[];
};

/** One row of a course: a module, or a piece of graded work of its own. */
export type CourseItem = {
  id: string;
  title: string;
  type: ItemType;
  /** Modules omit this — their status is derived from their subtopics. */
  status?: Status;
  score?: number | null;
  dueDate?: string;
  questions?: number;
  lockedReason?: string;
  /** Present exactly when `type === "module"` — the module this row stands for. */
  module?: CourseModule;
};

/**
 * A course inside the program. `number` is null for the standalone graded
 * checkpoints (mid-term, end-term) that sit between courses — which is also
 * what tells the UI not to print "Course N".
 */
export type ProgramCourse = {
  id: string;
  number: number | null;
  title: string;
  summary: string;
  /** ISO date this course should be finished by. */
  completeBy: string;
  items: CourseItem[];
  finalTest?: { score: number | null; questions: number; minutes: number };
  project?: {
    status: "not-started" | "submitted" | "evaluated";
    description: string;
    score: number | null;
  };
  certificate?: boolean;
};

export type ProgramCurriculum = {
  program: Program;
  /** Placement-guarantee deadline for the whole program, ISO. */
  deadline: string;
  courses: ProgramCourse[];
  totals: { done: number; total: number; percent: number };
};

/* ------------------------------ seed helpers ------------------------------ */

function video(
  id: string,
  title: string,
  seconds: number,
  status: Status,
  caption: string,
): Subtopic {
  return { id, title, kind: "video", seconds, status, caption };
}

function quiz(
  id: string,
  status: Status,
  questions: QuizQuestion[],
  title = "Quiz",
): Subtopic {
  return { id, title, kind: "quiz", status, questions };
}

function moduleItem(module: CourseModule): CourseItem {
  return {
    id: module.id,
    title: `Module ${module.number}: ${module.title}`,
    type: "module",
    module,
  };
}

/* --------------------------------- seeds ---------------------------------- */

const PM_C1_MODULES: CourseModule[] = [
  {
    id: "pm-c1-m1",
    number: 1,
    title: "Foundations",
    topics: [
      {
        id: "pm-c1-m1-t1",
        number: 1,
        title: "What performance marketing is",
        subtopics: [
          video(
            "pm-c1-m1-t1-s1",
            "Performance vs brand marketing",
            412,
            "completed",
            "Why one is measured in impressions and the other in outcomes, and what changes when the budget has to justify itself.",
          ),
          video(
            "pm-c1-m1-t1-s2",
            "Who does what on a paid team",
            287,
            "completed",
            "Strategist, buyer, analyst, creative — and which of those you are being hired as.",
          ),
          quiz("pm-c1-m1-t1-s3", "completed", [
            {
              id: "q1",
              prompt: "Which metric tells you what one conversion cost you?",
              kind: "single",
              options: [
                { id: "a", text: "CPM" },
                { id: "b", text: "CPA" },
                { id: "c", text: "CTR" },
                { id: "d", text: "CPC" },
              ],
              correctOptionId: "b",
              explanation:
                "CPA — cost per acquisition — is spend divided by conversions. CPM is per thousand impressions, CPC is per click, CTR is a ratio.",
            },
            {
              id: "q2",
              prompt: "Performance marketing is best described as:",
              kind: "single",
              options: [
                { id: "a", text: "Advertising bought against measurable outcomes" },
                { id: "b", text: "Any advertising that runs online" },
                { id: "c", text: "Advertising that uses video creative" },
                { id: "d", text: "Advertising sold on a fixed monthly fee" },
              ],
              correctOptionId: "a",
              explanation:
                "The defining feature is accountability to an outcome — a click, a lead, a sale — not the channel or the format.",
            },
          ]),
        ],
      },
      {
        id: "pm-c1-m1-t2",
        number: 2,
        title: "The funnel",
        subtopics: [
          video(
            "pm-c1-m1-t2-s1",
            "Awareness, consideration, conversion",
            539,
            "completed",
            "The three stages, and the mistake of judging a top-of-funnel campaign by bottom-of-funnel numbers.",
          ),
          video(
            "pm-c1-m1-t2-s2",
            "Where each channel fits",
            364,
            "completed",
            "Intent-led channels versus interruption-led channels, and what each is actually good at.",
          ),
        ],
      },
    ],
  },
  {
    id: "pm-c1-m2",
    number: 2,
    title: "The metrics that matter",
    topics: [
      {
        id: "pm-c1-m2-t1",
        number: 1,
        title: "Delivery metrics",
        subtopics: [
          video(
            "pm-c1-m2-t1-s1",
            "CPC, CPM and CTR",
            375,
            "completed",
            "The three delivery metrics, how they relate, and which to look at first when a campaign underperforms.",
          ),
          video(
            "pm-c1-m2-t1-s2",
            "Frequency and audience fatigue",
            298,
            "completed",
            "Why the same ad gets more expensive the longer it runs against a small audience.",
          ),
          quiz("pm-c1-m2-t1-s3", "completed", [
            {
              id: "q1",
              prompt: "CPM is charged per:",
              kind: "single",
              options: [
                { id: "a", text: "Click" },
                { id: "b", text: "Conversion" },
                { id: "c", text: "Thousand impressions" },
                { id: "d", text: "Day of delivery" },
              ],
              correctOptionId: "c",
              explanation:
                "The M is the Roman numeral for a thousand — CPM is what it costs to show your ad a thousand times.",
            },
            {
              id: "q2",
              prompt: "CTR is calculated as:",
              kind: "single",
              options: [
                { id: "a", text: "Clicks ÷ impressions" },
                { id: "b", text: "Clicks ÷ conversions" },
                { id: "c", text: "Impressions ÷ clicks" },
                { id: "d", text: "Spend ÷ clicks" },
              ],
              correctOptionId: "a",
              explanation:
                "Clicks ÷ impressions, as a percentage. Spend ÷ clicks is CPC.",
            },
          ]),
        ],
      },
      {
        id: "pm-c1-m2-t2",
        number: 2,
        title: "Outcome metrics",
        subtopics: [
          video(
            "pm-c1-m2-t2-s1",
            "CPA and ROAS",
            468,
            "completed",
            "The two outcome metrics. Every optimisation decision in this program eventually lands on one of them.",
          ),
          video(
            "pm-c1-m2-t2-s2",
            "Margin, and why ROAS can lie",
            341,
            "completed",
            "A ROAS of 3 on a 20% margin product is a loss. Working backwards from contribution margin instead.",
          ),
          quiz("pm-c1-m2-t2-s3", "not-started", [
            {
              id: "q1",
              prompt: "ROAS of 3 means:",
              kind: "single",
              options: [
                { id: "a", text: "₹3 of revenue for every ₹1 spent" },
                { id: "b", text: "₹3 of profit for every ₹1 spent" },
                { id: "c", text: "3% of visitors converted" },
                { id: "d", text: "Three conversions per thousand impressions" },
              ],
              correctOptionId: "a",
              explanation:
                "ROAS is revenue ÷ ad spend. It says nothing about margin, which is why a ROAS of 3 can still lose money.",
            },
            {
              id: "q2",
              prompt:
                "A campaign has a 4% CTR and a ₹900 CPA against a ₹600 target. The problem is most likely:",
              kind: "single",
              options: [
                { id: "a", text: "The creative — nobody is clicking" },
                { id: "b", text: "The targeting is too broad" },
                { id: "c", text: "The landing page or the offer" },
                { id: "d", text: "The daily budget is too low" },
              ],
              correctOptionId: "c",
              explanation:
                "A 4% CTR is healthy, so the ad is doing its job. People arrive and don't convert — that points past the click.",
            },
          ]),
        ],
      },
    ],
  },
];

const PM_C4_MODULES: CourseModule[] = [
  {
    id: "pm-c4-m1",
    number: 1,
    title: "Campaign objectives",
    topics: [
      {
        id: "pm-c4-m1-t1",
        number: 1,
        title: "The six objectives",
        subtopics: [
          video(
            "pm-c4-m1-t1-s1",
            "What each objective optimises for",
            448,
            "completed",
            "The six Meta objectives, and why choosing the wrong one quietly wastes the whole budget.",
          ),
          video(
            "pm-c4-m1-t1-s2",
            "Matching objective to funnel stage",
            362,
            "completed",
            "Traffic is not awareness and awareness is not sales — mapping the six onto the funnel.",
          ),
          quiz("pm-c4-m1-t1-s3", "completed", [
            {
              id: "q1",
              prompt:
                "You want purchases on an e-commerce site. Which objective should you pick?",
              kind: "single",
              options: [
                { id: "a", text: "Traffic" },
                { id: "b", text: "Engagement" },
                { id: "c", text: "Sales" },
                { id: "d", text: "Awareness" },
              ],
              correctOptionId: "c",
              explanation:
                "Sales optimises delivery towards people likely to buy. Traffic optimises for clicks — a different, cheaper action.",
            },
            {
              id: "q2",
              prompt:
                "Why can a Traffic campaign report a lower CPC but a worse CPA than a Sales campaign?",
              kind: "single",
              options: [
                { id: "a", text: "Traffic campaigns are shown less often" },
                { id: "b", text: "Meta finds cheap clickers, not likely buyers" },
                { id: "c", text: "Traffic campaigns ignore the pixel entirely" },
                { id: "d", text: "Traffic campaigns cannot use lookalikes" },
              ],
              correctOptionId: "b",
              explanation:
                "You get what you optimise for. Ask for clicks and the auction finds people who click; ask for purchases and it finds buyers.",
            },
          ]),
        ],
      },
      {
        id: "pm-c4-m1-t2",
        number: 2,
        title: "Account structure",
        subtopics: [
          video(
            "pm-c4-m1-t2-s1",
            "Campaign, ad set, ad — what goes where",
            466,
            "completed",
            "Objective and budget at the campaign, targeting and placement at the ad set, creative at the ad.",
          ),
          video(
            "pm-c4-m1-t2-s2",
            "How many ad sets is too many",
            312,
            "completed",
            "Splitting budget across ad sets splits the learning phase too. When consolidation wins.",
          ),
        ],
      },
    ],
  },
  {
    id: "pm-c4-m2",
    number: 2,
    title: "Audiences",
    topics: [
      {
        id: "pm-c4-m2-t1",
        number: 1,
        title: "Core and custom audiences",
        subtopics: [
          video(
            "pm-c4-m2-t1-s1",
            "Core audiences",
            397,
            "completed",
            "Demographics, interests and behaviours — and how quickly stacking them shrinks your reach.",
          ),
          video(
            "pm-c4-m2-t1-s2",
            "Custom audiences from your own data",
            511,
            "completed",
            "Website visitors, customer lists and engagement audiences, with the retention windows that matter.",
          ),
          quiz("pm-c4-m2-t1-s3", "completed", [
            {
              id: "q1",
              prompt: "A custom audience can be built from all of these except:",
              kind: "single",
              options: [
                { id: "a", text: "Your customer email list" },
                { id: "b", text: "People who watched your video" },
                { id: "c", text: "Website visitors from the last 30 days" },
                { id: "d", text: "People who visited a competitor's site" },
              ],
              correctOptionId: "d",
              explanation:
                "Custom audiences are built from data you own or from activity on Meta's own surfaces. Another company's traffic is neither.",
            },
          ]),
        ],
      },
      {
        id: "pm-c4-m2-t2",
        number: 2,
        title: "Lookalikes",
        subtopics: [
          video(
            "pm-c4-m2-t2-s1",
            "Lookalikes: 1% to 10%",
            423,
            "completed",
            "How the seed audience decides the quality of the lookalike, and when a wider percentage is the right call.",
          ),
          quiz("pm-c4-m2-t2-s2", "completed", [
            {
              id: "q1",
              prompt: "The quality of a lookalike audience depends most on:",
              kind: "single",
              options: [
                { id: "a", text: "The percentage you choose" },
                { id: "b", text: "The seed audience you build it from" },
                { id: "c", text: "The campaign budget" },
                { id: "d", text: "The ad creative" },
              ],
              correctOptionId: "b",
              explanation:
                "A 1% lookalike of a weak seed is worse than a 5% lookalike of your best customers. Fix the seed first.",
            },
          ]),
        ],
      },
    ],
  },
  {
    id: "pm-c4-m3",
    number: 3,
    title: "Building and testing",
    topics: [
      {
        id: "pm-c4-m3-t1",
        number: 1,
        title: "Your first campaign",
        subtopics: [
          video(
            "pm-c4-m3-t1-s1",
            "Building your first Meta campaign",
            589,
            "in-progress",
            "We build a complete campaign from an empty Ads Manager, narrating every decision as we go.",
          ),
          video(
            "pm-c4-m3-t1-s2",
            "Placements and Advantage+",
            334,
            "not-started",
            "When to let Meta place your ads, and when to take manual control back.",
          ),
          quiz("pm-c4-m3-t1-s3", "not-started", [
            {
              id: "q1",
              prompt: "In any Meta campaign, the structure is defined by?",
              kind: "single",
              options: [
                { id: "a", text: "Campaign → ad set → ad" },
                { id: "b", text: "Ad → campaign → ad set" },
                { id: "c", text: "Ad set → campaign → ad" },
                { id: "d", text: "Campaign → ad → ad set" },
              ],
              correctOptionId: "a",
              explanation:
                "Campaign holds the objective and usually the budget, the ad set holds targeting, placement and schedule, the ad holds the creative.",
            },
            {
              id: "q2",
              prompt: "Where is the budget set under Advantage+ campaign budgeting?",
              kind: "single",
              options: [
                { id: "a", text: "On each ad" },
                { id: "b", text: "On each ad set" },
                { id: "c", text: "At the campaign, shared across ad sets" },
                { id: "d", text: "At the account level" },
              ],
              correctOptionId: "c",
              explanation:
                "It pools the money at the campaign and lets Meta move it to whichever ad set is performing.",
            },
            {
              id: "q3",
              prompt:
                "Your ad set has an audience of 4,000 people and spends its budget in two hours. The likely fix is:",
              kind: "single",
              options: [
                { id: "a", text: "Raise the budget" },
                { id: "b", text: "Broaden the audience" },
                { id: "c", text: "Switch to manual placements" },
                { id: "d", text: "Change the objective" },
              ],
              correctOptionId: "b",
              explanation:
                "A tiny audience means frequency and costs climb fast. Give the auction more people before you give it more money.",
            },
          ]),
        ],
      },
      {
        id: "pm-c4-m3-t2",
        number: 2,
        title: "Creative testing",
        subtopics: [
          video(
            "pm-c4-m3-t2-s1",
            "What to test, and in what order",
            402,
            "not-started",
            "Offer, then hook, then format, then copy. Testing them in the wrong order buys you noise.",
          ),
          video(
            "pm-c4-m3-t2-s2",
            "Reading a test you can act on",
            448,
            "locked",
            "Sample size, significance, and knowing when a result is real.",
          ),
        ],
      },
    ],
  },
];

const PM_C5_MODULES: CourseModule[] = [
  {
    id: "pm-c5-m1",
    number: 1,
    title: "Attribution",
    topics: [
      {
        id: "pm-c5-m1-t1",
        number: 1,
        title: "Models and windows",
        subtopics: [
          video(
            "pm-c5-m1-t1-s1",
            "Attribution models compared",
            524,
            "locked",
            "Last click, first click, linear, data-driven — and why the same spend looks different under each.",
          ),
          video(
            "pm-c5-m1-t1-s2",
            "Click and view windows",
            367,
            "locked",
            "The setting that decides whether a platform claims a conversion at all.",
          ),
        ],
      },
    ],
  },
  {
    id: "pm-c5-m2",
    number: 2,
    title: "Reporting",
    topics: [
      {
        id: "pm-c5-m2-t1",
        number: 1,
        title: "Building the dashboard",
        subtopics: [
          video(
            "pm-c5-m2-t1-s1",
            "A Looker Studio report from scratch",
            631,
            "locked",
            "Connecting sources, blending them, and building the one view a client will actually open.",
          ),
        ],
      },
    ],
  },
];

/** Exported for `scripts/migrate-curriculum.ts`, which ports this into Mongo. */
export const PROGRAM_COURSES: Record<string, ProgramCourse[]> = {
  "performance-marketing": [
    {
      id: "pm-c1",
      number: 1,
      title: "Performance marketing: let's begin",
      summary:
        "How paid acquisition works, the vocabulary, and the metrics every channel shares.",
      completeBy: "2026-09-12",
      items: [
        ...PM_C1_MODULES.map(moduleItem),
        {
          id: "pm-c1-a1",
          title: "Assignment: audit three live ad campaigns",
          type: "assignment",
          status: "evaluated",
          score: 88,
          dueDate: "2026-09-10",
        },
      ],
      finalTest: { score: 91, questions: 20, minutes: 20 },
      certificate: true,
    },
    {
      id: "pm-c2",
      number: 2,
      title: "Google Ads: search campaigns",
      summary:
        "Account structure, keyword match types, and writing responsive search ads that convert.",
      completeBy: "2026-09-26",
      items: [
        {
          id: "pm-c2-m1",
          title: "Module 1: Structure and keywords",
          type: "module",
          module: {
            id: "pm-c2-m1",
            number: 1,
            title: "Structure and keywords",
            topics: [
              {
                id: "pm-c2-m1-t1",
                number: 1,
                title: "Account structure",
                subtopics: [
                  video(
                    "pm-c2-m1-t1-s1",
                    "Account, campaign, ad group",
                    418,
                    "completed",
                    "The three levels of a Google Ads account and what belongs at each.",
                  ),
                  video(
                    "pm-c2-m1-t1-s2",
                    "Keyword research and match types",
                    524,
                    "completed",
                    "Broad, phrase and exact — and the negative keyword list that saves the budget.",
                  ),
                ],
              },
            ],
          },
        },
        {
          id: "pm-c2-m2",
          title: "Module 2: Ads and bidding",
          type: "module",
          module: {
            id: "pm-c2-m2",
            number: 2,
            title: "Ads and bidding",
            topics: [
              {
                id: "pm-c2-m2-t1",
                number: 1,
                title: "Writing and bidding",
                subtopics: [
                  video(
                    "pm-c2-m2-t1-s1",
                    "Responsive search ads",
                    446,
                    "completed",
                    "Headlines, pinning, and letting the system do the combinations.",
                  ),
                  video(
                    "pm-c2-m2-t1-s2",
                    "Bidding strategies explained",
                    502,
                    "completed",
                    "Manual CPC through to tROAS, and when each one has enough data to work.",
                  ),
                ],
              },
            ],
          },
        },
        {
          id: "pm-c2-a1",
          title: "Assignment: build a search campaign brief",
          type: "assignment",
          status: "evaluated",
          score: 82,
          dueDate: "2026-09-24",
        },
      ],
      finalTest: { score: 84, questions: 25, minutes: 30 },
      project: {
        status: "evaluated",
        description:
          "Structure a full search account for a D2C brand — campaigns, ad groups, keywords and three ad variants.",
        score: 86,
      },
      certificate: true,
    },
    {
      id: "pm-c3",
      number: 3,
      title: "Landing pages and conversion tracking",
      summary:
        "GA4, the conversions API, and why a good ad on a bad page still loses money.",
      completeBy: "2026-10-10",
      items: [
        {
          id: "pm-c3-m1",
          title: "Module 1: Pages that convert",
          type: "module",
          module: {
            id: "pm-c3-m1",
            number: 1,
            title: "Pages that convert",
            topics: [
              {
                id: "pm-c3-m1-t1",
                number: 1,
                title: "Landing page anatomy",
                subtopics: [
                  video(
                    "pm-c3-m1-t1-s1",
                    "Anatomy of a converting page",
                    483,
                    "completed",
                    "Message match, one job per page, and the friction that costs you the conversion.",
                  ),
                ],
              },
            ],
          },
        },
        {
          id: "pm-c3-m2",
          title: "Module 2: Tracking",
          type: "module",
          module: {
            id: "pm-c3-m2",
            number: 2,
            title: "Tracking",
            topics: [
              {
                id: "pm-c3-m2-t1",
                number: 1,
                title: "GA4 and server-side",
                subtopics: [
                  video(
                    "pm-c3-m2-t1-s1",
                    "GA4 events and conversions",
                    627,
                    "completed",
                    "Setting up the events that matter, and marking the ones that count as conversions.",
                  ),
                  video(
                    "pm-c3-m2-t1-s2",
                    "Server-side tracking basics",
                    541,
                    "completed",
                    "Why the browser is no longer a reliable narrator, and what the conversions API fixes.",
                  ),
                ],
              },
            ],
          },
        },
        {
          id: "pm-c3-a1",
          title: "Assignment: fix a leaking landing page",
          type: "assignment",
          status: "submitted",
          score: null,
          dueDate: "2026-10-08",
        },
      ],
      finalTest: { score: 79, questions: 20, minutes: 25 },
      certificate: true,
    },
    {
      id: "pm-mid",
      number: null,
      title: "Mid-term assessment",
      summary:
        "Covers courses 1 to 3. One attempt, proctored, and it counts towards your final score.",
      completeBy: "2026-10-14",
      items: [
        {
          id: "pm-mid-t1",
          title: "Mid-term assessment",
          type: "assessment",
          status: "completed",
          score: 87,
          questions: 50,
          dueDate: "2026-10-14",
        },
      ],
    },
    {
      id: "pm-c4",
      number: 4,
      title: "Meta Ads end to end",
      summary:
        "Campaign objectives, audience building, creative testing, and reading the delivery diagnostics.",
      completeBy: "2026-10-28",
      items: [
        ...PM_C4_MODULES.map(moduleItem),
        {
          id: "pm-c4-a1",
          title: "Assignment: plan a ₹50,000 Meta test",
          type: "assignment",
          status: "not-started",
          score: null,
          dueDate: "2026-10-26",
        },
      ],
      finalTest: { score: null, questions: 25, minutes: 30 },
      project: {
        status: "not-started",
        description:
          "Run the ₹50,000 simulated spend across three audiences and report on what you would scale.",
        score: null,
      },
    },
    {
      id: "pm-c5",
      number: 5,
      title: "Reporting, attribution and scaling",
      summary:
        "Looker Studio dashboards, attribution windows, and the decisions that follow from them.",
      completeBy: "2026-11-11",
      items: [
        ...PM_C5_MODULES.map(moduleItem),
        {
          id: "pm-c5-a1",
          title: "Assignment: client-ready monthly report",
          type: "assignment",
          status: "locked",
          score: null,
          dueDate: "2026-11-09",
          lockedReason: "Finish Course 4 to unlock",
        },
      ],
      finalTest: { score: null, questions: 20, minutes: 25 },
    },
    {
      id: "pm-end",
      number: null,
      title: "End-term assessment",
      summary: "The final graded checkpoint. Unlocks once every course is complete.",
      completeBy: "2026-11-14",
      items: [
        {
          id: "pm-end-t1",
          title: "End-term assessment",
          type: "assessment",
          status: "locked",
          score: null,
          questions: 60,
          dueDate: "2026-11-14",
          lockedReason: "Complete all courses to unlock",
        },
      ],
    },
  ],

  "ai-marketing": [
    {
      id: "ai-c1",
      number: 1,
      title: "AI for marketers: the landscape",
      summary:
        "What the models can and cannot do, and where they belong in a marketing workflow.",
      completeBy: "2026-06-05",
      items: [
        {
          id: "ai-c1-m1",
          title: "Module 1: How the models work",
          type: "module",
          module: {
            id: "ai-c1-m1",
            number: 1,
            title: "How the models work",
            topics: [
              {
                id: "ai-c1-m1-t1",
                number: 1,
                title: "Foundations",
                subtopics: [
                  video(
                    "ai-c1-m1-t1-s1",
                    "How large language models work",
                    512,
                    "completed",
                    "Enough of the mechanism to predict where a model will be strong and where it will confabulate.",
                  ),
                  video(
                    "ai-c1-m1-t1-s2",
                    "Prompting fundamentals",
                    634,
                    "completed",
                    "Context, instruction, examples, format — the four things every good prompt carries.",
                  ),
                  quiz("ai-c1-m1-t1-s3", "completed", [
                    {
                      id: "q1",
                      prompt: "A model 'hallucinating' means it:",
                      kind: "single",
                      options: [
                        { id: "a", text: "Produced fluent text that is not true" },
                        { id: "b", text: "Refused to answer" },
                        { id: "c", text: "Ran out of context window" },
                        { id: "d", text: "Returned the same answer twice" },
                      ],
                      correctOptionId: "a",
                      explanation:
                        "Fluency and accuracy are separate properties. The confident tone is not evidence of correctness — verification is your job.",
                    },
                  ]),
                ],
              },
            ],
          },
        },
        {
          id: "ai-c1-a1",
          title: "Assignment: rewrite a campaign brief with AI",
          type: "assignment",
          status: "evaluated",
          score: 90,
          dueDate: "2026-06-03",
        },
      ],
      finalTest: { score: 94, questions: 20, minutes: 20 },
      certificate: true,
    },
    {
      id: "ai-c2",
      number: 2,
      title: "Content systems at scale",
      summary: "Building repeatable content pipelines instead of one-off prompts.",
      completeBy: "2026-06-26",
      items: [
        {
          id: "ai-c2-m1",
          title: "Module 1: Templates and voice",
          type: "module",
          module: {
            id: "ai-c2-m1",
            number: 1,
            title: "Templates and voice",
            topics: [
              {
                id: "ai-c2-m1-t1",
                number: 1,
                title: "Building the system",
                subtopics: [
                  video(
                    "ai-c2-m1-t1-s1",
                    "Prompt templates and variables",
                    446,
                    "completed",
                    "Turning a prompt that worked once into one that works a hundred times.",
                  ),
                  video(
                    "ai-c2-m1-t1-s2",
                    "Brand voice in a system prompt",
                    398,
                    "completed",
                    "Encoding tone rules the way a style guide does, with examples rather than adjectives.",
                  ),
                  video(
                    "ai-c2-m1-t1-s3",
                    "Quality control and human review",
                    421,
                    "completed",
                    "Where a human has to sit in the loop, and what they should be checking for.",
                  ),
                ],
              },
            ],
          },
        },
        {
          id: "ai-c2-a1",
          title: "Assignment: ship a 10-post content system",
          type: "assignment",
          status: "evaluated",
          score: 86,
          dueDate: "2026-06-24",
        },
      ],
      finalTest: { score: 89, questions: 25, minutes: 30 },
      project: {
        status: "evaluated",
        description:
          "Build and document a content pipeline for a real brand, with before/after samples.",
        score: 88,
      },
      certificate: true,
    },
    {
      id: "ai-end",
      number: null,
      title: "End-term assessment",
      summary: "The final graded checkpoint across the whole program.",
      completeBy: "2026-07-30",
      items: [
        {
          id: "ai-end-t1",
          title: "End-term assessment",
          type: "assessment",
          status: "completed",
          score: 92,
          questions: 60,
          dueDate: "2026-07-30",
        },
      ],
    },
  ],
};

/* -------------------------------- derived --------------------------------- */

const DONE: ReadonlySet<Status> = new Set<Status>([
  "completed",
  "evaluated",
  "submitted",
]);

export function isDone(status: Status): boolean {
  return DONE.has(status);
}

export function moduleSubtopics(topics: Topic[]): Subtopic[] {
  return topics.flatMap((topic) => topic.subtopics);
}

export function moduleSeconds(topics: Topic[]): number {
  return moduleSubtopics(topics).reduce(
    (sum, item) => sum + (item.kind === "video" ? item.seconds : 0),
    0,
  );
}

export function modulePercent(topics: Topic[]): number {
  const all = moduleSubtopics(topics);
  if (all.length === 0) return 0;
  return Math.round(
    (all.filter((item) => isDone(item.status)).length / all.length) * 100,
  );
}

/** A module has no stored status — it is whatever its subtopics say it is. */
export function moduleStatus(topics: Topic[]): Status {
  const all = moduleSubtopics(topics);
  if (all.length === 0) return "not-started";
  if (all.every((item) => item.status === "completed")) return "completed";
  if (all.every((item) => item.status === "locked")) return "locked";
  if (all.some((item) => item.status !== "not-started")) return "in-progress";
  return "not-started";
}

export function topicStatus(topic: Topic): Status {
  return moduleStatus([topic]);
}

export function itemStatus(item: CourseItem): Status {
  return item.module
    ? moduleStatus(item.module.topics)
    : (item.status ?? "not-started");
}

export function coursePercent(course: ProgramCourse): number {
  if (course.items.length === 0) return 0;
  const done = course.items.filter((item) => isDone(itemStatus(item))).length;
  return Math.round((done / course.items.length) * 100);
}

export function courseCounts(course: ProgramCourse): {
  done: number;
  total: number;
  minutes: number;
} {
  return {
    done: course.items.filter((item) => isDone(itemStatus(item))).length,
    total: course.items.length,
    minutes: Math.round(
      course.items.reduce(
        (sum, item) => sum + (item.module ? moduleSeconds(item.module.topics) : 0),
        0,
      ) / 60,
    ),
  };
}

export function isCourseLocked(course: ProgramCourse): boolean {
  return course.items.every((item) => itemStatus(item) === "locked");
}

/** The course a student should land on: the first unfinished one. */
export function defaultCourseId(courses: ProgramCourse[]): string {
  const next = courses.find((course) => coursePercent(course) < 100);
  return (next ?? courses[courses.length - 1]).id;
}

/** The modules of a course, without the assignment and assessment rows. */
export function courseModules(course: ProgramCourse): CourseModule[] {
  return course.items.flatMap((item) => (item.module ? [item.module] : []));
}

/* -------------------------------- lookups --------------------------------- */

/** Returns null when the program doesn't exist or the student isn't enrolled. */
export function getProgramCurriculum(slug: string): ProgramCurriculum | null {
  const program = COURSES.find((item) => item.slug === slug);
  const enrollment = ENROLLMENTS.find((item) => item.slug === slug);
  const courses = PROGRAM_COURSES[slug];

  if (!program || !enrollment || !courses) return null;

  const items = courses.flatMap((course) => course.items);
  const done = items.filter((item) => isDone(itemStatus(item))).length;

  return {
    program,
    deadline: enrollment.deadline,
    courses,
    totals: {
      done,
      total: items.length,
      percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
    },
  };
}

export type LearnScreen = {
  program: Program;
  course: ProgramCourse;
  /** The course's modules, for the sidebar dropdown. */
  modules: CourseModule[];
  module: CourseModule;
  /** The topic holding the open subtopic — the accordion that starts open. */
  topic: Topic;
  subtopic: Subtopic;
  prev: { moduleId: string; subtopicId: string; title: string } | null;
  next: { moduleId: string; subtopicId: string; title: string } | null;
};

/**
 * Resolves a learning screen from the URL. Anything that doesn't resolve
 * returns null (→ 404); an unknown *subtopic* instead falls back to the
 * module's first, because a stale `?s=` should still land somewhere useful.
 */
export function getLearnScreen(
  programSlug: string,
  courseId: string,
  moduleId: string,
  subtopicId?: string,
): LearnScreen | null {
  const curriculum = getProgramCurriculum(programSlug);
  if (!curriculum) return null;

  const course = curriculum.courses.find((item) => item.id === courseId);
  if (!course) return null;

  const modules = courseModules(course);
  const active = modules.find((item) => item.id === moduleId);
  if (!active) return null;

  const subtopics = moduleSubtopics(active.topics);
  const subtopic =
    subtopics.find((item) => item.id === subtopicId) ?? subtopics[0];
  if (!subtopic) return null;

  const topic = active.topics.find((item) =>
    item.subtopics.some((sub) => sub.id === subtopic.id),
  )!;

  // Prev/Next run across the whole course, not just the open module — that is
  // what "next" means to someone working through it front to back.
  const flat = modules.flatMap((item) =>
    moduleSubtopics(item.topics).map((sub) => ({
      moduleId: item.id,
      subtopicId: sub.id,
      title: sub.title,
    })),
  );
  const at = flat.findIndex((item) => item.subtopicId === subtopic.id);

  return {
    program: curriculum.program,
    course,
    modules,
    module: active,
    topic,
    subtopic,
    prev: at > 0 ? flat[at - 1] : null,
    next: at >= 0 && at < flat.length - 1 ? flat[at + 1] : null,
  };
}

/* --------------------------------- links ---------------------------------- */

export function learnHref(
  programSlug: string,
  courseId: string,
  moduleId: string,
  subtopicId?: string,
): string {
  const base = `/learn/${programSlug}/${courseId}/${moduleId}`;
  return subtopicId ? `${base}?s=${subtopicId}` : base;
}

export function courseDetailsHref(programSlug: string, courseId?: string): string {
  const base = `/dashboard/${programSlug}/course_details`;
  return courseId ? `${base}?c=${courseId}` : base;
}

/** First subtopic of a module the student hasn't finished, else its first. */
export function moduleEntryHref(
  programSlug: string,
  courseId: string,
  module: CourseModule,
): string {
  const subtopics = moduleSubtopics(module.topics);
  const next =
    subtopics.find((sub) => !isDone(sub.status) && sub.status !== "locked") ??
    subtopics[0];
  return learnHref(programSlug, courseId, module.id, next?.id);
}

/** Where "Go to course" lands: the first unfinished subtopic in that course. */
export function entryHref(programSlug: string, courseId: string): string {
  const curriculum = getProgramCurriculum(programSlug);
  const course = curriculum?.courses.find((item) => item.id === courseId);
  if (!course) return courseDetailsHref(programSlug);

  const modules = courseModules(course);
  const active = modules.find((item) =>
    moduleSubtopics(item.topics).some(
      (sub) => !isDone(sub.status) && sub.status !== "locked",
    ),
  );

  const target = active ?? modules[0];
  return target
    ? moduleEntryHref(programSlug, courseId, target)
    : courseDetailsHref(programSlug, courseId);
}

/** First in-progress subtopic anywhere in the program — the "Resume" target. */
export function resumeHref(programSlug: string): string {
  const curriculum = getProgramCurriculum(programSlug);
  if (!curriculum) return courseDetailsHref(programSlug);

  for (const course of curriculum.courses) {
    for (const item of courseModules(course)) {
      const next = moduleSubtopics(item.topics).find(
        (sub) => sub.status === "in-progress",
      );
      if (next) return learnHref(programSlug, course.id, item.id, next.id);
    }
  }

  const first = curriculum.courses.find((course) => coursePercent(course) < 100);
  return first
    ? entryHref(programSlug, first.id)
    : courseDetailsHref(programSlug);
}

/* ------------------------------- formatting -------------------------------- */

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
