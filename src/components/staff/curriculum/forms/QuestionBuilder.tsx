"use client";

/**
 * Writing questions — four kinds, one builder.
 *
 * Every quiz and every test in the app grades itself the moment a student
 * submits, which is only possible because the author marks the right answer
 * here. So **the correct-answer control is the most important thing on the
 * screen**, and in each kind it sits *on* the answer rather than in a dropdown
 * underneath: a radio in the option row, a checkbox for "pick all that apply",
 * a pair of radios for true/false. Matching is the exception and needs none —
 * writing the pair *is* marking it right, which is why it is the one kind an
 * author cannot get half-done.
 *
 * The list posts as JSON in a single hidden field rather than as `questions[0]
 * [options][1][text]` name soup: one parse on the server instead of a
 * hand-rolled decoder, and the shape matches `QuestionInput` exactly, so the
 * same validator runs on both sides.
 *
 * Per-question errors are computed here from that shared validator while
 * typing, so an author sees "mark the correct option" against the question that
 * needs it rather than as one line at the top of a long form.
 */
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select, TextInput, Textarea } from "@/components/ui/Field";
import {
  QUESTION_KINDS,
  QUESTION_KIND_HINT,
  QUESTION_KIND_LABEL,
  type QuestionKind,
} from "@/lib/curriculum/question-kinds";
import {
  emptyQuestion,
  hasErrors,
  MAX_OPTIONS,
  MAX_PAIRS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  MIN_PAIRS,
  validateQuestion,
  type QuestionInput,
} from "@/lib/validation/curriculum";

export function QuestionBuilder({
  initial,
  /** True once the author has tried to save — errors stay hidden until then. */
  showErrors,
  /**
   * Which kinds this paper may ask. Defaults to all four; the subtopic quiz
   * passes `["single"]`, because `QuizRunner` — the practice-quiz player, a
   * different component from the test runner — only knows how to draw one
   * kind. Offering an author a question its player cannot render would be a
   * broken lesson, so the builder is narrowed rather than the runner guessed at.
   */
  allow = QUESTION_KINDS,
}: {
  initial: QuestionInput[];
  showErrors: boolean;
  allow?: readonly QuestionKind[];
}) {
  const [questions, setQuestions] = useState<QuestionInput[]>(initial);

  function update(index: number, next: QuestionInput) {
    setQuestions((current) =>
      current.map((question, at) => (at === index ? next : question)),
    );
  }

  function add(kind: QuestionKind) {
    setQuestions((current) => [
      ...current,
      emptyQuestion(`q${Date.now().toString(36)}`, kind),
    ]);
  }

  function remove(index: number) {
    setQuestions((current) => current.filter((_, at) => at !== index));
  }

  return (
    <div className="space-y-4">
      {/* The whole list, as the server will read it. */}
      <input type="hidden" name="questions" value={JSON.stringify(questions)} />

      {questions.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No questions yet"
          description="A paper needs at least one question before it can be published. A draft may be empty."
        />
      ) : (
        <ol className="space-y-4">
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              index={index}
              question={question}
              showErrors={showErrors}
              allow={allow}
              onChange={(next) => update(index, next)}
              onRemove={() => remove(index)}
            />
          ))}
        </ol>
      )}

      {questions.length >= MAX_QUESTIONS ? (
        <p className="text-sm text-ink-500">
          That is the maximum of {MAX_QUESTIONS} questions.
        </p>
      ) : (
        // One button per kind rather than "Add" then pick: the kind decides
        // what the card even looks like, so choosing it first is the honest
        // order and saves a step on the common one.
        <div className="flex flex-wrap gap-2">
          {allow.map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => add(kind)}
              title={QUESTION_KIND_HINT[kind]}
            >
              <Plus size={14} aria-hidden />
              {kind === "single"
                ? "Multiple choice"
                : QUESTION_KIND_LABEL[kind]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  question,
  showErrors,
  allow,
  onChange,
  onRemove,
}: {
  index: number;
  question: QuestionInput;
  showErrors: boolean;
  allow: readonly QuestionKind[];
  onChange: (next: QuestionInput) => void;
  onRemove: () => void;
}) {
  const errors = validateQuestion(question);
  const show = showErrors && hasErrors(errors);
  const { confirm, dialog } = useConfirm();

  /**
   * Only asks once something has been typed. A question added by mistake and
   * removed a second later is not a decision worth a dialog; one with a prompt
   * in it is unsaved work that no undo brings back.
   */
  async function removeQuestion() {
    if (question.prompt.trim() === "") {
      onRemove();
      return;
    }
    const ok = await confirm({
      title: `Remove question ${index + 1}?`,
      message:
        "Its prompt, options and explanation go with it. Nothing is saved until you save the form, so this can't be undone here.",
      confirmLabel: "Remove question",
    });
    if (ok) onRemove();
  }

  /**
   * Switching kind keeps what is kind-agnostic — the prompt and the
   * explanation, the two things an author actually typed — and rebuilds the
   * rest from scratch. Carrying options across into a matching question would
   * leave half-migrated data that validates but means nothing.
   */
  function changeKind(kind: QuestionKind) {
    if (kind === question.kind) return;
    onChange({
      ...emptyQuestion(question.id, kind),
      prompt: question.prompt,
      explanation: question.explanation,
    });
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Question {index + 1}
        </span>
        <button
          type="button"
          onClick={() => void removeQuestion()}
          className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-600 hover:text-danger-700"
        >
          <Trash2 size={14} aria-hidden />
          Remove
        </button>
      </div>

      <div className="mt-3 space-y-4">
        {allow.length > 1 ? (
          <Field id={`${question.id}-kind`} label="Type" required>
            <Select
              id={`${question.id}-kind`}
              value={question.kind}
              onChange={(event) =>
                changeKind(event.target.value as QuestionKind)
              }
            >
              {allow.map((kind) => (
                <option key={kind} value={kind}>
                  {QUESTION_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          id={`${question.id}-prompt`}
          label={question.kind === "boolean" ? "Statement" : "Question"}
          error={show ? errors.prompt : undefined}
          required
          hint={QUESTION_KIND_HINT[question.kind]}
        >
          <Textarea
            id={`${question.id}-prompt`}
            value={question.prompt}
            onChange={(event) =>
              onChange({ ...question, prompt: event.target.value })
            }
            className="min-h-16"
            hasError={Boolean(show && errors.prompt)}
          />
        </Field>

        {question.kind === "matching" ? (
          <PairsField
            question={question}
            errors={errors}
            show={show}
            onChange={onChange}
          />
        ) : question.kind === "boolean" ? (
          <BooleanField
            question={question}
            errors={errors}
            show={show}
            onChange={onChange}
          />
        ) : (
          <OptionsField
            question={question}
            errors={errors}
            show={show}
            onChange={onChange}
          />
        )}

        <Field
          id={`${question.id}-explanation`}
          label="Explanation"
          error={show ? errors.explanation : undefined}
          required
          hint="Shown after the student submits, right or wrong. This is the teaching."
        >
          <Textarea
            id={`${question.id}-explanation`}
            value={question.explanation}
            onChange={(event) =>
              onChange({ ...question, explanation: event.target.value })
            }
            className="min-h-16"
            hasError={Boolean(show && errors.explanation)}
          />
        </Field>
      </div>
    </li>
  );
}

type FieldProps = {
  question: QuestionInput;
  errors: ReturnType<typeof validateQuestion>;
  show: boolean;
  onChange: (next: QuestionInput) => void;
};

/** single and multi — the same option list, marked one way or the other. */
function OptionsField({ question, errors, show, onChange }: FieldProps) {
  const multi = question.kind === "multi";

  function setOption(optionIndex: number, text: string) {
    onChange({
      ...question,
      options: question.options.map((option, at) =>
        at === optionIndex ? { ...option, text } : option,
      ),
    });
  }

  function toggle(optionId: string) {
    if (!multi) {
      onChange({ ...question, correctOptionId: optionId });
      return;
    }

    const marked = question.correctOptionIds.includes(optionId)
      ? question.correctOptionIds.filter((id) => id !== optionId)
      : [...question.correctOptionIds, optionId];

    onChange({ ...question, correctOptionIds: marked });
  }

  function addOption() {
    onChange({
      ...question,
      options: [
        ...question.options,
        { id: `${question.id}-o${Date.now().toString(36)}`, text: "" },
      ],
    });
  }

  function removeOption(optionIndex: number) {
    const option = question.options[optionIndex];
    onChange({
      ...question,
      options: question.options.filter((_, at) => at !== optionIndex),
      // Removing the option that was marked correct leaves the question
      // unmarked rather than silently promoting its neighbour.
      correctOptionId:
        question.correctOptionId === option.id ? "" : question.correctOptionId,
      correctOptionIds: question.correctOptionIds.filter(
        (id) => id !== option.id,
      ),
    });
  }

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-700">
        {multi
          ? "Options — tick every correct one"
          : "Options — select the correct one"}
      </legend>

      <div className="space-y-2">
        {question.options.map((option, optionIndex) => (
          <div key={option.id} className="flex items-center gap-2">
            <input
              type={multi ? "checkbox" : "radio"}
              name={`${question.id}-correct`}
              checked={
                multi
                  ? question.correctOptionIds.includes(option.id)
                  : question.correctOptionId === option.id
              }
              onChange={() => toggle(option.id)}
              className="h-4 w-4 shrink-0 accent-brand-600"
              aria-label={`Option ${optionIndex + 1} is correct`}
            />
            <TextInput
              value={option.text}
              onChange={(event) => setOption(optionIndex, event.target.value)}
              placeholder={`Option ${optionIndex + 1}`}
              hasError={Boolean(show && errors.options)}
            />
            {question.options.length > MIN_OPTIONS ? (
              <button
                type="button"
                onClick={() => removeOption(optionIndex)}
                aria-label={`Remove option ${optionIndex + 1}`}
                className="shrink-0 rounded p-2 text-ink-500 hover:text-danger-700"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {show && (errors.options || errors.correctOptionId) ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
          {errors.options ?? errors.correctOptionId}
        </p>
      ) : null}

      {question.options.length < MAX_OPTIONS ? (
        <button
          type="button"
          onClick={addOption}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          <Plus size={14} aria-hidden />
          Add an option
        </button>
      ) : null}
    </fieldset>
  );
}

/** True or false — two fixed options, so only the answer is authored. */
function BooleanField({ question, errors, show, onChange }: FieldProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-700">
        Is the statement true?
      </legend>

      <div className="flex gap-2">
        {question.options.map((option) => (
          <label
            key={option.id}
            className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
              question.correctOptionId === option.id
                ? "border-brand-600 bg-brand-50 text-ink-900"
                : "border-border bg-surface text-ink-700 hover:border-border-strong"
            }`}
          >
            <input
              type="radio"
              name={`${question.id}-correct`}
              checked={question.correctOptionId === option.id}
              onChange={() =>
                onChange({ ...question, correctOptionId: option.id })
              }
              className="h-4 w-4 accent-brand-600"
            />
            {option.text}
          </label>
        ))}
      </div>

      {show && errors.correctOptionId ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
          {errors.correctOptionId}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * Matching pairs.
 *
 * The author writes them side by side, in the order that reads best; the
 * student gets the right-hand column shuffled, and each pair carries a
 * `rightId` unrelated to its left-hand id so the pairing cannot be read out of
 * the payload. Neither of those is an author's problem, so neither is on screen.
 */
function PairsField({ question, errors, show, onChange }: FieldProps) {
  function setSide(pairIndex: number, side: "left" | "right", value: string) {
    onChange({
      ...question,
      pairs: question.pairs.map((pair, at) =>
        at === pairIndex ? { ...pair, [side]: value } : pair,
      ),
    });
  }

  function addPair() {
    const unique = Date.now().toString(36);
    onChange({
      ...question,
      pairs: [
        ...question.pairs,
        {
          id: `${question.id}-p${unique}`,
          rightId: `${question.id}-r${unique}`,
          left: "",
          right: "",
        },
      ],
    });
  }

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-700">
        Pairs — each item on the left with its match on the right
      </legend>

      <div className="space-y-2">
        {question.pairs.map((pair, pairIndex) => (
          <div key={pair.id} className="flex items-center gap-2">
            <TextInput
              value={pair.left}
              onChange={(event) =>
                setSide(pairIndex, "left", event.target.value)
              }
              placeholder={`Item ${pairIndex + 1}`}
              hasError={Boolean(show && errors.pairs)}
            />
            <span aria-hidden className="shrink-0 text-ink-400">
              →
            </span>
            <TextInput
              value={pair.right}
              onChange={(event) =>
                setSide(pairIndex, "right", event.target.value)
              }
              placeholder={`Match ${pairIndex + 1}`}
              hasError={Boolean(show && errors.pairs)}
            />
            {question.pairs.length > MIN_PAIRS ? (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...question,
                    pairs: question.pairs.filter((_, at) => at !== pairIndex),
                  })
                }
                aria-label={`Remove pair ${pairIndex + 1}`}
                className="shrink-0 rounded p-2 text-ink-500 hover:text-danger-700"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {show && errors.pairs ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
          {errors.pairs}
        </p>
      ) : null}

      {question.pairs.length < MAX_PAIRS ? (
        <button
          type="button"
          onClick={addPair}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
        >
          <Plus size={14} aria-hidden />
          Add a pair
        </button>
      ) : null}

      <p className="mt-2 text-xs text-ink-500">
        Students see the right-hand column shuffled.
      </p>
    </fieldset>
  );
}
