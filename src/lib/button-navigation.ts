/**
 * Link semantics shared by the Button's anchor variants: which hrefs are
 * in-app route changes, which clicks the browser should keep, and what `rel`
 * an external target gets. Pure so it can be unit-tested without a DOM.
 */
export const HASH_PREFIX = "#";
export const SELF_TARGET = "_self";
export const BLANK_TARGET = "_blank";
export const DEFAULT_EXTERNAL_REL = "noopener noreferrer";

type ModifierEventLike = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

/** Hash is intentionally omitted: in-document navigation does not wait for a route transition. */
export const getRouteKey = (pathname: string, search: string): string =>
  `${pathname}${search}`;

/** Relative or root-relative URL that the app router will handle as a route change. */
export const isInternalNavigationHref = (value: string): boolean => {
  if (!value || value.startsWith(HASH_PREFIX) || value.startsWith("//")) {
    return false;
  }

  if (/^(mailto|tel|sms|javascript):/i.test(value)) {
    return false;
  }

  return (
    value.startsWith("/") ||
    value.startsWith("?") ||
    value.startsWith("./") ||
    value.startsWith("../")
  );
};

/** Middle/right clicks and modifier clicks open elsewhere - the button must not react. */
export const isModifiedClickEvent = (event: ModifierEventLike): boolean =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey;

export const getLinkRel = (
  target: string,
  relFromProps: string | undefined,
): string | undefined =>
  target === BLANK_TARGET ? (relFromProps ?? DEFAULT_EXTERNAL_REL) : relFromProps;

/**
 * True when `href` resolves to the route the document is already on (ignoring
 * the hash), so there is no navigation to show a loading state for. Unparseable
 * hrefs count as "skip" too. `currentHref` is the document's URL.
 */
export const isSameRoute = (href: string, currentHref: string): boolean => {
  try {
    const targetUrl = new URL(href, currentHref);
    const currentUrl = new URL(currentHref);

    return (
      getRouteKey(targetUrl.pathname, targetUrl.search) ===
      getRouteKey(currentUrl.pathname, currentUrl.search)
    );
  } catch {
    return true;
  }
};

/** Only same-tab, in-app hrefs get the route loading state. */
export const shouldTrackRouteLoading = (href: string, target: string): boolean =>
  target === SELF_TARGET && isInternalNavigationHref(href);

/** Same-tab hash links scroll in place instead of navigating. */
export const isInDocumentHashHref = (href: string, target: string): boolean =>
  href.startsWith(HASH_PREFIX) && target === SELF_TARGET;
