export const LOCATION_CHANGE_EVENT = "app:location-change";
/**
 * Fired synchronously, right before `pushState`/`replaceState` change the URL,
 * so a listener can still read the state of the entry being left (Header
 * records its scroll offset there). `popstate` has no equivalent: by the time
 * it fires the URL is already the destination.
 */
export const LOCATION_WILL_CHANGE_EVENT = "app:location-will-change";

declare global {
  interface Window {
    __appLocationChangeInitialized?: boolean;
  }
}

const dispatchLocationWillChange = () => {
  window.dispatchEvent(new Event(LOCATION_WILL_CHANGE_EVENT));
};

const dispatchLocationChange = () => {
  window.setTimeout(() => {
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  }, 0);
};

export const ensureLocationChangeEvents = () => {
  if (typeof window === "undefined") {
    return;
  }

  if (window.__appLocationChangeInitialized) {
    return;
  }

  window.__appLocationChangeInitialized = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedPushState(data, unused, url) {
    dispatchLocationWillChange();
    originalPushState(data, unused, url);
    dispatchLocationChange();
  };

  window.history.replaceState = function patchedReplaceState(data, unused, url) {
    dispatchLocationWillChange();
    originalReplaceState(data, unused, url);
    dispatchLocationChange();
  };

  window.addEventListener("popstate", dispatchLocationChange);
  window.addEventListener("hashchange", dispatchLocationChange);
};
