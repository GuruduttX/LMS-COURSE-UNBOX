/**
 * The vocabulary of the audit log: every action the app can record, what it is
 * called on screen, and which category it files under.
 *
 * Split out of `audit.ts` and kept **pure and dependency-free** — no
 * `server-only`, no database, no `next/headers` — so the backfill script and
 * any client component can import it as freely as the logger does. `audit.ts`
 * re-exports all of it, so a call site never has to know which file a name
 * lives in.
 */
/** Coarse groupings, so the filter bar offers eight choices instead of forty. */
export const AUDIT_CATEGORIES = [
  "auth",
  "people",
  "curriculum",
  "sessions",
  "students",
  "tasks",
  "payments",
  "content",
  "system",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<AuditCategory, string> = {
  auth: "Account & access",
  people: "People",
  curriculum: "Programs & curriculum",
  sessions: "Sessions & batches",
  students: "Student work",
  tasks: "Tasks",
  payments: "Fees & payments",
  content: "Media",
  system: "System",
};

/**
 * Every verb the app can log, with the label the screen shows and the category
 * it files under.
 *
 * This is the single source of truth: the filter dropdown is built from it, rows
 * are rendered through it, and `recordAudit` types its `action` against it — so
 * a typo is a compile error rather than an entry nobody can ever filter for.
 * Adding a logged action means adding one row here first.
 */
export const ACTIONS = {
  // Account & access
  "auth.login": { label: "Signed in", category: "auth" },
  "auth.login.failed": { label: "Failed sign-in", category: "auth" },
  "auth.lockout": { label: "Account locked", category: "auth" },
  "auth.logout": { label: "Signed out", category: "auth" },
  "account.password.change": { label: "Changed password", category: "auth" },
  "account.profile.update": { label: "Updated profile", category: "auth" },

  // People
  "user.create": { label: "Created account", category: "people" },
  "user.update": { label: "Updated account", category: "people" },
  "user.update.role": { label: "Changed role", category: "people" },
  "user.suspend": { label: "Suspended account", category: "people" },
  "user.reactivate": { label: "Reactivated account", category: "people" },
  "user.resetPassword": { label: "Reset password", category: "people" },
  "program.assignTeacher": { label: "Assigned teacher", category: "people" },
  "program.removeTeacher": { label: "Removed teacher", category: "people" },

  // Programs & curriculum
  "program.create": { label: "Created program", category: "curriculum" },
  "program.update": { label: "Updated program", category: "curriculum" },
  "curriculum.create": { label: "Created content", category: "curriculum" },
  "curriculum.update": { label: "Updated content", category: "curriculum" },
  "curriculum.delete": { label: "Deleted content", category: "curriculum" },
  "curriculum.reorder": { label: "Reordered content", category: "curriculum" },
  "curriculum.draft": { label: "Moved to draft", category: "curriculum" },
  "curriculum.published": { label: "Published", category: "curriculum" },
  "curriculum.archived": { label: "Archived", category: "curriculum" },

  // Sessions & batches
  "session.schedule": { label: "Scheduled session", category: "sessions" },
  "session.update": { label: "Updated session", category: "sessions" },
  "session.cancel": { label: "Cancelled session", category: "sessions" },
  "session.restore": { label: "Restored session", category: "sessions" },
  "session.markAttendance": { label: "Marked attendance", category: "sessions" },
  "batch.create": { label: "Created batch", category: "sessions" },
  "batch.update": { label: "Updated batch", category: "sessions" },

  // Student work
  "enrollment.create": { label: "Enrolled student", category: "students" },
  "enrollment.reactivate": { label: "Re-enrolled student", category: "students" },
  "enrollment.withdraw": { label: "Withdrew student", category: "students" },
  "submission.create": { label: "Submitted assignment", category: "students" },
  "attempt.start": { label: "Started test", category: "students" },
  "attempt.submit": { label: "Submitted test", category: "students" },
  "attempt.violation": { label: "Proctoring flag", category: "students" },

  // Tasks
  "task.create": { label: "Created task", category: "tasks" },
  "task.complete": { label: "Completed task", category: "tasks" },
  "task.reopen": { label: "Reopened task", category: "tasks" },
  "task.delete": { label: "Deleted task", category: "tasks" },
  "task.submit": { label: "Submitted task", category: "tasks" },

  // Fees & payments. Money is the one area where "who changed this, when" is
  // asked in anger rather than out of curiosity, so the whole lifecycle is
  // logged — including the two the *system* records rather than a person:
  // `payment.captured` and `payment.failed` are written by the webhook, whose
  // actor is Razorpay.
  "feePlan.create": { label: "Created fee plan", category: "payments" },
  "feePlan.archive": { label: "Archived fee plan", category: "payments" },
  "program.fee": { label: "Set a program fee", category: "payments" },
  "fee.recommend": { label: "Recommended a plan", category: "payments" },
  "fee.custom": { label: "Set a custom price", category: "payments" },
  "fee.choose": { label: "Chose a payment plan", category: "payments" },
  "payment.start": { label: "Started a payment", category: "payments" },
  // Authorising an instalment mandate is its own event, and a more consequential
  // one than starting a single payment: it commits a student to months of
  // debits. The entry names the subscription, which is the id support will be
  // reading back to Razorpay.
  "subscription.start": {
    label: "Started an instalment plan",
    category: "payments",
  },
  "payment.captured": { label: "Payment received", category: "payments" },
  "payment.failed": { label: "Payment failed", category: "payments" },
  "payment.offline": { label: "Recorded an offline payment", category: "payments" },

  // Media
  "asset.delete": { label: "Deleted file", category: "content" },
  "video.delete": { label: "Deleted video", category: "content" },
  "video.ready": { label: "Video processed", category: "content" },

  // System
  "audit.purge": { label: "Purged audit entries", category: "system" },
} as const satisfies Record<string, { label: string; category: AuditCategory }>;

export type AuditAction = keyof typeof ACTIONS;

/** Every action, grouped for the filter dropdown's <optgroup>s. */
export function actionsByCategory(): {
  category: AuditCategory;
  label: string;
  actions: { value: AuditAction; label: string }[];
}[] {
  return AUDIT_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    actions: (Object.keys(ACTIONS) as AuditAction[])
      .filter((action) => ACTIONS[action].category === category)
      .map((action) => ({ value: action, label: ACTIONS[action].label })),
  })).filter((group) => group.actions.length > 0);
}

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && value in ACTIONS;
}

export function isAuditCategory(value: unknown): value is AuditCategory {
  return (
    typeof value === "string" &&
    (AUDIT_CATEGORIES as readonly string[]).includes(value)
  );
}
