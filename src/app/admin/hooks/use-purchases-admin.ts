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
import { requestAdminJson } from "../lib/admin-request";

type UsePurchasesAdminOptions = {
  /** Search seeded from the `?q=` deep link the purchase alert links to. */
  initialSearch?: string;
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

const INVALID_REPORT_MONTH_STATUS_TEXT =
  "Выбранный месяц невалиден. Обнови страницу и попробуй снова.";
const SEND_REPORT_FALLBACK_ERROR_TEXT =
  "Не удалось отправить отчет. Проверь настройки и попробуй снова.";

const LOAD_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Ошибка сети при загрузке продаж.",
};

const RESEND_EMAIL_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Ошибка сети при переотправке письма.",
  purchase_not_succeeded: "Эта оплата не завершилась успехом — письмо не отправляется.",
  rate_limited: RATE_LIMITED_STATUS_TEXT,
  succeeded_event_missing:
    "У покупки нет подтвержденного Stripe-события — так бывает со старыми продажами, перенесенными из таблиц. Отправь письмо вручную.",
};

const SEND_REPORT_ERROR_MESSAGES: Record<string, string> = {
  future_monthly_sales_report_month: INVALID_REPORT_MONTH_STATUS_TEXT,
  invalid_monthly_sales_report_month: INVALID_REPORT_MONTH_STATUS_TEXT,
  network_error: SEND_REPORT_FALLBACK_ERROR_TEXT,
};

const DOWNLOAD_REPORT_ERROR_MESSAGES: Record<string, string> = {
  future_monthly_sales_report_month: INVALID_REPORT_MONTH_STATUS_TEXT,
  invalid_monthly_sales_report_month: INVALID_REPORT_MONTH_STATUS_TEXT,
};

export const usePurchasesAdmin = ({
  initialSearch = "",
  isActive,
  isAuthorized,
  onUnauthorized,
}: UsePurchasesAdminOptions) => {
  const seededSearch = initialSearch.trim();
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [overview, setOverview] = useState<PurchasesOverview | null>(null);
  const [monthValue, setMonthValue] = useState("");
  const [searchInput, setSearchInput] = useState(seededSearch);
  const [appliedSearch, setAppliedSearch] = useState(seededSearch);
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

      const result = await requestAdminJson<AdminPurchasesResponse>(endpoint);

      if (loadSequence !== loadSequenceRef.current) {
        return;
      }

      if (result.unauthorized) {
        onUnauthorized();
      } else if (!result.ok) {
        setStatus({
          text: LOAD_ERROR_MESSAGES[result.errorCode] ?? "Не удалось загрузить продажи.",
          tone: "error",
        });
      } else {
        const { months, previousSummary, products, purchases, summary } = result.data;

        setOverview({
          months: Array.isArray(months) ? months : [],
          previousSummary: previousSummary ?? null,
          products: Array.isArray(products) ? products : [],
          purchases: Array.isArray(purchases) ? purchases : [],
          summary: summary ?? null,
        });
        setMonthValue(summary?.monthValue ?? month ?? "");
        setStatus(null);
      }

      setHasLoaded(true);
      setIsLoading(false);
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

      const result = await requestAdminJson<ResendPurchaseEmailResponse>(
        ADMIN_API_ENDPOINTS.purchasesResendEmail,
        {
          body: { paymentIntentId },
          method: "POST",
        },
      );

      if (result.unauthorized) {
        onUnauthorized();
        setStatus(null);
      } else if (!result.ok) {
        setStatus({
          text:
            RESEND_EMAIL_ERROR_MESSAGES[result.errorCode] ??
            "Не удалось переотправить письмо.",
          tone: "error",
        });
      } else {
        setStatus(
          result.data.status === "sent"
            ? {
                text: "Письмо о покупке отправлено повторно вместе с инвойсом.",
                tone: "success",
              }
            : {
                text: "Письмо пропущено: для этой покупки отправка не требуется.",
                tone: "info",
              },
        );
      }

      setResendingPaymentIntentId("");
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

    const result = await requestAdminJson<MonthlySalesReportResponse>(
      ADMIN_API_ENDPOINTS.monthlySalesReport,
      {
        body: { reportMonth: monthValue },
        method: "POST",
      },
    );

    if (result.unauthorized) {
      onUnauthorized();
      setReportStatus(null);
    } else if (!result.ok) {
      setReportStatus({
        text:
          SEND_REPORT_ERROR_MESSAGES[result.errorCode] ?? SEND_REPORT_FALLBACK_ERROR_TEXT,
        tone: "error",
      });
    } else {
      const {
        deliveredTo,
        rowCount,
        skippedReason,
        status: reportResultStatus,
      } = result.data;

      setReportStatus(
        reportResultStatus === "skipped" && skippedReason === "empty"
          ? {
              text: "За выбранный период продаж нет, письмо не отправлено.",
              tone: "info",
            }
          : {
              text: `Отчет отправлен на ${deliveredTo || "адрес из RESEND_REPLY_TO"}. Строк: ${rowCount ?? 0}.`,
              tone: "success",
            },
      );
    }

    setIsSendingReport(false);
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
            DOWNLOAD_REPORT_ERROR_MESSAGES[data.errorCode ?? ""] ??
            "Не удалось сформировать CSV. Попробуй снова.",
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
      setSearchInput(seededSearch);
      setAppliedSearch(seededSearch);
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

    void load({ search: appliedSearch });
  }, [appliedSearch, hasLoaded, isActive, isAuthorized, isLoading, load, seededSearch]);

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
