/**
 * Persistence for the campaign record. Where it lands depends on consent: the
 * durable copy is only written when functional storage is allowed, otherwise
 * the state lives for the session and nothing outlives the visit.
 */

import {
  BIRTHDAY_POPUP_STORAGE_KEY,
  BIRTHDAY_POPUP_UPDATED_EVENT,
  isBirthdayOfferId,
} from "./config";
import {
  applyBirthdayPopupSignal,
  type BirthdayPopupState,
  createInitialBirthdayPopupState,
  isBirthdayPopupState,
} from "./state";

const isBrowser = () => typeof window !== "undefined";

const readFrom = (storage: Storage | undefined): BirthdayPopupState | null => {
  try {
    const rawValue = storage?.getItem(BIRTHDAY_POPUP_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    return isBirthdayPopupState(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
};

/**
 * Persisted state wins over the session copy: a visitor who granted functional
 * storage later in the visit should keep the history written before that.
 */
export const getBirthdayPopupState = (): BirthdayPopupState => {
  if (!isBrowser()) {
    return createInitialBirthdayPopupState();
  }

  return (
    readFrom(window.localStorage) ??
    readFrom(window.sessionStorage) ??
    createInitialBirthdayPopupState()
  );
};

/**
 * "Do not show me this again" is a convenience preference, which is exactly what
 * this site promises under the functional cookie category. Without that consent
 * the state is kept for the session only, so the visitor is not nagged inside
 * one visit while nothing outlives it either.
 */
export const saveBirthdayPopupState = (
  state: BirthdayPopupState,
  canUseFunctionalStorage: boolean,
) => {
  if (!isBrowser()) {
    return;
  }

  const serialized = JSON.stringify(state);

  try {
    if (canUseFunctionalStorage) {
      window.localStorage.setItem(BIRTHDAY_POPUP_STORAGE_KEY, serialized);
    } else {
      window.localStorage.removeItem(BIRTHDAY_POPUP_STORAGE_KEY);
      window.sessionStorage.setItem(BIRTHDAY_POPUP_STORAGE_KEY, serialized);
    }
  } catch {
    // Storage can be unavailable (private mode, quota). The popup then behaves
    // as if it had never been shown, which is the safe direction.
  }

  window.dispatchEvent(new CustomEvent(BIRTHDAY_POPUP_UPDATED_EVENT, { detail: state }));
};

/**
 * Keeps the record in the storage the visitor's consent allows, without leaning
 * on the cookie module: if functional storage is refused after something was
 * already persisted, the durable copy is moved into the session and dropped.
 */
export const syncBirthdayPopupStorage = (canUseFunctionalStorage: boolean) => {
  if (!isBrowser() || canUseFunctionalStorage) {
    return;
  }

  const persisted = readFrom(window.localStorage);

  if (!persisted) {
    return;
  }

  try {
    window.localStorage.removeItem(BIRTHDAY_POPUP_STORAGE_KEY);

    if (!readFrom(window.sessionStorage)) {
      window.sessionStorage.setItem(
        BIRTHDAY_POPUP_STORAGE_KEY,
        JSON.stringify(persisted),
      );
    }
  } catch {
    // Nothing to do if storage refuses to cooperate.
  }
};

/**
 * Records a completed purchase. Called from the payment success page, which only
 * renders once the payment intent has been verified server-side, so this cannot
 * be triggered by simply opening the URL.
 */
export const recordBirthdayOfferPurchase = (
  offerId: string,
  canUseFunctionalStorage: boolean,
) => {
  if (!isBrowser() || !isBirthdayOfferId(offerId)) {
    return;
  }

  const state = getBirthdayPopupState();

  if (state.purchasedAt) {
    return;
  }

  saveBirthdayPopupState(
    applyBirthdayPopupSignal(state, "purchased", new Date()),
    canUseFunctionalStorage,
  );
};
