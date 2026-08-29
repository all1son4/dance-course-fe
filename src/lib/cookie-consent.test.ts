import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  COOKIE_CONSENT_STORAGE_KEY,
  createAcceptedCookieConsent,
  getStoredCookieConsent,
  persistCookieConsent,
} from "./cookie-consent";

const LEGACY_STORAGE_KEY = "cookie-consent:v1";

const createLocalStorageStub = () => {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    has: (key: string) => store.has(key),
  };
};

type WindowStub = {
  localStorage: Pick<Storage, "getItem" | "removeItem" | "setItem">;
  dispatchEvent: () => boolean;
};

// Unit tests run in Node; the module only touches these two window members.
const globalRef = globalThis as unknown as { window?: WindowStub };

let localStorageStub: ReturnType<typeof createLocalStorageStub>;

beforeEach(() => {
  localStorageStub = createLocalStorageStub();
  globalRef.window = {
    localStorage: localStorageStub,
    dispatchEvent: () => true,
  };
});

afterEach(() => {
  delete globalRef.window;
});

test("consent given before the Mixpanel switch is discarded so the banner is shown again", () => {
  localStorageStub.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      functional: true,
      analytics: true,
      updatedAt: "2026-08-01T00:00:00.000Z",
      source: "accept_all",
    }),
  );

  assert.equal(getStoredCookieConsent(), null);
  assert.equal(localStorageStub.has(LEGACY_STORAGE_KEY), false);
});

test("a v1 record written under the current key is not accepted either", () => {
  localStorageStub.setItem(
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      functional: true,
      analytics: true,
      updatedAt: "2026-08-01T00:00:00.000Z",
      source: "accept_all",
    }),
  );

  assert.equal(getStoredCookieConsent(), null);
});

test("a freshly persisted choice is stored under the v2 key and read back", () => {
  assert.equal(COOKIE_CONSENT_STORAGE_KEY, "cookie-consent:v2");

  const consent = createAcceptedCookieConsent();
  persistCookieConsent(consent);

  assert.equal(consent.version, 2);
  assert.deepEqual(getStoredCookieConsent(), consent);
});
