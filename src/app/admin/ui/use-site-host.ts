import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * The site's own address ("annastrok.com", "dev…vercel.app"), so the operator
 * always sees which site they are on. Empty during server rendering, then filled
 * in on the client without a hydration mismatch.
 */
export const useSiteHost = () =>
  useSyncExternalStore(
    subscribe,
    () => window.location.host.replace(/^www\./u, ""),
    () => "",
  );
