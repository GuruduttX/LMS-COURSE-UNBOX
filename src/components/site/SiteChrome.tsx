import "server-only";

import { SiteHeader } from "@/components/site/SiteHeader";
import { listPublicPrograms } from "@/lib/data/public-programs";
import { getTheme } from "@/lib/theme-server";

/**
 * The public header, with the two things it cannot fetch for itself.
 *
 * `SiteHeader` is a client component — it owns the dropdown, the mobile sheet
 * and the scroll state — so it can read neither the theme cookie nor the
 * programs collection. This is the server half, and it exists so that every
 * public page renders `<PublicHeader />` rather than each assembling the same
 * two awaits and formatting `meta` a slightly different way.
 */

export type ProgramNavItem = {
  slug: string;
  title: string;
  /**
   * The grey line under the title in the dropdown — "3 months · 9 modules".
   *
   * Formatted here rather than in the header because the parts are nullable:
   * a program with no timeline has no month count, and a client component
   * deciding what to print for a null is a decision made in three places. Empty
   * means there is nothing worth saying, and the line is not rendered.
   */
  meta: string;
};

export async function PublicHeader() {
  const [theme, programs] = await Promise.all([getTheme(), listPublicPrograms()]);

  return <SiteHeader theme={theme} programs={programs.map(toNavItem)} />;
}

export function toNavItem(program: {
  slug: string;
  title: string;
  durationMonths: number | null;
  moduleCount: number;
}): ProgramNavItem {
  const parts: string[] = [];

  if (program.durationMonths !== null) {
    parts.push(
      `${program.durationMonths} ${program.durationMonths === 1 ? "month" : "months"}`,
    );
  }
  if (program.moduleCount > 0) {
    parts.push(
      `${program.moduleCount} ${program.moduleCount === 1 ? "module" : "modules"}`,
    );
  }

  return {
    slug: program.slug,
    title: program.title,
    meta: parts.join(" · "),
  };
}
