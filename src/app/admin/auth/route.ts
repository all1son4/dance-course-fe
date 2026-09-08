import {
  ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME,
  ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS,
  createAdminInviteLinksSessionCookieValue,
  isAdminInviteLinksPasswordConfigured,
  isAdminInviteLinksPasswordValid,
  isAdminInviteLinksRequestAuthenticated,
} from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  isTrustedBrowserOrigin,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_AUTH_BODY_BYTES = 2 * 1024;

type AuthBody = {
  password?: string;
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksPasswordConfigured()) {
    return jsonErrorNoStore("auth_not_configured", { status: 503 });
  }

  return jsonNoStore({
    authorized: isAdminInviteLinksRequestAuthenticated(request),
  });
}

export async function POST(request: Request) {
  // Origin is answered before the configuration probe so an untrusted caller
  // cannot learn whether an admin password is set on this deployment. The
  // shared guard then re-checks it and applies the body-shape rules.
  if (!isTrustedBrowserOrigin(request)) {
    return jsonErrorNoStore("invalid_origin", { status: 403 });
  }

  if (!isAdminInviteLinksPasswordConfigured()) {
    return jsonErrorNoStore("auth_not_configured", { status: 503 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_AUTH_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:invite-links:auth",
    limit: 20,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  const body = await parseJsonBody<AuthBody>(request);

  if (!body) {
    return jsonErrorNoStore("invalid_request_body", { status: 400 });
  }

  const password = body.password?.trim() ?? "";

  if (!isAdminInviteLinksPasswordValid(password)) {
    return jsonErrorNoStore("invalid_password", { status: 401 });
  }

  const sessionCookieValue = createAdminInviteLinksSessionCookieValue();

  if (!sessionCookieValue) {
    return jsonErrorNoStore("auth_not_configured", { status: 503 });
  }

  const response = jsonNoStore({
    authorized: true,
    status: "ok",
  });

  response.cookies.set({
    name: ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME,
    value: sessionCookieValue,
    httpOnly: true,
    maxAge: ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS,
    path: "/admin",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}

export async function DELETE(request: Request) {
  if (!isTrustedBrowserOrigin(request)) {
    return jsonErrorNoStore("invalid_origin", { status: 403 });
  }

  const response = jsonNoStore({
    status: "ok",
  });

  response.cookies.set({
    name: ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/admin",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
