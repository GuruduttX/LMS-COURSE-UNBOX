/**
 * Static content for the logged-out home page that is **not** a program.
 *
 * The stats, the pitch, the educators, the testimonials and the FAQ: copy about
 * the institution, with no row in any collection and no plan to acquire one.
 *
 * The programs used to be here too, in a `COURSES` array. They are rows now —
 * see `data/public-programs.ts`, and `models/Program.ts` for why that array had
 * to go. Do not add another list of programs to this file; a second answer to
 * "what do we teach" is the exact problem that one caused.
 */

export const STATS = [
  { value: "40,000+", label: "Learners trained" },
  { value: "94%", label: "Placement rate" },
  { value: "3,000+", label: "Students placed" },
  { value: "4.7/5", label: "Average rating" },
] as const;

export const ADVANTAGES = [
  {
    icon: "monitor-play" as const,
    title: "Live cohort classes",
    body: "Small batches taught in real time by practitioners, with every session recorded so you never lose a class.",
  },
  {
    icon: "folder-kanban" as const,
    title: "Real client projects",
    body: "You finish with a portfolio built on live briefs and real budgets, not toy exercises.",
  },
  {
    icon: "briefcase" as const,
    title: "Placement support",
    body: "Mock interviews, portfolio reviews and referrals to 500+ hiring partners until you land a role.",
  },
  {
    icon: "badge-check" as const,
    title: "Verified certificate",
    body: "A shareable certificate issued on completion, with a public verification link recruiters can check.",
  },
];

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Pick your program",
    body: "Talk to a counsellor, compare curricula and choose the track that matches the role you want.",
  },
  {
    step: "02",
    title: "Learn in a cohort",
    body: "Live classes, structured modules and lessons, weekly assignments reviewed by your mentor.",
  },
  {
    step: "03",
    title: "Build a portfolio",
    body: "Every module ends in a deliverable — audits, campaigns, dashboards — that goes into your portfolio.",
  },
  {
    step: "04",
    title: "Get placed",
    body: "Interview prep and introductions to hiring partners, with support until you accept an offer.",
  },
];

/**
 * A newly enrolled student's first day, in the order the app enforces it:
 * an account made by staff, the forced password change in `requireUser`, the
 * fee gate on `(paid)`, then the dashboard. Change this if that flow changes.
 */
export const FIRST_DAY = [
  {
    icon: "mail" as const,
    title: "Get your login",
    body: "Once you enrol, your program team creates your account and shares your email and a temporary password.",
  },
  {
    icon: "key-round" as const,
    title: "Sign in and set your password",
    body: "On your first sign-in you choose your own password. The temporary one stops working.",
  },
  {
    icon: "wallet" as const,
    title: "Confirm your fees",
    body: "Pick how you'll pay and complete it securely online. Your modules unlock as soon as it's done.",
  },
  {
    icon: "monitor-play" as const,
    title: "Start learning",
    body: "Your dashboard shows your next live class, where you left off and what's due this week.",
  },
];

export const EDUCATORS = [
  {
    name: "Rohit Sharma",
    role: "Performance Marketing",
    years: 12,
    credentials: ["Ex-Dentsu, Ex-Flipkart", "₹40Cr+ ad spend managed"],
    initials: "RS",
  },
  {
    name: "Ananya Verma",
    role: "SEO & Content",
    years: 10,
    credentials: ["Ex-Zomato growth team", "Scaled 3 sites past 5M sessions"],
    initials: "AV",
  },
  {
    name: "Kabir Malhotra",
    role: "AI & Automation",
    years: 9,
    credentials: ["Ex-Razorpay", "Builds marketing agents at scale"],
    initials: "KM",
  },
  {
    name: "Priya Nair",
    role: "Social & Brand",
    years: 11,
    credentials: ["Ex-Nykaa, Ex-Sugar", "Ran 200+ creator campaigns"],
    initials: "PN",
  },
];

export const TESTIMONIALS = [
  {
    quote:
      "I joined with zero marketing background. The module structure meant I always knew what to do next, and the live campaign project is what got me through my interviews.",
    name: "Sneha Kulkarni",
    outcome: "Performance Marketer at a D2C brand",
    rating: 5,
  },
  {
    quote:
      "The SEO track went far deeper than the free content I had been piecing together. Auditing a real client site in week six changed how I think about the work.",
    name: "Arjun Mehta",
    outcome: "SEO Analyst, agency side",
    rating: 5,
  },
  {
    quote:
      "Classes were live at 8pm so I could keep my job while learning. My mentor reviewed every assignment personally — that feedback loop is the whole value.",
    name: "Fatima Sheikh",
    outcome: "Marketing Associate at a SaaS startup",
    rating: 4,
  },
];

export const FAQS = [
  {
    q: "Do I need a marketing background to join?",
    a: "No. Every program starts from fundamentals and the beginner tracks assume no prior experience. What matters is being able to commit around 8 hours a week.",
  },
  {
    q: "When are the live classes?",
    a: "Evening batches run 8–9:30pm IST on weekdays, with weekend batches for working professionals. Every session is recorded and available in your dashboard within an hour.",
  },
  {
    q: "What does placement support actually include?",
    a: "Portfolio and résumé reviews, mock interviews with practitioners, and introductions to our hiring partners. Support continues until you accept an offer.",
  },
  {
    q: "Is the certificate recognised?",
    a: "You receive a Course Unbox certificate on completion with a public verification link. It records the program, the projects you shipped, and your final score.",
  },
];
