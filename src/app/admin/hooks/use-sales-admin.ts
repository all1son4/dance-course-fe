import { useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
  SalesProductEntry,
  SalesStateResponse,
  StatusMessage,
} from "../lib/admin.types";

type UseSalesAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

const TOGGLE_ERROR_MESSAGES: Record<string, string> = {
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

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.sales, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as SalesStateResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
          return;
        }

        setStatus({
          text: "Не удалось загрузить состояние продаж.",
          tone: "error",
        });
        return;
      }

      applySalesState(data);
    } catch {
      setStatus({
        text: "Не удалось загрузить состояние продаж.",
        tone: "error",
      });
    } finally {
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [applySalesState, onUnauthorized]);

  const toggle = useCallback(
    async (product: SalesProductEntry) => {
      if (updatingProductId) {
        return;
      }

      const nextSalesEnabled = !product.salesEnabled;

      setUpdatingProductId(product.productId);
      setStatus(null);

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.sales, {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId: product.productId,
            salesEnabled: nextSalesEnabled,
          }),
        });
        const data = (await response.json()) as SalesStateResponse;

        if (!response.ok) {
          if (data.errorCode === "unauthorized") {
            onUnauthorized();
            return;
          }

          setStatus({
            text:
              TOGGLE_ERROR_MESSAGES[data.errorCode ?? ""] ??
              "Не удалось переключить продажи. Попробуй еще раз.",
            tone: "error",
          });
          return;
        }

        applySalesState(data);
        setStatus({
          text: nextSalesEnabled
            ? `Продажи «${product.title}» включены.`
            : `Продажи «${product.title}» выключены. Оплатить продукт больше нельзя, в том числе по прямой ссылке.`,
          tone: nextSalesEnabled ? "success" : "info",
        });
      } catch {
        setStatus({
          text: "Не удалось переключить продажи. Попробуй еще раз.",
          tone: "error",
        });
      } finally {
        setUpdatingProductId("");
      }
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
