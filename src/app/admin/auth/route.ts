import {
  ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME,
  ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS,
  createAdminInviteLinksSessionCookieValue,
  isAdminInviteLinksPasswordConfigured,
  isAdminInviteLinksPasswordValid,
  isAdminInviteLinksRequestAuthenticated,
} from "@/lib/admin-invite-links-auth";
import {
  hasJsonContentType,
  isPayloadTooLarge,
  isTrustedBrowserOrigin,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_AUTH_BODY_BYTES = 2 * 1024;

type AuthBody = {
  password?: string;
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksPasswordConfigured()) {
    return jsonNoStore(
      {
        errorCode: "auth_not_configured",
      },
      { status: 503 },
    );
  }

  return jsonNoStore({
    authorized: isAdminInviteLinksRequestAuthenticated(request),
  });
}

export async function POST(request: Request) {
  if (!isTrustedBrowserOrigin(request)) {
    return jsonNoStore(
      {
        errorCode: "invalid_origin",
      },
      { status: 403 },
    );
  }

  if (!isAdminInviteLinksPasswordConfigured()) {
    return jsonNoStore(
      {
        errorCode: "auth_not_configured",
      },
      { status: 503 },
    );
  }

  if (isPayloadTooLarge(request, MAX_AUTH_BODY_BYTES)) {
    return jsonNoStore(
      {
        errorCode: "payload_too_large",
      },
      { status: 413 },
    );
  }

  if (!hasJsonContentType(request)) {
    return jsonNoStore(
      {
        errorCode: "unsupported_media_type",
      },
      { status: 415 },
    );
  }

  const requesterIp = getRequestIp(request);
  const rateLimit = await consumeRateLimit({
    key: `admin:invite-links:auth:${requesterIp}`,
    limit: 20,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      {
        errorCode: "rate_limited",
      },
      {
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
        status: 429,
      },
    );
  }

  const body = await parseJsonBody<AuthBody>(request);

  if (!body) {
    return jsonNoStore(
      {
        errorCode: "invalid_request_body",
      },
      { status: 400 },
    );
  }

  const password = body.password?.trim() ?? "";

  if (!isAdminInviteLinksPasswordValid(password)) {
    return jsonNoStore(
      {
        errorCode: "invalid_password",
      },
      { status: 401 },
    );
  }

  const sessionCookieValue = createAdminInviteLinksSessionCookieValue();

  if (!sessionCookieValue) {
    return jsonNoStore(
      {
        errorCode: "auth_not_configured",
      },
      { status: 503 },
    );
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
    return jsonNoStore(
      {
        errorCode: "invalid_origin",
      },
      { status: 403 },
    );
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
