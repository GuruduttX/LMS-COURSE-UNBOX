/**
 * Static content for the logged-out home page.
 *
 * Everything here is placeholder copy modelled on courseunbox.com. When the
 * Course/Module/Lesson models land, the courses array is the first thing to
 * swap for a database query — the component props already match its shape.
 */

export type Course = {
  slug: string;
  title: string;
  tagline: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  durationWeeks: number;
  modules: number;
  lessons: number;
  highlights: string[];
  tools: string[];
  /** Placeholder pricing in ₹ — replace with real fees before launch. */
  fee: number;
  nextBatch: string;
  isNew?: boolean;
  /** Tailwind classes for the card's cover band. */
  cover: string;
};

export const COURSES: Course[] = [
  {
    slug: "performance-marketing",
    title: "Performance Marketing",
    tagline: "Run paid campaigns that pay for themselves",
    level: "Beginner",
    durationWeeks: 10,
    modules: 8,
    lessons: 62,
    highlights: [
      "Google, Meta & LinkedIn Ads",
      "₹50,000 live ad-spend simulation",
      "Attribution & ROAS reporting",
    ],
    tools: ["Google Ads", "Meta Ads", "GA4", "Looker Studio"],
    fee: 34999,
    nextBatch: "Next batch starts 8 Sep",
    isNew: true,
    cover: "from-brand-solid to-brand-solid-active",
  },
  {
    slug: "seo-aeo-geo",
    title: "SEO, AEO & GEO",
    tagline: "Rank on Google and get cited by AI answers",
    level: "Beginner",
    durationWeeks: 12,
    modules: 9,
    lessons: 74,
    highlights: [
      "Technical, on-page & off-page SEO",
      "Answer and generative engine optimisation",
      "Audit a real client website",
    ],
    tools: ["Ahrefs", "Screaming Frog", "Search Console", "Surfer"],
    fee: 39999,
    nextBatch: "Next batch starts 15 Sep",
    isNew: true,
    cover: "from-[#0f766e] to-[#134e4a]",
  },
  {
    slug: "ai-marketing",
    title: "AI for Marketers",
    tagline: "Ship a month of work in a week, without the slop",
    level: "Intermediate",
    durationWeeks: 8,
    modules: 7,
    lessons: 48,
    highlights: [
      "Prompt systems for campaign work",
      "Automate reporting & briefs",
      "Build 3 marketing AI agents",
    ],
    tools: ["Claude", "n8n", "Zapier", "Midjourney"],
    fee: 29999,
    nextBatch: "Next batch starts 1 Sep",
    cover: "from-[#6d28d9] to-[#4c1d95]",
  },
  {
    slug: "social-media-marketing",
    title: "Social Media Marketing",
    tagline: "Build an audience that actually converts",
    level: "Beginner",
    durationWeeks: 8,
    modules: 7,
    lessons: 55,
    highlights: [
      "Content systems for 4 platforms",
      "Creator & influencer campaigns",
      "Grow a page from zero as coursework",
    ],
    tools: ["Meta Suite", "Canva", "CapCut", "Buffer"],
    fee: 24999,
    nextBatch: "Next batch starts 22 Sep",
    cover: "from-[#be123c] to-[#881337]",
  },
];

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
