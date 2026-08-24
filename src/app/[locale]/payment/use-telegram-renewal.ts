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

  const renewalStatusTone = resolveRenewalStatusTone(renewalStatus);

  useEffect(() => {
    if (!renewalSlug) {
      setRenewalClientId("");
      setRenewalNonce("");
      setRenewalStatus("idle");
      setRenewalStatusText("");
      return;
    }

    const requestController = new AbortController();
    const searchParams = new URLSearchParams({
      checkoutSessionId: paymentStore.checkoutSessionId,
      slug: renewalSlug,
    });

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

        const verifiedUsername = formatTelegramUsernameInput(
          data.telegramUser?.username ?? "",
        );

        if (data.verified && verifiedUsername) {
          paymentStore.setCustomerField("nickname", verifiedUsername, {
            skipStripeIntentReset: true,
          });
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

        setRenewalClientId("");
        setRenewalNonce("");
        setRenewalStatus("error");
        setRenewalStatusText(t("renewal.status.loadFailed"));
      });

    return () => {
      requestController.abort();
    };
  }, [paymentStore, paymentStore.checkoutSessionId, renewalSlug, t]);

  const verifyTelegramRenewal = async () => {
    const numericClientId = Number(renewalClientId);
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
        paymentStore.setCustomerField("nickname", verifiedNickname, {
          skipStripeIntentReset: true,
        });
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
    renewalClientId,
    renewalNonce,
    renewalStatus,
    renewalStatusText,
    renewalStatusTone,
    verifyTelegramRenewal,
  };
};
