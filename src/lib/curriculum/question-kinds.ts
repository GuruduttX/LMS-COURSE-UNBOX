/**
 * The kinds of question a paper can ask, and how each one is marked.
 *
 * Everything here grades itself, which is the constraint that decides what is
 * on the list: a question type earns its place only if a machine can mark it
 * the instant a student submits. That is why there is no short-answer type —
 * "exact match" grading turns a right answer with a typo into a wrong one, and
 * a paper that argues with a student is worse than one that asks less.
 *
 * Pure and dependency-free: the model, the validator, the builder, the runner
 * and the grader all read from here, so there is one definition of what a
 * question is and one definition of what "correct" means. `gradeAnswer` in
 * particular must never be duplicated — a second copy is how a paper starts
 * marking differently from the way it was written.
 */

export const QUESTION_KINDS = ["single", "multi", "boolean", "matching"] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];

export function isQuestionKind(value: unknown): value is QuestionKind {
  return (
    typeof value === "string" &&
    (QUESTION_KINDS as readonly string[]).includes(value)
  );
}

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  single: "Multiple choice",
  multi: "Multiple choice — pick all that apply",
  boolean: "True or false",
  matching: "Match the pairs",
};

export const QUESTION_KIND_HINT: Record<QuestionKind, string> = {
  single: "One option is right. The student picks exactly one.",
  multi: "More than one option can be right. Marked all-or-nothing — every right one ticked, no wrong ones.",
  boolean: "A statement the student marks true or false.",
  matching: "Each item on the left has one match on the right. The right-hand list is shuffled for every student.",
};

/**
 * The two fixed options of a true/false question.
 *
 * Stored as ordinary options with reserved ids rather than as a boolean field,
 * so a true/false question grades through exactly the same path as a
 * single-choice one — one code path, not two that must agree.
 */
export const BOOLEAN_OPTIONS = [
  { id: "true", text: "True" },
  { id: "false", text: "False" },
] as const;

/* --------------------------------- shapes -------------------------------- */

export type QuestionOption = { id: string; text: string };

/**
 * One row of a matching question.
 *
 * `id` names the left-hand item and `rightId` names its match. They are
 * **deliberately different ids**: the runner receives the right-hand list as
 * `{ id: rightId, text: right }`, so if the two shared an id a student could
 * read the answer straight out of the payload. Shuffling alone would not save
 * it — the pairing would still be visible.
 */
export type QuestionPair = {
  id: string;
  rightId: string;
  left: string;
  right: string;
};

/** What a student sends back, whatever the kind. */
export type AnswerValue = {
  /** single and boolean: one id. multi: none, one or many. */
  optionIds: string[];
  /** matching: the student's mapping, left item to right item. */
  pairs: { leftId: string; rightId: string }[];
};

export const EMPTY_ANSWER: AnswerValue = { optionIds: [], pairs: [] };

export function isAnswered(kind: QuestionKind, answer: AnswerValue): boolean {
  return kind === "matching"
    ? answer.pairs.length > 0
    : answer.optionIds.length > 0;
}

/* -------------------------------- grading -------------------------------- */

/** The shape `gradeAnswer` needs — a superset of every kind's fields. */
export type GradableQuestion = {
  kind: QuestionKind;
  options: QuestionOption[];
  correctOptionId: string;
  correctOptionIds: string[];
  pairs: QuestionPair[];
};

/**
 * Is this answer right? The only definition of correct in the app.
 *
 * Marking is all-or-nothing for every kind, including `multi` and `matching`.
 * Partial credit sounds kinder and is a trap: it needs a scheme (per option?
 * penalising wrong ticks?) that the author never chose and the student is never
 * told, so a mark becomes unexplainable. A question is right or it isn't; a
 * teacher who wants finer resolution asks two questions.
 */
export function gradeAnswer(
  question: GradableQuestion,
  answer: AnswerValue,
): boolean {
  switch (question.kind) {
    case "single":
    case "boolean":
      return (
        answer.optionIds.length === 1 &&
        answer.optionIds[0] === question.correctOptionId
      );

    case "multi": {
      const expected = new Set(question.correctOptionIds);
      const given = new Set(answer.optionIds);
      if (expected.size === 0 || expected.size !== given.size) return false;
      for (const id of expected) if (!given.has(id)) return false;
      return true;
    }

    case "matching": {
      if (question.pairs.length === 0) return false;
      // Every row must be matched, and matched correctly. A blank row is a
      // wrong answer, not an ignored one.
      const given = new Map(
        answer.pairs.map((pair) => [pair.leftId, pair.rightId]),
      );
      if (given.size !== question.pairs.length) return false;
      return question.pairs.every((pair) => given.get(pair.id) === pair.rightId);
    }
  }
}

/**
 * A stable shuffle of a matching question's right-hand list.
 *
 * Called once, when the paper is frozen into the attempt, and the order is
 * stored there — shuffling per render would rearrange the choices under a
 * student every time the page re-rendered, which reads as a bug and loses their
 * place. Fisher–Yates over a copy; the caller owns the randomness.
 */
export function shuffledRightIds(pairs: readonly QuestionPair[]): string[] {
  const ids = pairs.map((pair) => pair.rightId);

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }

  return ids;
}

/* ------------------------------ normalising ------------------------------ */

/**
 * A question out of Mongo, made whole.
 *
 * `.lean()` returns raw BSON and skips schema defaults, so a document written
 * before a field existed comes back missing it — and `question.pairs.map` on
 * `undefined` is a crash on a page that used to work. Every read path funnels
 * through here rather than each one remembering its own `?? []`.
 *
 * Deliberately not exported as a type guard: a malformed question is filled in
 * with empty values rather than dropped, because losing question 4 of a paper
 * silently is worse than rendering it unanswerable and visible.
 */
export function toAuthoredQuestion(raw: unknown): {
  id: string;
  prompt: string;
  kind: QuestionKind;
  options: QuestionOption[];
  correctOptionId: string;
  correctOptionIds: string[];
  pairs: QuestionPair[];
  choiceOrder: string[];
  explanation: string;
} {
  const row = (raw ?? {}) as Record<string, unknown>;

  const kind = isQuestionKind(row.kind) ? row.kind : "single";

  const options: QuestionOption[] = Array.isArray(row.options)
    ? row.options.map((option) => {
        const item = (option ?? {}) as Record<string, unknown>;
        return {
          id: String(item.id ?? ""),
          text: String(item.text ?? ""),
        };
      })
    : [];

  const pairs: QuestionPair[] = Array.isArray(row.pairs)
    ? row.pairs.map((pair) => {
        const item = (pair ?? {}) as Record<string, unknown>;
        return {
          id: String(item.id ?? ""),
          rightId: String(item.rightId ?? ""),
          left: String(item.left ?? ""),
          right: String(item.right ?? ""),
        };
      })
    : [];

  return {
    id: String(row.id ?? ""),
    prompt: String(row.prompt ?? ""),
    kind,
    // A true/false question stores no options; it renders from the fixed pair.
    options: kind === "boolean" && options.length === 0
      ? BOOLEAN_OPTIONS.map((option) => ({ ...option }))
      : options,
    correctOptionId: String(row.correctOptionId ?? ""),
    correctOptionIds: Array.isArray(row.correctOptionIds)
      ? row.correctOptionIds.map(String)
      : [],
    pairs,
    choiceOrder: Array.isArray(row.choiceOrder)
      ? row.choiceOrder.map(String)
      : [],
    explanation: String(row.explanation ?? ""),
  };
}
