import { createHmac, timingSafeEqual } from "node:crypto";

import { getAccessLinkSecret } from "@/lib/my-access/link";
import { normalizedSiteUrl } from "@/lib/seo";

/*
 * The page of a renewal invitation opens by a signed link, nothing stored (as «Мой
 * доступ»): the purchase id, the moment the link was made and an HMAC of both under
 * ACCESS_LINK_SECRET with its own purpose. A link lives 30 days; every email makes
 * a fresh one. Revoking the invitation stops every link through the purchase itself.
 */

const TOKEN_PURPOSE = "access-invitation:v1";
export const INVITATION_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const sign = (secret: string, purchaseId: string, issuedAt: number) =>
  createHmac("sha256", secret)
    .update(`${TOKEN_PURPOSE}:${purchaseId}:${issuedAt}`)
    .digest("base64url");

export const createInvitationToken = (
  purchaseId: string,
  now = new Date(),
): string | null => {
  const secret = getAccessLinkSecret();
  const id = purchaseId.trim().toLowerCase();

  if (!secret || !UUID_PATTERN.test(id)) return null;

  const issuedAt = Math.floor(now.getTime() / 1000);
  return `${id}.${issuedAt.toString(36)}.${sign(secret, id, issuedAt)}`;
};

export type InvitationTokenCheck =
  { status: "valid"; purchaseId: string } | { status: "expired" } | { status: "invalid" };

export const verifyInvitationToken = (
  token: string | null | undefined,
  now = new Date(),
): InvitationTokenCheck => {
  const secret = getAccessLinkSecret();
  const [id = "", issued = "", signature = "", ...rest] = (token ?? "").trim().split(".");
  const issuedAt = Number.parseInt(issued, 36);

  if (
    !secret ||
    rest.length > 0 ||
    !UUID_PATTERN.test(id) ||
    !signature ||
    !Number.isSafeInteger(issuedAt)
  ) {
    return { status: "invalid" };
  }

  const expected = Buffer.from(sign(secret, id, issuedAt));
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { status: "invalid" };
  }

  return issuedAt * 1000 + INVITATION_LINK_TTL_MS < now.getTime()
    ? { status: "expired" }
    : { status: "valid", purchaseId: id };
};

/** The page link for emails and the admin journal; null when the secret is missing. */
export const buildInvitationUrl = (
  purchaseId: string,
  locale: string | null | undefined,
  now = new Date(),
): string | null => {
  const token = createInvitationToken(purchaseId, now);
  if (!token) return null;

  const localeSegment =
    locale === "ru" || locale === "en" || locale === "pl" ? `/${locale}` : "";
  return `${normalizedSiteUrl}${localeSegment}/invitation?k=${token}`;
};

/** Ties a Telegram login nonce to one invitation (see `createTelegramLoginNonce`). */
export const invitationNonceScope = (purchaseId: string) => ({
  checkoutSessionId: `invitation:${purchaseId}`,
  slug: "access-invitation",
});
