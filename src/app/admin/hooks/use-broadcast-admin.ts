import { useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
  BroadcastAudienceLead,
  BroadcastExclusionScope,
  BroadcastStats,
  FirstTouchBroadcastResponse,
  StatusMessage,
} from "../lib/admin.types";

type UseBroadcastAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

export const useBroadcastAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: UseBroadcastAdminOptions) => {
  const [stats, setStats] = useState<BroadcastStats | null>(null);
  const [audience, setAudience] = useState<BroadcastAudienceLead[]>([]);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [updatingLeadId, setUpdatingLeadId] = useState("");
  const [confirmingGlobalLeadId, setConfirmingGlobalLeadId] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);

  const pendingCount = (stats?.pending ?? 0) + (stats?.failed ?? 0);
  const isDisabled = isLoading || isSending || pendingCount === 0;

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.firstTouchBroadcast, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as FirstTouchBroadcastResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
          return;
        }

        setStatus({
          text: "Не удалось загрузить статистику рассылки.",
          tone: "error",
        });
        return;
      }

      setStats(data.stats ?? null);
      setAudience(data.audience ?? []);
    } catch {
      setStatus({
        text: "Не удалось загрузить статистику рассылки.",
        tone: "error",
      });
    } finally {
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [onUnauthorized]);

  const send = useCallback(async () => {
    if (isDisabled) {
      return;
    }

    setIsSending(true);
    setStatus({
      text: "Отправляю рассылку First Touch...",
      tone: "info",
    });

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.firstTouchBroadcast, {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as FirstTouchBroadcastResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
          return;
        }

        setStatus({
          text:
            data.errorCode === "product_sales_closed"
              ? "Продажи First Touch выключены. Включи их в разделе «Продажи» — иначе в письме будет нерабочая ссылка на оплату."
              : "Не удалось отправить рассылку. Проверь настройки Resend и таблицу.",
          tone: "error",
        });
        return;
      }

      const result = data.result;

      if (result) {
        setStats(data.stats ?? result);
        setAudience(data.audience ?? []);
        setStatus({
          text: `Рассылка обработана. Попыток: ${result.attempted}. Отправлено: ${result.sent}. Ошибок: ${result.failed}.`,
          tone: result.failed > 0 ? "info" : "success",
        });
      }
    } catch {
      setStatus({
        text: "Ошибка сети при отправке рассылки.",
        tone: "error",
      });
    } finally {
      setIsSending(false);
    }
  }, [isDisabled, onUnauthorized]);

  const exclude = useCallback(
    async (lead: BroadcastAudienceLead, scope: BroadcastExclusionScope) => {
      if (isSending || updatingLeadId) {
        return;
      }

      setUpdatingLeadId(lead.leadId);
      setStatus({
        text:
          scope === "global"
            ? `Исключаю ${lead.email} из будущих рассылок...`
            : `Убираю ${lead.email} из текущей рассылки...`,
        tone: "info",
      });

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.firstTouchBroadcast, {
          method: "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.leadId, scope }),
        });
        const data = (await response.json()) as FirstTouchBroadcastResponse;

        if (!response.ok) {
          if (data.errorCode === "unauthorized") {
            onUnauthorized();
            return;
          }

          setStatus({
            text:
              data.errorCode === "broadcast_in_progress"
                ? "Сейчас идет отправка. Дождись завершения и попробуй снова."
                : data.errorCode === "lead_not_actionable"
                  ? "Статус пользователя уже изменился. Обнови список."
                  : "Не удалось изменить участие в рассылке.",
            tone: "error",
          });
          return;
        }

        setStats(data.stats ?? null);
        setAudience(data.audience ?? []);
        setConfirmingGlobalLeadId("");
        setStatus({
          text:
            scope === "global"
              ? `${lead.email} больше не будет включаться в будущие рассылки.`
              : `${lead.email} исключен из этой рассылки.`,
          tone: "success",
        });
      } catch {
        setStatus({
          text: "Ошибка сети при изменении участия в рассылке.",
          tone: "error",
        });
      } finally {
        setUpdatingLeadId("");
      }
    },
    [isSending, onUnauthorized, updatingLeadId],
  );

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoaded(false);
      setIsLoading(false);
      setStats(null);
      setAudience([]);
      setStatus(null);
      setUpdatingLeadId("");
      setConfirmingGlobalLeadId("");
      return;
    }

    if (!isActive || hasLoaded || isLoading) {
      return;
    }

    void load();
  }, [hasLoaded, isActive, isAuthorized, isLoading, load]);

  return {
    audience,
    confirmingGlobalLeadId,
    exclude,
    isDisabled,
    isLoading,
    isSending,
    load,
    pendingCount,
    send,
    setConfirmingGlobalLeadId,
    stats,
    status,
    updatingLeadId,
  };
};
