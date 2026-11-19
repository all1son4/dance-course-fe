import type { Config, Mixpanel } from "mixpanel-browser";

import {
  getSellableProductById,
  getSellableProductOfferById,
  INSPIRATION_HUB_PRODUCT_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  isOnlineGroupLibraryOfferId,
  isOnlineGroupRenewalOfferId,
} from "@/constants/sellable-products";
import { routing } from "@/i18n/routing";
import { getStoredCookieConsent, hasCookieConsentFor } from "@/lib/cookie-consent";
import { logSafeError } from "@/lib/safe-error-log";

export const MIXPANEL_EU_API_HOST = "https://api-eu.mixpanel.com";
export const MIXPANEL_EU_APP_HOST = "https://eu.mixpanel.com";

const MIXPANEL_PROJECT_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN?.trim() ?? "";
const MIXPANEL_RELEASE_ID = process.env.NEXT_PUBLIC_APP_RELEASE_ID?.trim() ?? "";

const UTM_PROPERTY_NAMES = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;
const MAX_ATTRIBUTION_VALUE_LENGTH = 120;
const MAX_DIAGNOSTIC_TOKEN_LENGTH = 80;
const TRACK_ACCEPTANCE_TIMEOUT_MS = 10_000;
const SAFE_ATTRIBUTION_VALUE_PATTERN = /^[\p{L}\p{N} ._+~-]+$/u;
const COHORT_INVITE_CAMPAIGN_PATTERN =
  /^cohort_invite:[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu;
const SAFE_DIAGNOSTIC_TOKEN_PATTERN = /^[A-Za-z0-9._:-]+$/u;

const PRIVATE_URL_PROPERTIES = [
  "$current_url",
  "$initial_referrer",
  "$referrer",
  "current_url_search",
];

const AUTOCAPTURE_BLOCKED_URLS = [
  /\/(?:admin)(?:[/?#]|$)/u,
  /\/(?:payment|access)(?:[/?#]|$)/u,
];

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
  checkout_kind?: "full_price" | "member_price" | "renewal";
  currency?: "eur" | "pln";
  hub_access?: "standalone" | "plus" | "none";
  is_renewal?: boolean;
  offer_code?: string;
  offer_id?: string;
  product_code?: string;
  product_id?: string;
  value?: number;
};

type CtaEventProperties = CommerceEventProperties & {
  access_action?: "renewHub" | "buyHub" | "support" | "reissue";
  access_kind?: "hub" | "group" | "channel" | "lifetime";
  access_state?:
    "active" | "endsSoon" | "notJoined" | "linkExpired" | "upcoming" | "ended";
  cta_id: string;
  destination_domain?: string;
  destination_hash?: string;
  destination_path?: string;
  placement?: string;
};

type ApiErrorCategory = "client" | "network" | "server";
type ApiHttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
type AppErrorCategory = "chunk_load" | "network" | "resource" | "runtime";
type AppErrorSource = "resource" | "unhandled_rejection" | "window";

type UtmPropertyName = (typeof UTM_PROPERTY_NAMES)[number];
export type MixpanelAttributionProperties = Partial<Record<UtmPropertyName, string>>;

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
  api_error: {
    api_endpoint: string;
    error_category: ApiErrorCategory;
    error_code: string;
    failure_stage: string;
    http_method: ApiHttpMethod;
    http_status?: number;
  };
  app_error: {
    error_category: AppErrorCategory;
    error_code: string;
    error_name: string;
    error_source: AppErrorSource;
    is_unhandled: true;
  };
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
  checkout_step_completed: CommerceEventProperties & {
    step: string;
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
  my_access_viewed: {
    status: "link_required" | "invalid_link" | "ready" | "empty";
    card_count: number;
    hub_card_count: number;
    hub_states: NonNullable<CtaEventProperties["access_state"]>[];
    has_renewal_action: boolean;
  };
  my_access_link_requested: Record<string, never>;
  my_access_link_request_result: {
    result: "accepted" | "invalid_email" | "rate_limited" | "error";
  };
  payment_attempted: CommerceEventProperties;
  payment_failed: CommerceEventProperties & {
    failure_stage: "confirmation" | "exception" | "result_page";
  };
  payment_form_revealed: CommerceEventProperties;
  post_purchase_access_result: CommerceEventProperties & {
    active_access_count: number;
    ready_access_count: number;
    scheduled_access_count: number;
    status:
      | "already_active"
      | "invalid_context"
      | "partial"
      | "ready"
      | "scheduled"
      | "unavailable";
    unavailable_access_count: number;
  };
  purchase_completed: CommerceEventProperties;
  renewal_verification_loaded: CommerceEventProperties & {
    verification_kind: "hub_discount" | "online_renewal";
    already_verified: boolean;
  };
  renewal_verification_started: CommerceEventProperties & {
    verification_kind: "hub_discount" | "online_renewal";
  };
  renewal_verification_result: CommerceEventProperties & {
    verification_kind: "hub_discount" | "online_renewal";
    verification_stage: "restore" | "load" | "login" | "membership";
    result: "verified" | "not_member" | "username_mismatch" | "error";
    /** For result "error": a known failure code (e.g. "popup_closed") or "other". */
    error_code?: string;
  };
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
      "duplicate_email" | "network" | "rateLimited" | "server" | "unknown" | "validation";
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

export type ButtonAnalyticsMetadata = CommerceEventProperties &
  Pick<CtaEventProperties, "access_action" | "access_kind" | "access_state"> & {
    id: string;
    placement?: string;
  };

export type ApiErrorInput = {
  endpoint: string;
  errorCode?: string;
  failureStage: string;
  method: ApiHttpMethod;
  status?: number;
};

export type AppErrorInput = {
  errorName?: string;
  message?: string;
  source: AppErrorSource;
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
  shouldTrackMixpanelPath(pathname) &&
  !hasRouteSegment(pathname, "payment") &&
  !hasRouteSegment(pathname, "access");

export const shouldRecordMixpanelLocation = (pathname: string, search: string) =>
  shouldRecordMixpanelPath(pathname) && search.length === 0;

const sanitizeAttributionValue = (
  propertyName: UtmPropertyName,
  value: string | null,
) => {
  const normalizedValue = value?.trim() ?? "";
  const isCohortInvite =
    propertyName === "utm_campaign" &&
    COHORT_INVITE_CAMPAIGN_PATTERN.test(normalizedValue);

  if (
    !normalizedValue ||
    normalizedValue.length > MAX_ATTRIBUTION_VALUE_LENGTH ||
    (!isCohortInvite && !SAFE_ATTRIBUTION_VALUE_PATTERN.test(normalizedValue))
  ) {
    return null;
  }

  return normalizedValue;
};

/** Keeps campaign attribution useful without retaining arbitrary query parameters. */
export const getMixpanelAttributionProperties = (
  search: string,
): MixpanelAttributionProperties => {
  const searchParams = new URLSearchParams(search);

  return UTM_PROPERTY_NAMES.reduce<MixpanelAttributionProperties>(
    (properties, propertyName) => {
      const value = sanitizeAttributionValue(
        propertyName,
        searchParams.get(propertyName),
      );

      if (value) {
        properties[propertyName] = value;
      }

      return properties;
    },
    {},
  );
};

export const getInitialMixpanelAttributionProperties = (
  properties: MixpanelAttributionProperties,
) =>
  Object.fromEntries(
    Object.entries(properties).map(([propertyName, value]) => [
      `initial_${propertyName}`,
      value,
    ]),
  );

export const syncMixpanelAttribution = (
  mixpanel: Pick<Mixpanel, "get_property" | "register" | "register_once" | "unregister">,
  search: string,
) => {
  const attribution = getMixpanelAttributionProperties(search);
  if (Object.keys(attribution).length === 0) return;

  if (
    !UTM_PROPERTY_NAMES.some(
      (name) => mixpanel.get_property(`initial_${name}`) !== undefined,
    )
  ) {
    mixpanel.register_once(getInitialMixpanelAttributionProperties(attribution));
  }

  if (
    !UTM_PROPERTY_NAMES.some((name) => attribution[name] !== mixpanel.get_property(name))
  )
    return;

  // Keep each campaign's fields together when a new tagged link has fewer parameters.
  for (const name of UTM_PROPERTY_NAMES) {
    if (attribution[name] === undefined && mixpanel.get_property(name) !== undefined) {
      mixpanel.unregister(name);
    }
  }
  mixpanel.register(attribution);
};

export const getMixpanelPageProperties = (pathname: string, localeHint?: string) => {
  const localeSegment = pathname.split("/").filter(Boolean)[0];
  const localeFromPath = routing.locales.find((candidate) => candidate === localeSegment);
  const locale =
    localeFromPath ?? routing.locales.find((candidate) => candidate === localeHint);

  return {
    page_path: pathname,
    ...(locale ? { locale } : {}),
    ...(MIXPANEL_RELEASE_ID ? { release_id: MIXPANEL_RELEASE_ID } : {}),
  };
};

/** Public catalogue identifiers give every commerce event the same segmentation. */
export const getCommerceAnalyticsContext = (
  properties: object,
): Pick<
  CommerceEventProperties,
  "checkout_kind" | "hub_access" | "offer_code" | "product_code"
> => {
  if (
    !("product_id" in properties) ||
    typeof properties.product_id !== "string" ||
    !("offer_id" in properties) ||
    typeof properties.offer_id !== "string"
  ) {
    return {};
  }

  const product = getSellableProductById(properties.product_id);
  const offer = product && getSellableProductOfferById(product, properties.offer_id);
  if (!product || !offer) return {};

  const codes = { product_code: product.code, offer_code: offer.code };
  if (product.id === INSPIRATION_HUB_PRODUCT_ID) {
    return {
      ...codes,
      checkout_kind:
        offer.id === INSPIRATION_HUB_RENEWAL_OFFER_ID ? "member_price" : "full_price",
      hub_access: "standalone",
    };
  }

  return {
    ...codes,
    checkout_kind: isOnlineGroupRenewalOfferId(offer.id) ? "renewal" : "full_price",
    hub_access: isOnlineGroupLibraryOfferId(offer.id) ? "plus" : "none",
  };
};

/** Scheduled delivery is reported separately from access that has already begun. */
export const getPostPurchaseAccessAnalyticsProperties = ({
  accesses,
  accessUrl,
  isContextValid,
  statusKind,
}: {
  accesses: readonly {
    status: "active" | "expired" | "ready" | "scheduled" | "unavailable";
    accessUrl: string;
  }[];
  accessUrl: string;
  isContextValid: boolean;
  statusKind: "pending" | "unavailable";
}): AnalyticsEventProperties["post_purchase_access_result"] | null => {
  const counts = {
    active_access_count: 0,
    ready_access_count: 0,
    scheduled_access_count: 0,
    unavailable_access_count: 0,
  };

  if (!isContextValid) return { ...counts, status: "invalid_context" };
  if (accessUrl) return { ...counts, ready_access_count: 1, status: "ready" };

  if (accesses.length) {
    for (const access of accesses) {
      if (access.status === "active") counts.active_access_count += 1;
      if (access.status === "ready" && access.accessUrl) counts.ready_access_count += 1;
      if (access.status === "scheduled") counts.scheduled_access_count += 1;
      if (access.status === "expired" || access.status === "unavailable") {
        counts.unavailable_access_count += 1;
      }
    }

    const hasAvailableAccess =
      counts.active_access_count +
        counts.ready_access_count +
        counts.scheduled_access_count >
      0;
    const status =
      counts.unavailable_access_count > 0 && hasAvailableAccess
        ? "partial"
        : counts.ready_access_count > 0
          ? "ready"
          : counts.active_access_count > 0
            ? "already_active"
            : counts.scheduled_access_count > 0
              ? "scheduled"
              : "unavailable";
    return { ...counts, status };
  }

  return statusKind === "unavailable" ? { ...counts, status: "unavailable" } : null;
};

const sanitizeDiagnosticToken = (value: string | undefined, fallback: string) => {
  const normalizedValue = value?.trim() ?? "";

  if (
    !normalizedValue ||
    normalizedValue.length > MAX_DIAGNOSTIC_TOKEN_LENGTH ||
    !SAFE_DIAGNOSTIC_TOKEN_PATTERN.test(normalizedValue)
  ) {
    return fallback;
  }

  return normalizedValue;
};

const getSafeApiEndpoint = (endpoint: string) => {
  try {
    const baseUrl = "https://analytics.invalid";
    const url = new URL(endpoint, baseUrl);

    if (url.origin !== baseUrl) {
      return null;
    }

    const { pathname } = url;

    return pathname.startsWith("/api/") ? pathname : null;
  } catch {
    return null;
  }
};

export const getApiErrorAnalyticsProperties = ({
  endpoint,
  errorCode,
  failureStage,
  method,
  status,
}: ApiErrorInput): AnalyticsEventProperties["api_error"] | null => {
  const apiEndpoint = getSafeApiEndpoint(endpoint);

  if (!apiEndpoint) {
    return null;
  }

  const httpStatus =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
      ? status
      : undefined;
  const errorCategory: ApiErrorCategory = httpStatus
    ? httpStatus < 500
      ? "client"
      : "server"
    : "network";

  return {
    api_endpoint: apiEndpoint,
    error_category: errorCategory,
    error_code: sanitizeDiagnosticToken(
      errorCode,
      httpStatus ? `http_${httpStatus}` : "network_error",
    ),
    failure_stage: sanitizeDiagnosticToken(failureStage, "unknown"),
    http_method: method,
    ...(httpStatus ? { http_status: httpStatus } : {}),
  };
};

export const getAppErrorAnalyticsProperties = ({
  errorName,
  message,
  source,
}: AppErrorInput): AnalyticsEventProperties["app_error"] => {
  const normalizedMessage = message?.toLowerCase() ?? "";
  const isChunkLoadError =
    normalizedMessage.includes("chunkloaderror") ||
    normalizedMessage.includes("loading chunk") ||
    normalizedMessage.includes("dynamically imported module");
  const isNetworkError =
    normalizedMessage.includes("failed to fetch") ||
    normalizedMessage.includes("networkerror") ||
    normalizedMessage.includes("load failed");
  const errorCategory: AppErrorCategory =
    source === "resource"
      ? "resource"
      : isChunkLoadError
        ? "chunk_load"
        : isNetworkError
          ? "network"
          : "runtime";
  const errorCode =
    errorCategory === "chunk_load"
      ? "chunk_load_error"
      : errorCategory === "network"
        ? "network_error"
        : errorCategory === "resource"
          ? "resource_load_error"
          : source === "unhandled_rejection"
            ? "unhandled_rejection"
            : "runtime_error";

  return {
    error_category: errorCategory,
    error_code: errorCode,
    error_name: sanitizeDiagnosticToken(errorName, "UnknownError"),
    error_source: source,
    is_unhandled: true,
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

export const MIXPANEL_BROWSER_CONFIG: Partial<Config> & {
  skip_first_touch_marketing: boolean;
  track_marketing: boolean;
} = {
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
  skip_first_touch_marketing: true,
  store_google: false,
  track_marketing: false,
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
        logSafeError("Failed to initialize Mixpanel analytics", error);
        return null;
      });
  }

  return mixpanelPromise;
};

const hasAnalyticsConsent = () =>
  hasCookieConsentFor(getStoredCookieConsent(), "analytics");

export const enableMixpanel = async () => {
  if (!hasAnalyticsConsent()) return null;

  const mixpanel = await loadMixpanel();

  if (!mixpanel || !hasAnalyticsConsent()) {
    return null;
  }

  try {
    // Consent is recorded by our own versioned consent store; avoid an extra
    // Mixpanel `$opt_in` event while enabling SDK persistence and collection.
    if (!mixpanel.has_opted_in_tracking()) {
      mixpanel.opt_in_tracking({ track: () => undefined });
    }
  } catch (error) {
    logSafeError("Failed to enable Mixpanel analytics", error);
    return null;
  }

  return mixpanel;
};

export const disableMixpanel = async () => {
  if (!mixpanelPromise) {
    return;
  }

  const mixpanel = await mixpanelPromise;

  if (!mixpanel || hasAnalyticsConsent()) {
    return;
  }

  try {
    // The SDK defaults clear_persistence to true and also stops active replay
    // and event batching. No profile deletion request is needed for anonymous use.
    mixpanel.opt_out_tracking({ delete_user: false });
  } catch (error) {
    logSafeError("Failed to disable Mixpanel analytics", error);
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
    logSafeError("Failed to stop Mixpanel session recording", error);
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

  return hasAnalyticsConsent();
};

const captureEventPage = () =>
  getMixpanelPageProperties(window.location.pathname, document.documentElement.lang);

const enqueueAnalyticsEvent = (
  mixpanel: Mixpanel,
  eventName: AnalyticsEventName,
  properties: Record<string, unknown>,
) =>
  new Promise<boolean>((resolve, reject) => {
    const timer = window.setTimeout(() => resolve(false), TRACK_ACCEPTANCE_TIMEOUT_MS);
    const finish = (accepted: boolean) => {
      window.clearTimeout(timer);
      resolve(accepted);
    };

    try {
      // The synchronous return is a payload; the callback confirms enqueue or send.
      const payload: unknown = mixpanel.track(eventName, properties, (response) =>
        finish(
          response === 1 || (typeof response === "object" && response?.status === 1),
        ),
      );
      if (!payload) finish(false);
    } catch (error) {
      window.clearTimeout(timer);
      reject(error);
    }
  });

const submitAnalyticsEvent = async <EventName extends AnalyticsEventName>(
  eventName: EventName,
  properties: AnalyticsEventProperties[EventName],
  page: ReturnType<typeof captureEventPage>,
) => {
  const mixpanel = await enableMixpanel();

  if (!mixpanel || !hasAnalyticsConsent()) return false;

  try {
    // A queued click still belongs to its original page after navigation.
    if (page.page_path === window.location.pathname) {
      syncMixpanelAttribution(mixpanel, window.location.search);
    }
    return await enqueueAnalyticsEvent(mixpanel, eventName, {
      ...page,
      ...properties,
      ...getCommerceAnalyticsContext(properties),
    });
  } catch (error) {
    logSafeError(`Failed to track Mixpanel event: ${eventName}`, error);
    return false;
  }
};

export const trackAnalyticsEvent = async <EventName extends AnalyticsEventName>(
  eventName: EventName,
  properties: AnalyticsEventProperties[EventName],
) =>
  canTrackAnalyticsEvent()
    ? submitAnalyticsEvent(eventName, properties, captureEventPage())
    : false;

export const getSafeDestinationProperties = (
  href: string,
  origin: string | undefined = typeof window === "undefined"
    ? undefined
    : window.location.origin,
) => {
  if (!href || !origin) {
    return {};
  }

  if (href.startsWith("#")) {
    return { destination_hash: href };
  }

  try {
    const destination = new URL(href, origin);

    if (destination.origin === origin) {
      return {
        destination_path: destination.pathname,
        ...(destination.hash ? { destination_hash: destination.hash } : {}),
      };
    }

    // `mailto:`/`tel:` carry the address itself; the CTA id already names the channel.
    if (destination.protocol !== "http:" && destination.protocol !== "https:") {
      return {};
    }

    return { destination_domain: destination.hostname };
  } catch {
    return {};
  }
};

/**
 * The single shape of `cta_clicked`/`cta_impression`: a stable semantic id and
 * placement plus a query-free destination. Labels and full URLs never leave.
 */
export const getCtaEventProperties = (
  { id, placement, ...commerceProperties }: ButtonAnalyticsMetadata,
  href = "",
  origin?: string,
): CtaEventProperties => ({
  cta_id: id,
  ...(placement ? { placement } : {}),
  ...commerceProperties,
  ...getSafeDestinationProperties(href, origin),
});

/** Click tracking for links and controls that cannot use the shared Button. */
export const trackCtaClick = (analytics: ButtonAnalyticsMetadata, href?: string) =>
  trackAnalyticsEvent("cta_clicked", getCtaEventProperties(analytics, href));

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

const sessionDedupeStates = new Map<string, "pending" | "accepted">();

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

  if (sessionDedupeStates.has(inMemoryDedupeKey)) {
    return;
  }

  const page = captureEventPage();
  sessionDedupeStates.set(inMemoryDedupeKey, "pending");

  try {
    let storageKey: string | null = null;
    try {
      storageKey = await getSessionDedupeKey(eventName, rawDedupeKey);

      if (storageKey && window.sessionStorage.getItem(storageKey)) {
        sessionDedupeStates.set(inMemoryDedupeKey, "accepted");
        return;
      }
    } catch {
      // Storage and Web Crypto are best-effort; tracking may still proceed.
    }

    if (
      !(await submitAnalyticsEvent(eventName, properties, page)) ||
      !hasAnalyticsConsent()
    ) {
      return;
    }
    sessionDedupeStates.set(inMemoryDedupeKey, "accepted");

    if (storageKey) {
      try {
        window.sessionStorage.setItem(storageKey, "1");
      } catch {
        // The in-memory key still deduplicates within this document.
      }
    }
  } finally {
    if (sessionDedupeStates.get(inMemoryDedupeKey) === "pending") {
      sessionDedupeStates.delete(inMemoryDedupeKey);
    }
  }
};

export const trackApiError = async (input: ApiErrorInput) => {
  const properties = getApiErrorAnalyticsProperties(input);

  if (!properties) {
    return;
  }

  await trackAnalyticsEventOncePerSession(
    "api_error",
    properties,
    JSON.stringify(properties),
  );
};

export const trackUnhandledAppError = async (input: AppErrorInput) => {
  const properties = getAppErrorAnalyticsProperties(input);

  await trackAnalyticsEventOncePerSession(
    "app_error",
    properties,
    JSON.stringify(properties),
  );
};
