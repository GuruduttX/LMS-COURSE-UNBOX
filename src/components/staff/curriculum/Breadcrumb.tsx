/**
 * Where you are in the tree, and the way back up.
 *
 * The authoring screens go five levels deep, which is past the point where a
 * single "Back" link is enough — from a subtopic you often want the course, not
 * the module. The last crumb is the current page and is not a link.
 */
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-600">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${index}`}
              className="flex items-center gap-1"
            >
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded hover:text-ink-900 hover:underline underline-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={last ? "font-medium text-ink-900" : undefined}>
                  {item.label}
                </span>
              )}
              {last ? null : (
                <ChevronRight size={14} aria-hidden className="text-ink-400" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
