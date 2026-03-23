import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

export const ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME = "admin_invite_links_session";
export const ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const getConfiguredPassword = () => process.env.ADMIN_INVITE_LINKS_PASSWORD?.trim() ?? "";

const getNowUnixSeconds = () => Math.floor(Date.now() / 1000);

const signSessionExpiry = ({
  expiresAtUnix,
  password,
}: {
  expiresAtUnix: number;
  password: string;
}) => createHmac("sha256", password).update(String(expiresAtUnix)).digest("base64url");

const areEqualInTimingSafeWay = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

const getCookieValueFromHeader = ({
  cookieHeader,
  cookieName,
}: {
  cookieHeader: string;
  cookieName: string;
}) => {
  const cookieParts = cookieHeader.split(";").map((part) => part.trim());

  for (const cookiePart of cookieParts) {
    if (!cookiePart) {
      continue;
    }

    const [name, ...valueParts] = cookiePart.split("=");

    if (name?.trim() !== cookieName) {
      continue;
    }

    return valueParts.join("=");
  }

  return "";
};

const getCookieValueFromRequest = ({
  cookieName,
  request,
}: {
  cookieName: string;
  request: Request | NextRequest;
}) => {
  const cookieHeader = request.headers.get("cookie")?.trim() ?? "";

  if (!cookieHeader) {
    return "";
  }

  return getCookieValueFromHeader({ cookieHeader, cookieName });
};

export const isAdminInviteLinksPasswordConfigured = () =>
  Boolean(getConfiguredPassword());

export const isAdminInviteLinksPasswordValid = (candidatePassword: string) => {
  const configuredPassword = getConfiguredPassword();
  const normalizedCandidate = candidatePassword.trim();

  if (!configuredPassword || !normalizedCandidate) {
    return false;
  }

  return areEqualInTimingSafeWay(normalizedCandidate, configuredPassword);
};

export const createAdminInviteLinksSessionCookieValue = () => {
  const configuredPassword = getConfiguredPassword();

  if (!configuredPassword) {
    return "";
  }

  const expiresAtUnix = getNowUnixSeconds() + ADMIN_INVITE_LINKS_SESSION_TTL_SECONDS;
  const signature = signSessionExpiry({
    expiresAtUnix,
    password: configuredPassword,
  });

  return `${expiresAtUnix}.${signature}`;
};

export const isAdminInviteLinksSessionCookieValid = (cookieValue: string) => {
  const configuredPassword = getConfiguredPassword();
  const normalizedCookieValue = cookieValue.trim();

  if (!configuredPassword || !normalizedCookieValue) {
    return false;
  }

  const [expiresAtUnixRaw, signature] = normalizedCookieValue.split(".", 2);
  const expiresAtUnix = Number.parseInt(expiresAtUnixRaw ?? "", 10);

  if (!Number.isFinite(expiresAtUnix) || expiresAtUnix <= getNowUnixSeconds()) {
    return false;
  }

  if (!signature) {
    return false;
  }

  const expectedSignature = signSessionExpiry({
    expiresAtUnix,
    password: configuredPassword,
  });

  return areEqualInTimingSafeWay(signature, expectedSignature);
};

export const isAdminInviteLinksRequestAuthenticated = (
  request: Request | NextRequest,
) => {
  const cookieValue = getCookieValueFromRequest({
    cookieName: ADMIN_INVITE_LINKS_SESSION_COOKIE_NAME,
    request,
  });

  return isAdminInviteLinksSessionCookieValid(cookieValue);
};
