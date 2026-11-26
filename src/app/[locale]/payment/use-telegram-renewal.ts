import type { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { INSPIRATION_HUB_DISCOUNT_SLUG } from "@/constants/sellable-products";
import {
  type AnalyticsEventProperties,
  trackAnalyticsEvent,
} from "@/lib/mixpanel-analytics";

import {
  canStartTelegramRenewalVerification,
  formatTelegramUsernameInput,
  getTelegramRenewalEndpoint,
  type PaymentStoreInstance,
  pointCheckoutField,
  prefillRenewalCustomerProfile,
  type RenewalCampaignResponse,
  type RenewalStatus,
  resolveRenewalStatusTone,
  resolveRenewalVerificationFailure,
  TELEGRAM_USERNAME_PATTERN,
} from "./payment.helpers";
import {
  loadTelegramLoginScript,
  requestTelegramIdToken,
  verifyRenewalTelegramMembership,
} from "./payment.telegram";

/** How long the page may sit in front with no answer from Telegram before the icon unlocks. */
const TELEGRAM_WINDOW_CHECK_MS = 3000;

/** Failures the page answers differently; anything else is reported as "other". */
const KNOWN_LOGIN_ERRORS = new Set([
  "invalid_telegram_login_nonce",
  "popup_closed",
  "telegram_login_script_failed",
  "telegram_login_unavailable",
]);

type UseTelegramRenewalOptions = {
  locale: string;
  paymentStore: PaymentStoreInstance;
  renewalSlug: string;
  t: ReturnType<typeof useTranslations>;
};

const getVerificationProperties = (
  paymentStore: PaymentStoreInstance,
  renewalSlug: string,
) => ({
  currency: paymentStore.selectedCurrency,
  is_renewal: true,
  offer_code: paymentStore.selectedOffer.code,
  offer_id: paymentStore.selectedOffer.id,
  product_code: paymentStore.selectedProduct.code,
  product_id: paymentStore.selectedProduct.id,
  verification_kind:
    renewalSlug === INSPIRATION_HUB_DISCOUNT_SLUG
      ? ("hub_discount" as const)
      : ("online_renewal" as const),
});

export const useTelegramRenewal = ({
  locale,
  paymentStore,
  renewalSlug,
  t,
}: UseTelegramRenewalOptions) => {
  const [renewalClientId, setRenewalClientId] = useState("");
  const [renewalNonce, setRenewalNonce] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<RenewalStatus>("idle");
  const [renewalStatusText, setRenewalStatusText] = useState("");
  const [isRenewalUnavailable, setIsRenewalUnavailable] = useState(false);
  // Bumped to fetch a fresh login nonce after the server found the old one expired.
  const [campaignLoadKey, setCampaignLoadKey] = useState(0);
  // Only the latest press may change the page: Telegram reports "popup_closed" for an
  // earlier window when a new press replaces it.
  const verificationAttemptRef = useRef(0);

  const renewalStatusTone = resolveRenewalStatusTone(renewalStatus);

  useEffect(() => {
    if (!renewalSlug) {
      setRenewalClientId("");
      setRenewalNonce("");
      setRenewalStatus("idle");
      setRenewalStatusText("");
      setIsRenewalUnavailable(false);
      return;
    }

    const requestController = new AbortController();
    const searchParams = new URLSearchParams({
      checkoutSessionId: paymentStore.checkoutSessionId,
      slug: renewalSlug,
    });

    setIsRenewalUnavailable(false);
    setRenewalStatus("loading");
    setRenewalStatusText(t("renewal.status.loading"));

    void fetch(`${getTelegramRenewalEndpoint(renewalSlug)}?${searchParams.toString()}`, {
      cache: "no-store",
      signal: requestController.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as RenewalCampaignResponse;
        if (requestController.signal.aborted) return;

        if (!response.ok || data.status !== "ready" || !data.campaign) {
          throw new Error(data.errorCode ?? "renewal_campaign_load_failed");
        }

        // The campaign defines what is being renewed; a renewal link without
        // product parameters must not fall back to the default product.
        paymentStore.configureCheckoutSelection({
          offerId: data.campaign.offerId,
          productId: data.campaign.productId,
        });

        const verifiedUsername = formatTelegramUsernameInput(
          data.telegramUser?.username ?? "",
        );

        if (data.verified && verifiedUsername) {
          paymentStore.setCustomerField("nickname", verifiedUsername);
        }

        setRenewalClientId(data.clientId ?? "");
        setRenewalNonce(data.nonce ?? "");
        setRenewalStatus(data.verified ? "verified" : "ready");
        setRenewalStatusText(
          data.verified ? t("renewal.status.verified") : t("renewal.status.ready"),
        );
        if (!data.verified) {
          // Loaded now, so a press opens the Telegram window straight away: a window
          // opened after a network wait is no longer "from the tap", and Safari blocks it.
          void loadTelegramLoginScript().catch(() => undefined);
        }
        void trackAnalyticsEvent("renewal_verification_loaded", {
          ...getVerificationProperties(paymentStore, renewalSlug),
          already_verified: Boolean(data.verified),
        });
        if (data.verified) {
          void trackAnalyticsEvent("renewal_verification_result", {
            ...getVerificationProperties(paymentStore, renewalSlug),
            verification_stage: "restore",
            result: "verified",
          });
        }
      })
      .catch((error) => {
        if (requestController.signal.aborted) {
          return;
        }

        // A missing or deactivated campaign is terminal: no retry can revive
        // the link, so the page swaps the locked form for a clear notice.
        const isTerminalCampaignError =
          error instanceof Error &&
          (error.message === "renewal_campaign_not_found" ||
            error.message === "renewal_campaign_inactive");

        // Only a dead campaign clears the credentials: blanking them after a
        // network hiccup disabled the verify button on a form where every
        // other control is already disabled until verification - a dead end
        // with nothing to press.
        if (isTerminalCampaignError) {
          setRenewalClientId("");
          setRenewalNonce("");
        }

        setRenewalStatus("error");
        setRenewalStatusText(t("renewal.status.loadFailed"));
        setIsRenewalUnavailable(isTerminalCampaignError);
        void trackAnalyticsEvent("renewal_verification_result", {
          ...getVerificationProperties(paymentStore, renewalSlug),
          verification_stage: "load",
          result: "error",
        });
      });

    return () => {
      requestController.abort();
    };
  }, [campaignLoadKey, paymentStore, paymentStore.checkoutSessionId, renewalSlug, t]);

  const verifyTelegramRenewal = async () => {
    const numericClientId = Number(renewalClientId);
    // The handle is stored as typed until blur; the claim must be the settled form.
    paymentStore.normalizeCustomerField("nickname");
    const claimedUsername = paymentStore.customerData.nickname.trim();

    if (!TELEGRAM_USERNAME_PATTERN.test(claimedUsername)) {
      // Shows the field's own message ("enter your handle") instead of a
      // button press that does nothing.
      paymentStore.touchCustomerField("nickname");
      // A tap on the icon expected Telegram, not a keyboard: on a phone the
      // message under the field is enough.
      pointCheckoutField("nickname", "pointer");
      return;
    }

    if (
      !canStartTelegramRenewalVerification({
        claimedUsername,
        clientId: numericClientId,
        nonce: renewalNonce,
        slug: renewalSlug,
        status: renewalStatus,
      })
    ) {
      return;
    }

    const attempt = ++verificationAttemptRef.current;
    const isLatestAttempt = () => attempt === verificationAttemptRef.current;
    setRenewalStatus("verifying");
    setRenewalStatusText(t("renewal.status.openingTelegram"));
    const verificationProperties = getVerificationProperties(paymentStore, renewalSlug);
    void trackAnalyticsEvent("renewal_verification_started", verificationProperties);
    let verificationStage: AnalyticsEventProperties["renewal_verification_result"]["verification_stage"] =
      "login";

    try {
      // Preloaded with the campaign; waiting here only when that load failed.
      if (!window.Telegram?.Login?.auth) {
        await loadTelegramLoginScript();
      }

      if (!window.Telegram?.Login?.auth) {
        throw new Error("telegram_login_unavailable");
      }

      // A blocked window, or a confirmation that never finds its way back, leaves
      // Telegram silent: no answer comes and the icon would stay locked. Once the
      // page has been in front for a moment while still waiting, the icon works
      // again, with a hint where the login will work.
      let inFrontSince: number | null = Date.now();
      const waitingWatch = window.setInterval(() => {
        if (document.visibilityState !== "visible" || !document.hasFocus()) {
          inFrontSince = null;
          return;
        }

        inFrontSince ??= Date.now();

        if (Date.now() - inFrontSince >= TELEGRAM_WINDOW_CHECK_MS && isLatestAttempt()) {
          window.clearInterval(waitingWatch);
          setRenewalStatus("ready");
          setRenewalStatusText(t("renewal.status.noTelegramWindow"));
        }
      }, 500);

      const idToken = await requestTelegramIdToken({
        clientId: numericClientId,
        locale,
        nonce: renewalNonce,
      }).finally(() => window.clearInterval(waitingWatch));

      if (!isLatestAttempt()) {
        return;
      }

      setRenewalStatus("verifying");
      setRenewalStatusText(t("renewal.status.checkingMembership"));
      verificationStage = "membership";

      const { data, isSuccessful } = await verifyRenewalTelegramMembership({
        checkoutSessionId: paymentStore.checkoutSessionId,
        claimedUsername,
        idToken,
        nonce: renewalNonce,
        slug: renewalSlug,
      });
      const verificationFailure = resolveRenewalVerificationFailure({
        data,
        isSuccessful,
      });

      if (verificationFailure?.kind === "status") {
        setRenewalStatus(verificationFailure.status);
        setRenewalStatusText(t(verificationFailure.messageKey));
        void trackAnalyticsEvent("renewal_verification_result", {
          ...verificationProperties,
          verification_stage: verificationStage,
          result:
            verificationFailure.status === "not_member"
              ? "not_member"
              : "username_mismatch",
        });
        return;
      }

      if (verificationFailure?.kind === "error") {
        throw new Error(verificationFailure.errorCode);
      }

      setRenewalStatus("verified");
      void trackAnalyticsEvent("renewal_verification_result", {
        ...verificationProperties,
        verification_stage: verificationStage,
        result: "verified",
      });
      const hasPrefilledProfile = prefillRenewalCustomerProfile(
        paymentStore,
        data.customerProfile,
      );

      // The handle Telegram itself confirmed; a handle stored earlier is never filled in.
      const verifiedNickname = formatTelegramUsernameInput(
        data.telegramUser?.username?.trim() || "",
      );

      setRenewalStatusText(
        verifiedNickname
          ? t(
              hasPrefilledProfile
                ? "renewal.status.verifiedAsWithProfile"
                : "renewal.status.verifiedAs",
              {
                username: verifiedNickname,
              },
            )
          : t("renewal.status.verified"),
      );

      if (verifiedNickname) {
        paymentStore.setCustomerField("nickname", verifiedNickname);
      }

      // Back from the Telegram window: the page opens the next step itself, and on
      // a phone does not pop the keyboard up while the buyer is still switching back.
      window.focus();
    } catch (error) {
      if (!isLatestAttempt()) {
        return;
      }

      const errorCode =
        error instanceof Error && KNOWN_LOGIN_ERRORS.has(error.message)
          ? error.message
          : "other";

      if (errorCode === "invalid_telegram_login_nonce") {
        // The page outlived its login nonce: a fresh one makes the next press work,
        // instead of failing every retry until a reload.
        setCampaignLoadKey((key) => key + 1);
      } else {
        setRenewalStatus("error");
        setRenewalStatusText(
          t(
            errorCode === "popup_closed"
              ? "renewal.status.telegramClosed"
              : "renewal.status.failed",
          ),
        );
      }
      void trackAnalyticsEvent("renewal_verification_result", {
        ...verificationProperties,
        error_code: errorCode,
        verification_stage: verificationStage,
        result: "error",
      });
    }
  };

  return {
    isRenewalUnavailable,
    renewalClientId,
    renewalNonce,
    renewalStatus,
    renewalStatusText,
    renewalStatusTone,
    verifyTelegramRenewal,
  };
};
