import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const ADMIN_ROUTE_SEGMENT = "admin";

const getRequestPathSegments = (pathname: string) =>
  pathname
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

const isAdminRoute = (pathname: string) => {
  const pathSegments = getRequestPathSegments(pathname);

  if (pathSegments.length < 1) {
    return false;
  }

  const localeOffset = routing.locales.includes(
    pathSegments[0] as (typeof routing.locales)[number],
  )
    ? 1
    : 0;

  return pathSegments[localeOffset] === ADMIN_ROUTE_SEGMENT;
};

export default function proxy(request: NextRequest) {
  if (!isAdminRoute(request.nextUrl.pathname)) {
    return intlMiddleware(request);
  }

  // Keep admin route outside i18n middleware rewrites.
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
