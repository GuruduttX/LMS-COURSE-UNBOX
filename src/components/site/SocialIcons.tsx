/**
 * Social marks drawn in the lucide stroke style (24px grid, strokeWidth 2).
 *
 * lucide-react v1 removed brand icons, so these live here rather than being
 * imported. Keep them geometric and consistent with the rest of the icon set —
 * do not swap in a second icon library for three glyphs (design.md §9).
 */
type IconProps = { size?: number; className?: string };

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

export function InstagramIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function YoutubeIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="5" width="20" height="14" rx="4.5" />
      <path d="M10.5 9.2 15.5 12l-5 2.8Z" fill="currentColor" />
    </svg>
  );
}

export function LinkedinIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="2" width="20" height="20" rx="4" />
      <path d="M7 10.5V17" />
      <circle cx="7" cy="7.3" r="0.9" fill="currentColor" stroke="none" />
      <path d="M11.5 17v-6.5M11.5 13.4a2.6 2.6 0 0 1 5.2 0V17" />
    </svg>
  );
}
