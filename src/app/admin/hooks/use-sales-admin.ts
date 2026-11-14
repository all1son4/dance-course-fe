import { useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
  SalesProductEntry,
  SalesProductOffer,
  SalesStateResponse,
  StatusMessage,
} from "../lib/admin.types";
import { requestAdminJson } from "../lib/admin-request";

type UseSalesAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

const LOAD_FALLBACK_ERROR_TEXT = "Не удалось загрузить состояние продаж.";
const TOGGLE_FALLBACK_ERROR_TEXT = "Не удалось переключить продажи. Попробуй еще раз.";

const TOGGLE_ERROR_MESSAGES: Record<string, string> = {
  choreo_channels_required:
    "Сначала настрой русский и английский Telegram-каналы этого разбора.",
  network_error: TOGGLE_FALLBACK_ERROR_TEXT,
  online_group_campaign_required:
    "Поток Online Group сейчас нельзя продавать: причина указана в строке продукта.",
  offer_not_found: "Тариф не найден. Обнови список и попробуй снова.",
  product_not_found: "Продукт не найден. Обнови список и попробуй снова.",
  rate_limited: "Слишком часто. Подожди минуту и попробуй снова.",
};

export const useSalesAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: UseSalesAdminOptions) => {
  const [products, setProducts] = useState<SalesProductEntry[]>([]);
  const [activeCampaignTitle, setActiveCampaignTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [updatingProductId, setUpdatingProductId] = useState("");
  const [status, setStatus] = useState<StatusMessage>(null);

  const applySalesState = useCallback((data: SalesStateResponse) => {
    setProducts(Array.isArray(data.products) ? data.products : []);
    setActiveCampaignTitle(data.activeCampaignTitle ?? "");
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);

    const result = await requestAdminJson<SalesStateResponse>(ADMIN_API_ENDPOINTS.sales);

    if (result.unauthorized) {
      onUnauthorized();
    } else if (!result.ok) {
      setStatus({
        text: LOAD_FALLBACK_ERROR_TEXT,
        tone: "error",
      });
    } else {
      applySalesState(result.data);
    }

    setHasLoaded(true);
    setIsLoading(false);
  }, [applySalesState, onUnauthorized]);

  const toggle = useCallback(
    async (product: SalesProductEntry, offer?: SalesProductOffer) => {
      if (updatingProductId) {
        return;
      }

      const nextSalesEnabled = !(offer ?? product).salesEnabled;

      setUpdatingProductId(product.productId);
      setStatus(null);

      const result = await requestAdminJson<SalesStateResponse>(
        ADMIN_API_ENDPOINTS.sales,
        {
          body: {
            productId: product.productId,
            ...(offer ? { offerId: offer.offerId } : {}),
            salesEnabled: nextSalesEnabled,
          },
          method: "POST",
        },
      );

      if (result.unauthorized) {
        onUnauthorized();
      } else if (!result.ok) {
        setStatus({
          text: TOGGLE_ERROR_MESSAGES[result.errorCode] ?? TOGGLE_FALLBACK_ERROR_TEXT,
          tone: "error",
        });
      } else {
        applySalesState(result.data);
        setStatus({
          text: offer
            ? `Тариф «${offer.label}» для «${product.title}» ${nextSalesEnabled ? "включён" : "выключен"}.${nextSalesEnabled && !product.salesEnabled ? " Чтобы начать продажи, включи общий переключатель продукта." : ""}`
            : nextSalesEnabled
              ? `Продажи «${product.title}» включены.`
              : `Продажи «${product.title}» выключены. Оплатить продукт больше нельзя, в том числе по прямой ссылке.`,
          tone: nextSalesEnabled ? "success" : "info",
        });
      }

      setUpdatingProductId("");
    },
    [applySalesState, onUnauthorized, updatingProductId],
  );

  useEffect(() => {
    if (!isAuthorized) {
      setActiveCampaignTitle("");
      setHasLoaded(false);
      setIsLoading(false);
      setProducts([]);
      setStatus(null);
      return;
    }

    if (!isActive || hasLoaded || isLoading) {
      return;
    }

    void load();
  }, [hasLoaded, isActive, isAuthorized, isLoading, load]);

  return {
    activeCampaignTitle,
    isLoading,
    load,
    products,
    status,
    toggle,
    updatingProductId,
  };
};
