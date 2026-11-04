/**
 * Route change cross-fade (see components/layout/PageTransition and the
 * "Page transitions" block in app/globals.css).
 *
 * THE OFF SWITCH: set this to `false` and no view transition is ever started -
 * navigation renders exactly as it did before the feature existed. The CSS
 * only targets `::view-transition-*` pseudo-elements, which then never exist.
 */
export const PAGE_TRANSITIONS_ENABLED = true;

/**
 * `view-transition-class` of the invisible marker whose enter/exit makes React
 * start the transition. Its own snapshot is hidden in globals.css; what the
 * reader sees is the cross-fade of the page itself (`root`).
 */
export const PAGE_TRANSITION_MARKER_CLASS = "page-route-marker";

const ADMIN_PATH_PATTERN = /^\/admin(?:\/|$)/u;

/** Only the public site cross-fades; the admin area navigates as before. */
export const isPageTransitionPath = (pathname: string | null): boolean =>
  pathname !== null && !ADMIN_PATH_PATTERN.test(pathname);

/**
 * Back/forward. React commits a traversal synchronously when the route is in
 * the router cache, and a synchronous commit never starts a view transition.
 * A traversal that has to wait for the server does run as a transition; when
 * the browser has already animated it (iOS Safari edge swipe, Android
 * predictive back), a cross-fade on top would replay the change, so it is
 * skipped. Only a traversal the browser reports as un-animated
 * (`hasUAVisualTransition === false`, e.g. a desktop back button) keeps it; a
 * browser that does not report it at all is treated as animated.
 */
export const shouldSkipTraversalTransition = (
  hasUAVisualTransition: boolean | undefined,
): boolean => hasUAVisualTransition !== false;
