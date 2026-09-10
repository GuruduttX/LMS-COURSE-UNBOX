import { CircleDashed } from "lucide-react";

/**
 * A lesson that exists but has nothing in it yet.
 *
 * Content and its container are separate now: a teacher publishes a subtopic
 * and fills it in over several sittings, so a student can legitimately reach a
 * video with no link or a quiz with no questions. Saying so plainly is the
 * honest answer — better than an empty player frame, which reads as a bug in
 * the app rather than as work still in progress.
 */
export function EmptyPane({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <CircleDashed size={24} aria-hidden />
        </span>
        <h1 className="mt-3 text-lg font-bold text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-600">{message}</p>
      </div>
    </div>
  );
}
