import type { Config, Mixpanel } from "mixpanel-browser";

import { routing } from "@/i18n/routing";
import { getStoredCookieConsent, hasCookieConsentFor } from "@/lib/cookie-consent";

export const MIXPANEL_EU_API_HOST = "https://api-eu.mixpanel.com";
export const MIXPANEL_EU_APP_HOST = "https://eu.mixpanel.com";

const MIXPANEL_PROJECT_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim() ?? "";

const PRIVATE_URL_PROPERTIES = [
  "$current_url",
  "$initial_referrer",
  "$referrer",
  "current_url_search",
];

const AUTOCAPTURE_BLOCKED_URLS = [/\/(?:admin)(?:[/?#]|$)/u, /\/(?:payment)(?:[/?#]|$)/u];

const AUTOCAPTURE_PRIVATE_SELECTORS = [
  "form",
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  "[data-analytics-private]",
];

const AUTOCAPTURE_PRIVATE_ATTRIBUTES = [
  "aria-label",
  "href",
  "id",
  "name",
  "placeholder",
  "src",
  "title",
  "value",
];

type CommerceEventProperties = {
  currency?: "eur" | "pln";
  is_renewal?: boolean;
  offer_code?: string;
  offer_id?: string;
  product_code?: string;
  product_id?: string;
  value?: number;
};

type CtaEventProperties = CommerceEventProperties & {
  cta_id: string;
  destination_domain?: string;
  destination_hash?: string;
  destination_path?: string;
  placement?: string;
};

export const WEB_VITAL_NAMES = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const;

export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];

type WebVitalMeasurement = {
  delta: number;
  name: string;
  navigationType: string;
  rating: "good" | "needs-improvement" | "poor";
  value: number;
};

export type AnalyticsEventProperties = {
  birthday_popup_clicked: Record<string, never>;
  birthday_popup_dismissed: Record<string, never>;
  birthday_popup_shown: Record<string, never>;
  card_details_toggled: {
    card_id: string;
    is_expanded: boolean;
    collection: "offline_courses" | "online_courses";
  };
  checkout_blocked: CommerceEventProperties & {
    reason: "catalog_unavailable" | "renewal_unavailable" | "sales_closed" | "stale_link";
  };
  checkout_form_submitted: CommerceEventProperties;
  checkout_field_completed: CommerceEventProperties & {
    field_name: string;
  };
  checkout_field_started: CommerceEventProperties & {
    field_name: string;
  };
  checkout_agreement_changed: CommerceEventProperties & {
    agreement_name: string;
    is_accepted: boolean;
  };
  checkout_validation_failed: CommerceEventProperties & {
    invalid_agreements: string[];
    invalid_fields: string[];
    renewal_verification_required: boolean;
  };
  checkout_viewed: CommerceEventProperties;
  cta_clicked: CtaEventProperties;
  cta_impression: CtaEventProperties;
  currency_changed: CommerceEventProperties & {
    from_currency: "eur" | "pln";
    to_currency: "eur" | "pln";
  };
  faq_toggled: {
    faq_id: number;
    is_expanded: boolean;
  };
  language_changed: {
    from_locale: string;
    to_locale: string;
  };
  payment_attempted: CommerceEventProperties;
  payment_failed: CommerceEventProperties & {
    failure_stage: "confirmation" | "exception" | "result_page";
  };
  payment_form_revealed: CommerceEventProperties;
  post_purchase_access_result: CommerceEventProperties & {
    active_access_count: number;
    ready_access_count: number;
    status: "already_active" | "invalid_context" | "partial" | "ready" | "unavailable";
    unavailable_access_count: number;
  };
  purchase_completed: CommerceEventProperties;
  review_navigated: {
    direction: "next" | "previous";
    review_id?: number;
  };
  review_toggled: {
    is_expanded: boolean;
    review_id: number;
  };
  signup_dialog_opened: {
    course_id: string;
    placement: "inline" | "sticky";
  };
  signup_failed: {
    course_id: string;
    reason:
      | "duplicate_email"
      | "network"
      | "rateLimited"
      | "server"
      | "unknown"
      | "validation";
  };
  signup_submitted: {
    course_id: string;
  };
  signup_succeeded: {
    course_id: string;
  };
  signup_validation_failed: {
    course_id: string;
    invalid_fields: string[];
  };
  video_completed: {
    video_id: string;
    video_provider: "instagram" | "native" | "youtube";
  };
  video_paused: {
    video_id: string;
    video_provider: "instagram" | "native" | "youtube";
  };
  video_started: {
    video_id: string;
    video_provider: "instagram" | "native" | "youtube";
  };
  web_vital_measured: {
    metric_delta: number;
    metric_name: WebVitalName;
    metric_value: number;
    navigation_type: string;
    rating: "good" | "needs-improvement" | "poor";
  };
};

export type AnalyticsEventName = keyof AnalyticsEventProperties;

export type ButtonAnalyticsMetadata = CommerceEventProperties & {
  id: string;
  placement?: string;
};

const hasRouteSegment = (pathname: string, segment: string) =>
  new RegExp(`(?:^|/)${segment}(?:/|$)`, "u").test(pathname);

export const isMixpanelConfigured = () => MIXPANEL_PROJECT_TOKEN.length > 0;

/** Admin traffic is internal and must not affect public product analytics. */
export const shouldTrackMixpanelPath = (pathname: string) =>
  !hasRouteSegment(pathname, "admin");

/**
 * Checkout and result URLs can contain Stripe/order identifiers. They still get
 * a sanitized page-view event, but never a DOM/session recording.
 */
export const shouldRecordMixpanelPath = (pathname: string) =>
  shouldTrackMixpanelPath(pathname) && !hasRouteSegment(pathname, "payment");

export const shouldRecordMixpanelLocation = (pathname: string, search: string) =>
  shouldRecordMixpanelPath(pathname) && search.length === 0;

export const getMixpanelPageProperties = (pathname: string, localeHint?: string) => {
  const localeSegment = pathname.split("/").filter(Boolean)[0];
  const localeFromPath = routing.locales.find((candidate) => candidate === localeSegment);
  const locale =
    localeFromPath ?? routing.locales.find((candidate) => candidate === localeHint);

  return {
    page_path: pathname,
    ...(locale ? { locale } : {}),
  };
};

export const getWebVitalAnalyticsProperties = (
  metric: WebVitalMeasurement,
): AnalyticsEventProperties["web_vital_measured"] | null => {
  const metricName = WEB_VITAL_NAMES.find((candidate) => candidate === metric.name);

  if (!metricName) {
    return null;
  }

  return {
    metric_delta: metric.delta,
    metric_name: metricName,
    metric_value: metric.value,
    navigation_type: metric.navigationType,
    rating: metric.rating,
  };
};

export const MIXPANEL_BROWSER_CONFIG: Partial<Config> = {
  api_host: MIXPANEL_EU_API_HOST,
  app_host: MIXPANEL_EU_APP_HOST,
  autocapture: {
    block_attrs: AUTOCAPTURE_PRIVATE_ATTRIBUTES,
    block_selectors: AUTOCAPTURE_PRIVATE_SELECTORS,
    block_url_regexes: AUTOCAPTURE_BLOCKED_URLS,
    capture_text_content: false,
    click: true,
    dead_click: true,
    input: false,
    pageview: false,
    rage_click: true,
    scroll: true,
    scroll_capture_all: false,
    scroll_depth_percent_checkpoints: [25, 50, 75, 100],
    submit: false,
  },
  batch_requests: true,
  cross_subdomain_cookie: false,
  flags: false,
  ignore_dnt: false,
  // Keep country/city reports available. Mixpanel derives them server-side.
  ip: true,
  opt_out_persistence_by_default: true,
  opt_out_tracking_by_default: true,
  opt_out_tracking_persistence_type: "localStorage",
  persistence: "localStorage",
  property_blacklist: PRIVATE_URL_PROPERTIES,
  record_canvas: false,
  record_block_selector: "img, video, audio, [data-analytics-private]",
  record_collect_fonts: false,
  record_console: false,
  record_inline_images: false,
  record_heatmap_data: false,
  record_mask_all_inputs: true,
  record_mask_all_text: true,
  record_network: false,
  // Recording is started explicitly only on privacy-safe public routes.
  record_sessions_percent: 0,
  remote_settings_mode: "disabled",
  secure_cookie: true,
  store_google: false,
  track_pageview: false,
};

let mixpanelPromise: Promise<Mixpanel | null> | null = null;
let isInitialized = false;

const loadMixpanel = (): Promise<Mixpanel | null> => {
  if (typeof window === "undefined" || !isMixpanelConfigured()) {
    return Promise.resolve(null);
  }

  if (!mixpanelPromise) {
    mixpanelPromise = import("mixpanel-browser")
      .then(({ default: mixpanel }) => {
        if (!isInitialized) {
          mixpanel.init(MIXPANEL_PROJECT_TOKEN, MIXPANEL_BROWSER_CONFIG);
          isInitialized = true;
        }

        return mixpanel;
      })
      .catch((error: unknown) => {
        mixpanelPromise = null;
        console.error("Failed to initialize Mixpanel analytics", error);
        return null;
      });
  }

  return mixpanelPromise;
};

export const enableMixpanel = async () => {
  const mixpanel = await loadMixpanel();

  if (!mixpanel) {
    return null;
  }

  try {
    // Consent is recorded by our own versioned consent store; avoid an extra
    // Mixpanel `$opt_in` event while enabling SDK persistence and collection.
    mixpanel.opt_in_tracking({ track: () => undefined });
  } catch (error) {
    console.error("Failed to enable Mixpanel analytics", error);
    return null;
  }

  return mixpanel;
};

export const disableMixpanel = async () => {
  if (!mixpanelPromise) {
    return;
  }

  const mixpanel = await mixpanelPromise;

  if (!mixpanel) {
    return;
  }

  try {
    // The SDK defaults clear_persistence to true and also stops active replay
    // and event batching. No profile deletion request is needed for anonymous use.
    mixpanel.opt_out_tracking({ delete_user: false });
  } catch (error) {
    console.error("Failed to disable Mixpanel analytics", error);
  }
};

export const stopLoadedMixpanelRecording = async () => {
  if (!mixpanelPromise) {
    return;
  }

  const mixpanel = await mixpanelPromise;

  try {
    mixpanel?.stop_session_recording();
  } catch (error) {
    console.error("Failed to stop Mixpanel session recording", error);
  }
};

const canTrackAnalyticsEvent = () => {
  if (
    typeof window === "undefined" ||
    process.env.NODE_ENV !== "production" ||
    !isMixpanelConfigured() ||
    !shouldTrackMixpanelPath(window.location.pathname)
  ) {
    return false;
  }

  return hasCookieConsentFor(getStoredCookieConsent(), "analytics");
};

export const trackAnalyticsEvent = async <EventName extends AnalyticsEventName>(
  eventName: EventName,
  properties: AnalyticsEventProperties[EventName],
) => {
  if (!canTrackAnalyticsEvent()) {
    return;
  }

  const mixpanel = await enableMixpanel();

  if (!mixpanel || !canTrackAnalyticsEvent()) {
    if (mixpanel) {
      await disableMixpanel();
    }
    return;
  }

  try {
    mixpanel.track(eventName, {
      ...getMixpanelPageProperties(
        window.location.pathname,
        document.documentElement.lang,
      ),
      ...properties,
    });
  } catch (error) {
    console.error(`Failed to track Mixpanel event: ${eventName}`, error);
  }
};

export const getSafeDestinationProperties = (href: string) => {
  if (!href || typeof window === "undefined") {
    return {};
  }

  if (href.startsWith("#")) {
    return { destination_hash: href };
  }

  try {
    const destination = new URL(href, window.location.origin);

    if (destination.origin === window.location.origin) {
      return {
        destination_path: destination.pathname,
        ...(destination.hash ? { destination_hash: destination.hash } : {}),
      };
    }

    return { destination_domain: destination.hostname };
  } catch {
    return {};
  }
};

const getSessionDedupeKey = async (eventName: string, rawKey: string) => {
  if (!window.crypto?.subtle) {
    return null;
  }

  const encodedKey = new TextEncoder().encode(`${eventName}:${rawKey}`);
  const digest = await window.crypto.subtle.digest("SHA-256", encodedKey);
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `analytics-event:${eventName}:${hash}`;
};

const pendingSessionDedupeKeys = new Set<string>();

/** Prevents result-page reloads from counting one payment more than once. */
export const trackAnalyticsEventOncePerSession = async <
  EventName extends AnalyticsEventName,
>(
  eventName: EventName,
  properties: AnalyticsEventProperties[EventName],
  rawDedupeKey: string,
) => {
  if (!canTrackAnalyticsEvent()) {
    return;
  }

  const inMemoryDedupeKey = `${eventName}:${rawDedupeKey}`;

  if (pendingSessionDedupeKeys.has(inMemoryDedupeKey)) {
    return;
  }

  pendingSessionDedupeKeys.add(inMemoryDedupeKey);

  let storageKey: string | null = null;

  try {
    storageKey = await getSessionDedupeKey(eventName, rawDedupeKey);

    if (storageKey && window.sessionStorage.getItem(storageKey)) {
      return;
    }

    if (storageKey) {
      window.sessionStorage.setItem(storageKey, "1");
    }
  } catch {
    // Storage and Web Crypto are best-effort; tracking may still proceed.
  }

  await trackAnalyticsEvent(eventName, properties);
};
