import { useCallback, useEffect, useRef, useState } from "react";

import { ADMIN_API_ENDPOINTS, RATE_LIMITED_STATUS_TEXT } from "../lib/admin.constants";
import type {
  AdminProductBreakdownEntry,
  AdminPurchaseEntry,
  AdminPurchasesPreviousSummary,
  AdminPurchasesResponse,
  AdminPurchasesSummary,
  MonthlySalesReportResponse,
  ResendPurchaseEmailResponse,
  SelectOption,
  StatusMessage,
} from "../lib/admin.types";

type UsePurchasesAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

// One server response = one state slot, so a deauth reset cannot forget a
// fragment and leak the previous session's data.
type PurchasesOverview = {
  months: SelectOption[];
  previousSummary: AdminPurchasesPreviousSummary | null;
  products: AdminProductBreakdownEntry[];
  purchases: AdminPurchaseEntry[];
  summary: AdminPurchasesSummary | null;
};

export const usePurchasesAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: UsePurchasesAdminOptions) => {
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [overview, setOverview] = useState<PurchasesOverview | null>(null);
  const [monthValue, setMonthValue] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<StatusMessage>(null);
  const [resendingPaymentIntentId, setResendingPaymentIntentId] = useState("");
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [reportStatus, setReportStatus] = useState<StatusMessage>(null);
  const loadSequenceRef = useRef(0);

  const load = useCallback(
    async ({ month, search }: { month?: string; search?: string } = {}) => {
      // Responses may resolve out of order on slow networks; only the latest
      // request is allowed to write state.
      const loadSequence = ++loadSequenceRef.current;

      setIsLoading(true);

      const searchParams = new URLSearchParams();

      if (month) {
        searchParams.set("month", month);
      }

      if (search) {
        searchParams.set("search", search);
      }

      const query = searchParams.toString();
      const endpoint = query
        ? `${ADMIN_API_ENDPOINTS.purchases}?${query}`
        : ADMIN_API_ENDPOINTS.purchases;

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json()) as AdminPurchasesResponse;

        if (loadSequence !== loadSequenceRef.current) {
          return;
        }

        if (!response.ok) {
          if (data.errorCode === "unauthorized") {
            onUnauthorized();
            return;
          }

          setStatus({
            text: "Не удалось загрузить продажи.",
            tone: "error",
          });
          return;
        }

        setOverview({
          months: Array.isArray(data.months) ? data.months : [],
          previousSummary: data.previousSummary ?? null,
          products: Array.isArray(data.products) ? data.products : [],
          purchases: Array.isArray(data.purchases) ? data.purchases : [],
          summary: data.summary ?? null,
        });
        setMonthValue(data.summary?.monthValue ?? month ?? "");
        setStatus(null);
      } catch {
        if (loadSequence !== loadSequenceRef.current) {
          return;
        }

        setStatus({
          text: "Ошибка сети при загрузке продаж.",
          tone: "error",
        });
      } finally {
        if (loadSequence === loadSequenceRef.current) {
          setHasLoaded(true);
          setIsLoading(false);
        }
      }
    },
    [onUnauthorized],
  );

  const selectMonth = useCallback(
    async (value: string) => {
      setMonthValue(value);
      setReportStatus(null);
      await load({ month: value, search: appliedSearch });
    },
    [appliedSearch, load],
  );

  const submitSearch = useCallback(async () => {
    const normalizedSearch = searchInput.trim();

    setAppliedSearch(normalizedSearch);
    await load({ month: monthValue, search: normalizedSearch });
  }, [load, monthValue, searchInput]);

  const clearSearch = useCallback(async () => {
    setSearchInput("");

    if (!appliedSearch) {
      return;
    }

    setAppliedSearch("");
    await load({ month: monthValue });
  }, [appliedSearch, load, monthValue]);

  const refresh = useCallback(async () => {
    await load({ month: monthValue, search: appliedSearch });
  }, [appliedSearch, load, monthValue]);

  const resendEmail = useCallback(
    async (paymentIntentId: string) => {
      if (!paymentIntentId || resendingPaymentIntentId) {
        return;
      }

      setResendingPaymentIntentId(paymentIntentId);
      setStatus({
        text: "Переотправляю письмо о покупке...",
        tone: "info",
      });

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.purchasesResendEmail, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        });
        const data = (await response.json()) as ResendPurchaseEmailResponse;

        if (!response.ok) {
          if (data.errorCode === "unauthorized") {
            onUnauthorized();
            setStatus(null);
            return;
          }

          setStatus({
            text:
              data.errorCode === "purchase_not_succeeded"
                ? "Эта оплата не завершилась успехом — письмо не отправляется."
                : data.errorCode === "succeeded_event_missing"
                  ? "У покупки нет подтвержденного Stripe-события — так бывает со старыми продажами, перенесенными из таблиц. Отправь письмо вручную."
                  : data.errorCode === "rate_limited"
                    ? RATE_LIMITED_STATUS_TEXT
                    : "Не удалось переотправить письмо.",
            tone: "error",
          });
          return;
        }

        setStatus(
          data.status === "sent"
            ? {
                text: "Письмо о покупке отправлено повторно вместе с инвойсом.",
                tone: "success",
              }
            : {
                text: "Письмо пропущено: для этой покупки отправка не требуется.",
                tone: "info",
              },
        );
      } catch {
        setStatus({
          text: "Ошибка сети при переотправке письма.",
          tone: "error",
        });
      } finally {
        setResendingPaymentIntentId("");
      }
    },
    [onUnauthorized, resendingPaymentIntentId],
  );

  const sendReport = useCallback(async () => {
    if (!monthValue || isSendingReport) {
      return;
    }

    setIsSendingReport(true);
    setReportStatus({
      text: "Генерирую и отправляю отчет...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.monthlySalesReport, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportMonth: monthValue }),
      });
      const data = (await response.json()) as MonthlySalesReportResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
          setReportStatus(null);
          return;
        }

        setReportStatus({
          text:
            data.errorCode === "invalid_monthly_sales_report_month" ||
            data.errorCode === "future_monthly_sales_report_month"
              ? "Выбранный месяц невалиден. Обнови страницу и попробуй снова."
              : "Не удалось отправить отчет. Проверь настройки и попробуй снова.",
          tone: "error",
        });
        return;
      }

      if (data.status === "skipped" && data.skippedReason === "empty") {
        setReportStatus({
          text: "За выбранный период продаж нет, письмо не отправлено.",
          tone: "info",
        });
        return;
      }

      setReportStatus({
        text: `Отчет отправлен на ${data.deliveredTo || "адрес из RESEND_REPLY_TO"}. Строк: ${data.rowCount ?? 0}.`,
        tone: "success",
      });
    } catch {
      setReportStatus({
        text: "Не удалось отправить отчет. Проверь настройки и попробуй снова.",
        tone: "error",
      });
    } finally {
      setIsSendingReport(false);
    }
  }, [isSendingReport, monthValue, onUnauthorized]);

  const downloadReport = useCallback(async () => {
    if (!monthValue || isDownloadingReport) {
      return;
    }

    setIsDownloadingReport(true);
    setReportStatus(null);

    try {
      const response = await fetch(
        `${ADMIN_API_ENDPOINTS.monthlySalesReportDownload}?month=${encodeURIComponent(monthValue)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          errorCode?: string;
        };

        if (data.errorCode === "unauthorized") {
          onUnauthorized();
          return;
        }

        setReportStatus({
          text:
            data.errorCode === "invalid_monthly_sales_report_month" ||
            data.errorCode === "future_monthly_sales_report_month"
              ? "Выбранный месяц невалиден. Обнови страницу и попробуй снова."
              : "Не удалось сформировать CSV. Попробуй снова.",
          tone: "error",
        });
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = `monthly-sales-report-${monthValue}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setReportStatus({
        text: "CSV сформирован и скачивается.",
        tone: "success",
      });
    } catch {
      setReportStatus({
        text: "Ошибка сети при скачивании CSV.",
        tone: "error",
      });
    } finally {
      setIsDownloadingReport(false);
    }
  }, [isDownloadingReport, monthValue, onUnauthorized]);

  useEffect(() => {
    if (!isAuthorized) {
      loadSequenceRef.current += 1;
      setHasLoaded(false);
      setIsLoading(false);
      setOverview(null);
      setMonthValue("");
      setSearchInput("");
      setAppliedSearch("");
      setStatus(null);
      setResendingPaymentIntentId("");
      setIsSendingReport(false);
      setIsDownloadingReport(false);
      setReportStatus(null);
      return;
    }

    if (!isActive || hasLoaded || isLoading) {
      return;
    }

    void load();
  }, [hasLoaded, isActive, isAuthorized, isLoading, load]);

  return {
    appliedSearch,
    clearSearch,
    downloadReport,
    isDownloadingReport,
    isLoading,
    isSendingReport,
    monthValue,
    months: overview?.months ?? [],
    previousSummary: overview?.previousSummary ?? null,
    products: overview?.products ?? [],
    purchases: overview?.purchases ?? [],
    refresh,
    reportStatus,
    resendEmail,
    resendingPaymentIntentId,
    searchInput,
    selectMonth,
    sendReport,
    setSearchInput,
    status,
    submitSearch,
    summary: overview?.summary ?? null,
  };
};
