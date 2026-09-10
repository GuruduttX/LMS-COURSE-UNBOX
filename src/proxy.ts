import { NextResponse, type NextRequest } from "next/server";

import { areaFor, ROLE_HOME } from "@/lib/auth/roles";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { verifySessionToken } from "@/lib/auth/token";

/**
 * Route gate. (Next 16 renamed `middleware.ts` to `proxy.ts` — same mechanics,
 * see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.)
 *
 * **This is not the authorization boundary.** It runs on the edge runtime with
 * no database: all it can see is a signed cookie, so a user suspended a minute
 * ago still looks fine here, and a role changed a minute ago still reads as the
 * old one. It exists to save a signed-out visitor a wasted render and to send a
 * teacher who typed /admin somewhere useful.
 *
 * The real check is `requireRole` in lib/auth/guards.ts, which reads the
 * database and runs in every layout, page and server action.
 *
 * Keep this file's imports edge-safe: `jose` yes, bcryptjs and Mongoose never.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const area = areaFor(pathname);
  if (!area) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token
    ? await verifySessionToken(token, process.env.AUTH_SECRET ?? "")
    : null;

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
  }

  // Admin is admitted everywhere — the superset rule, same as requireRole.
  if (session.role !== "admin" && !area.roles.includes(session.role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/manager/:path*",
    "/teacher/:path*",
    "/dashboard/:path*",
    "/learn/:path*",
  ],
};
