"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AREA_HOME } from "@/components/staff/nav";

import {
  STAFF_VIEW_COOKIE,
  STAFF_VIEW_MAX_AGE_SECONDS,
  isArea,
} from "./staff-view";

/**
 * Switch the admin's shell, then land on that area's home.
 *
 * A form POST rather than a link because it changes stored state: a `<Link>`
 * here would be a GET that Next may prefetch, and the rail would quietly
 * re-skin itself under the cursor.
 *
 * No role check: the cookie only picks a menu, and every page behind it is
 * guarded on its own. A non-admin who forged this call would get a nav they are
 * bounced out of on the first click.
 */
export async function switchStaffView(formData: FormData): Promise<void> {
  const area = formData.get("area");
  if (!isArea(area)) return;

  (await cookies()).set(STAFF_VIEW_COOKIE, area, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_VIEW_MAX_AGE_SECONDS,
  });

  redirect(AREA_HOME[area]);
}
