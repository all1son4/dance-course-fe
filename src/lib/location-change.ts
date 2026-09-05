export const LOCATION_CHANGE_EVENT = "app:location-change";

declare global {
  interface Window {
    __appLocationChangeInitialized?: boolean;
  }
}

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
    originalPushState(data, unused, url);
    dispatchLocationChange();
  };

  window.history.replaceState = function patchedReplaceState(data, unused, url) {
    originalReplaceState(data, unused, url);
    dispatchLocationChange();
  };

  window.addEventListener("popstate", dispatchLocationChange);
  window.addEventListener("hashchange", dispatchLocationChange);
};
