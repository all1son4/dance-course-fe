import { useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
  SalesProductEntry,
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
  network_error: TOGGLE_FALLBACK_ERROR_TEXT,
  online_group_campaign_required:
    "Сначала запусти поток Online Group — без активного потока продавать нечего.",
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
    async (product: SalesProductEntry) => {
      if (updatingProductId) {
        return;
      }

      const nextSalesEnabled = !product.salesEnabled;

      setUpdatingProductId(product.productId);
      setStatus(null);

      const result = await requestAdminJson<SalesStateResponse>(
        ADMIN_API_ENDPOINTS.sales,
        {
          body: {
            productId: product.productId,
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
          text: nextSalesEnabled
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
