import { useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
  MonthlySalesReportMonthsResponse,
  MonthlySalesReportResponse,
  SelectOption,
  StatusMessage,
} from "../lib/admin.types";

type UseReportsAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

export const useReportsAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: UseReportsAdminOptions) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingMonths, setIsLoadingMonths] = useState(false);
  const [hasLoadedMonths, setHasLoadedMonths] = useState(false);
  const [monthOptions, setMonthOptions] = useState<SelectOption[]>([]);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [month, setMonth] = useState("");

  const isDisabled = isGenerating || isLoadingMonths || !month;

  const selectMonth = useCallback((value: string) => {
    setMonth(value);
    setStatus(null);
  }, []);

  const loadMonths = useCallback(async () => {
    setIsLoadingMonths(true);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.monthlySalesReport, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as MonthlySalesReportMonthsResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
          return;
        }

        setStatus({
          text: "Не удалось загрузить список месяцев для отчета.",
          tone: "error",
        });
        return;
      }

      const months = Array.isArray(data.months) ? data.months : [];

      setMonthOptions(months);
      setMonth((currentMonth) =>
        months.some((option) => option.value === currentMonth)
          ? currentMonth
          : (months[0]?.value ?? ""),
      );

      if (months.length === 0) {
        setStatus({
          text: "Пока нет месяцев с успешными продажами.",
          tone: "info",
        });
      }
    } catch {
      setStatus({
        text: "Не удалось загрузить список месяцев для отчета.",
        tone: "error",
      });
    } finally {
      setHasLoadedMonths(true);
      setIsLoadingMonths(false);
    }
  }, [onUnauthorized]);

  const generate = useCallback(async () => {
    if (isDisabled) {
      return;
    }

    setIsGenerating(true);
    setStatus({
      text: "Генерирую и отправляю отчет...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.monthlySalesReport, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportMonth: month,
        }),
      });
      const data = (await response.json()) as MonthlySalesReportResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
        }

        if (
          data.errorCode === "invalid_monthly_sales_report_month" ||
          data.errorCode === "future_monthly_sales_report_month"
        ) {
          setStatus({
            text: "Выбранный месяц невалиден. Обнови страницу и попробуй снова.",
            tone: "error",
          });
          return;
        }

        setStatus({
          text: "Не удалось отправить отчет. Проверь настройки и попробуй снова.",
          tone: "error",
        });
        return;
      }

      if (data.status === "skipped" && data.skippedReason === "empty") {
        setStatus({
          text: "За выбранный период продаж нет, письмо не отправлено.",
          tone: "info",
        });
        return;
      }

      if (data.status === "skipped" || data.isAlreadyDelivered) {
        setStatus({
          text: "Отчет за этот период уже отправлялся.",
          tone: "info",
        });
        return;
      }

      setStatus({
        text: `Отчет отправлен на ${data.deliveredTo || "адрес из RESEND_REPLY_TO"}. Строк: ${data.rowCount ?? 0}.`,
        tone: "success",
      });
    } catch {
      setStatus({
        text: "Не удалось отправить отчет. Проверь настройки и попробуй снова.",
        tone: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [isDisabled, month, onUnauthorized]);

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoadedMonths(false);
      setIsLoadingMonths(false);
      setMonthOptions([]);
      setMonth("");
      setStatus(null);
      return;
    }

    if (!isActive || hasLoadedMonths || isLoadingMonths) {
      return;
    }

    void loadMonths();
  }, [hasLoadedMonths, isActive, isAuthorized, isLoadingMonths, loadMonths]);

  return {
    generate,
    isDisabled,
    isGenerating,
    isLoadingMonths,
    month,
    monthOptions,
    selectMonth,
    status,
  };
};
