import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizedSiteUrl } from "@/lib/seo";

/*
 * «Мой доступ» opens by a personal link from our emails (HUB-D30, HUB-D31): the
 * customer id plus an HMAC of it under a server secret. Nothing is stored, the
 * link never expires, and changing ACCESS_LINK_SECRET revokes every link at once.
 * Without the secret the feature stays off: no buttons, no links.
 */

const TOKEN_PURPOSE = "my-access:v1";
const MIN_SECRET_LENGTH = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const getSecret = () => {
  const secret = process.env.ACCESS_LINK_SECRET?.trim() ?? "";

  return secret.length >= MIN_SECRET_LENGTH ? secret : "";
};

const sign = (secret: string, customerId: string) =>
  createHmac("sha256", secret)
    .update(`${TOKEN_PURPOSE}:${customerId}`)
    .digest("base64url");

export const isMyAccessLinkConfigured = () => getSecret() !== "";

/** The token of one customer, or null when the feature is off or the id is not a UUID. */
export const createMyAccessToken = (customerId: string): string | null => {
  const secret = getSecret();
  const id = customerId.trim().toLowerCase();

  if (!secret || !UUID_PATTERN.test(id)) {
    return null;
  }

  return `${id}.${sign(secret, id)}`;
};

/** The customer id a token was signed for, or null for anything else. */
export const verifyMyAccessToken = (token: string | null | undefined): string | null => {
  const secret = getSecret();
  const [id = "", signature = "", ...rest] = (token ?? "").trim().split(".");

  if (!secret || rest.length > 0 || !UUID_PATTERN.test(id) || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(secret, id));
  const received = Buffer.from(signature);

  return expected.length === received.length && timingSafeEqual(expected, received)
    ? id
    : null;
};

/** The page path with the token, for links shown on the site itself. */
export const buildMyAccessPath = (
  customerId: string | null | undefined,
): string | null => {
  const token = customerId ? createMyAccessToken(customerId) : null;

  return token ? `/access?k=${token}` : null;
};

/**
 * The absolute link for emails. The locale segment only sets the reader's language:
 * the site keeps no locale prefix and redirects to /access with the query intact.
 */
export const buildMyAccessUrl = (
  customerId: string | null | undefined,
  locale?: string | null,
): string | null => {
  const path = buildMyAccessPath(customerId);

  if (!path) {
    return null;
  }

  const localeSegment =
    locale === "ru" || locale === "en" || locale === "pl" ? `/${locale}` : "";

  return `${normalizedSiteUrl}${localeSegment}${path}`;
};
