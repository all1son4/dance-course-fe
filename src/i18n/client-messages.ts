import type { AbstractIntlMessages } from "next-intl";

/**
 * Namespaces needed by client components that live in the locale layout on
 * every page (header, footer, cookie banner, birthday popup, shared UI).
 * Server components read translations on the server and need nothing here.
 */
export const GLOBAL_CLIENT_NAMESPACES = [
  "Common",
  "Header",
  "Footer",
  "CookieConsent",
  "BirthdayPopup",
] as const;

/**
 * Picks whole namespaces or dotted sub-trees (e.g. "FirstTouchPage.signupDialog")
 * out of the full message catalogue, preserving the nesting the components
 * address them by. Everything else stays on the server and out of the HTML.
 */
export const pickMessages = (
  messages: AbstractIntlMessages,
  paths: readonly string[],
): AbstractIntlMessages => {
  const picked: AbstractIntlMessages = {};

  for (const path of paths) {
    const segments = path.split(".");
    let source: unknown = messages;
    let target: AbstractIntlMessages = picked;

    for (const [index, segment] of segments.entries()) {
      if (typeof source !== "object" || source === null || !(segment in source)) {
        source = undefined;
        break;
      }

      source = (source as Record<string, unknown>)[segment];

      if (index === segments.length - 1) {
        target[segment] = source as AbstractIntlMessages[string];
      } else {
        const next = (target[segment] ?? {}) as AbstractIntlMessages;
        target[segment] = next;
        target = next;
      }
    }
  }

  return picked;
};
