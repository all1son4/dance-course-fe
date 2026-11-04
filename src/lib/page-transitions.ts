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

type DeviceHints = {
  /** `navigator.hardwareConcurrency`; undefined where the browser hides it. */
  cores?: number;
  /** `navigator.deviceMemory` in GB (Chromium only); undefined elsewhere. */
  memoryGb?: number;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
};

/* Below these the whole-page snapshot is not free: budget Android phones
   (2-4 GB, 4 slow cores) can drop a frame or two taking it, so they navigate
   instantly as before. Unknown values (Safari, Firefox) count as capable:
   those browsers only report on hardware that runs the fade smoothly. */
const MIN_CORES = 4;
const MIN_MEMORY_GB = 4;

/** Whether this device should get the cross-fade at all. */
export const canAffordPageTransitions = ({
  cores,
  memoryGb,
  saveData,
}: DeviceHints): boolean => {
  if (saveData) return false;
  if (cores !== undefined && cores < MIN_CORES) return false;
  if (memoryGb !== undefined && memoryGb < MIN_MEMORY_GB) return false;
  return true;
};

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
