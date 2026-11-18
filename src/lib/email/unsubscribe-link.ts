import { createHmac, timingSafeEqual } from "node:crypto";

import { getAccessLinkSecret } from "@/lib/my-access/link";
import { normalizedSiteUrl } from "@/lib/seo";

/*
 * The unsubscribe link of a broadcast: the campaign row's lead id plus an HMAC of
 * it under the server secret of «Мой доступ», with its own purpose. The address
 * itself never appears in the URL; the row it names leads to it.
 */

const TOKEN_PURPOSE = "email-unsubscribe:v1";
const LEAD_ID_PATTERN = /^lead_[0-9a-f]{24}$/u;

export const UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

const sign = (secret: string, leadId: string) =>
  createHmac("sha256", secret).update(`${TOKEN_PURPOSE}:${leadId}`).digest("base64url");

export const isUnsubscribeLinkConfigured = () => getAccessLinkSecret() !== "";

export const createUnsubscribeToken = (leadId: string): string | null => {
  const secret = getAccessLinkSecret();

  return secret && LEAD_ID_PATTERN.test(leadId)
    ? `${leadId}.${sign(secret, leadId)}`
    : null;
};

/** The lead id a token was signed for, or null for anything else. */
export const verifyUnsubscribeToken = (token: string | null | undefined) => {
  const secret = getAccessLinkSecret();
  const [leadId = "", signature = "", ...rest] = (token ?? "").trim().split(".");

  if (!secret || rest.length > 0 || !LEAD_ID_PATTERN.test(leadId) || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(secret, leadId));
  const received = Buffer.from(signature);

  return expected.length === received.length && timingSafeEqual(expected, received)
    ? leadId
    : null;
};

export const buildUnsubscribeUrl = (leadId: string, locale: string): string | null => {
  const token = createUnsubscribeToken(leadId);

  if (!token) return null;

  const url = new URL(UNSUBSCRIBE_PATH, normalizedSiteUrl);
  url.searchParams.set("t", token);
  url.searchParams.set("lang", locale);

  return url.toString();
};
