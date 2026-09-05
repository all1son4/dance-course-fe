import type { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { PaymentInputConfig } from "./payment.constants";
import {
  canStartTelegramRenewalVerification,
  focusNextCheckoutControl,
  formatTelegramUsernameInput,
  PAYMENT_API_ENDPOINTS,
  type PaymentStoreInstance,
  POST_VERIFICATION_FOCUS_DELAY_MS,
  prefillRenewalCustomerProfile,
  type RenewalCampaignResponse,
  type RenewalStatus,
  resolveRenewalStatusTone,
  resolveRenewalVerificationFailure,
} from "./payment.helpers";
import {
  loadTelegramLoginScript,
  requestTelegramIdToken,
  verifyRenewalTelegramMembership,
} from "./payment.telegram";

type UseTelegramRenewalOptions = {
  locale: string;
  paymentStore: PaymentStoreInstance;
  productPaymentInputs: PaymentInputConfig[];
  renewalSlug: string;
  t: ReturnType<typeof useTranslations>;
};

export const useTelegramRenewal = ({
  locale,
  paymentStore,
  productPaymentInputs,
  renewalSlug,
  t,
}: UseTelegramRenewalOptions) => {
  const [renewalClientId, setRenewalClientId] = useState("");
  const [renewalNonce, setRenewalNonce] = useState("");
  const [renewalStatus, setRenewalStatus] = useState<RenewalStatus>("idle");
  const [renewalStatusText, setRenewalStatusText] = useState("");
  const [isRenewalUnavailable, setIsRenewalUnavailable] = useState(false);

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

    void fetch(`${PAYMENT_API_ENDPOINTS.telegramRenewal}?${searchParams.toString()}`, {
      cache: "no-store",
      signal: requestController.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as RenewalCampaignResponse;

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
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
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
      });

    return () => {
      requestController.abort();
    };
  }, [paymentStore, paymentStore.checkoutSessionId, renewalSlug, t]);

  const verifyTelegramRenewal = async () => {
    const numericClientId = Number(renewalClientId);
    // The handle is stored as typed until blur; the claim must be the settled form.
    paymentStore.normalizeCustomerField("nickname");
    const claimedUsername = paymentStore.customerData.nickname.trim();

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

    setRenewalStatus("verifying");
    setRenewalStatusText(t("renewal.status.openingTelegram"));

    try {
      await loadTelegramLoginScript();

      if (!window.Telegram?.Login?.auth) {
        throw new Error("telegram_login_unavailable");
      }

      const idToken = await requestTelegramIdToken({
        clientId: numericClientId,
        locale,
        nonce: renewalNonce,
      });

      setRenewalStatusText(t("renewal.status.checkingMembership"));

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
        return;
      }

      if (verificationFailure?.kind === "error") {
        throw new Error(verificationFailure.errorCode);
      }

      setRenewalStatus("verified");
      const hasPrefilledProfile = prefillRenewalCustomerProfile(
        paymentStore,
        data.customerProfile,
      );

      const verifiedNickname = formatTelegramUsernameInput(
        data.telegramUser?.username?.trim() ||
          data.customerProfile?.nickname?.trim() ||
          "",
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

      window.focus();
      window.setTimeout(() => {
        focusNextCheckoutControl({
          customerData: paymentStore.customerData,
          inputs: productPaymentInputs,
        });
      }, POST_VERIFICATION_FOCUS_DELAY_MS);
    } catch {
      setRenewalStatus("error");
      setRenewalStatusText(t("renewal.status.failed"));
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
