import { BIRTHDAY_POPUP_CTA_PATHNAME } from "@/lib/birthday-popup";

/** Ties the card to its heading for assistive technology. */
export const TITLE_ELEMENT_ID = "birthday-popup-title";

/** Checkout, admin and the page the call to action leads to. */
export const EXCLUDED_PATH_PREFIXES = ["/payment", "/admin", BIRTHDAY_POPUP_CTA_PATHNAME];
