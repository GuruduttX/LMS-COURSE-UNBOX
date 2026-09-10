import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/auth/initials";

/**
 * Somebody's picture, or their initials when they haven't set one.
 *
 * The monogram is not a placeholder to be replaced later — most accounts will
 * never upload a photo, so it is the normal case and has to look deliberate.
 *
 * A plain `<img>`, like the video thumbnail in `SubtopicDetail`: the source is
 * Cloudinary rather than a configured `next/image` domain, and uploads are
 * served exactly as they arrived (see `lib/uploads/cloudinary.ts`), so there is
 * no optimisation for `next/image` to do here.
 */
const SIZES = {
  sm: "h-9 w-9 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-24 w-24 text-2xl sm:h-28 sm:w-28 sm:text-3xl",
} as const;

export function Avatar({
  name,
  src,
  size = "sm",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const base = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    SIZES[size],
    className,
  );

  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- see above. */
      <img
        src={src}
        alt=""
        className={cn(base, "border border-border object-cover")}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(base, "bg-brand-100 font-bold text-brand-700")}
    >
      {initialsOf(name)}
    </span>
  );
}
