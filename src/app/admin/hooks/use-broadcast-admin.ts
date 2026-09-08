import { useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type {
  BroadcastAudienceLead,
  BroadcastExclusionScope,
  BroadcastStats,
  FirstTouchBroadcastResponse,
  StatusMessage,
} from "../lib/admin.types";
import { requestAdminJson } from "../lib/admin-request";

type UseBroadcastAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

const LOAD_FALLBACK_ERROR_TEXT = "Не удалось загрузить статистику рассылки.";

const LOAD_ERROR_MESSAGES: Record<string, string> = {
  network_error: LOAD_FALLBACK_ERROR_TEXT,
};

const SEND_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Ошибка сети при отправке рассылки.",
  product_sales_closed:
    "Продажи First Touch выключены. Включи их в разделе «Продажи» — иначе в письме будет нерабочая ссылка на оплату.",
  sales_state_unavailable:
    "Не удалось проверить состояние продаж в базе. Рассылка не отправлена — попробуй ещё раз.",
};

const EXCLUDE_ERROR_MESSAGES: Record<string, string> = {
  broadcast_in_progress: "Сейчас идет отправка. Дождись завершения и попробуй снова.",
  lead_not_actionable: "Статус пользователя уже изменился. Обнови список.",
  network_error: "Ошибка сети при изменении участия в рассылке.",
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

    const result = await requestAdminJson<FirstTouchBroadcastResponse>(
      ADMIN_API_ENDPOINTS.firstTouchBroadcast,
    );

    if (result.unauthorized) {
      onUnauthorized();
    } else if (!result.ok) {
      setStatus({
        text: LOAD_ERROR_MESSAGES[result.errorCode] ?? LOAD_FALLBACK_ERROR_TEXT,
        tone: "error",
      });
    } else {
      setStats(result.data.stats ?? null);
      setAudience(result.data.audience ?? []);
    }

    setHasLoaded(true);
    setIsLoading(false);
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

    const result = await requestAdminJson<FirstTouchBroadcastResponse>(
      ADMIN_API_ENDPOINTS.firstTouchBroadcast,
      { method: "POST" },
    );

    if (result.unauthorized) {
      onUnauthorized();
    } else if (!result.ok) {
      setStatus({
        text:
          SEND_ERROR_MESSAGES[result.errorCode] ??
          "Не удалось отправить рассылку. Проверь настройки Resend и таблицу.",
        tone: "error",
      });
    } else {
      const {
        result: sendResult,
        stats: sendStats,
        audience: sendAudience,
      } = result.data;

      if (sendResult) {
        setStats(sendStats ?? sendResult);
        setAudience(sendAudience ?? []);
        setStatus({
          text: `Рассылка обработана. Попыток: ${sendResult.attempted}. Отправлено: ${sendResult.sent}. Ошибок: ${sendResult.failed}.`,
          tone: sendResult.failed > 0 ? "info" : "success",
        });
      }
    }

    setIsSending(false);
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

      const result = await requestAdminJson<FirstTouchBroadcastResponse>(
        ADMIN_API_ENDPOINTS.firstTouchBroadcast,
        {
          body: { leadId: lead.leadId, scope },
          method: "PATCH",
        },
      );

      if (result.unauthorized) {
        onUnauthorized();
      } else if (!result.ok) {
        setStatus({
          text:
            EXCLUDE_ERROR_MESSAGES[result.errorCode] ??
            "Не удалось изменить участие в рассылке.",
          tone: "error",
        });
      } else {
        setStats(result.data.stats ?? null);
        setAudience(result.data.audience ?? []);
        setConfirmingGlobalLeadId("");
        setStatus({
          text:
            scope === "global"
              ? `${lead.email} больше не будет включаться в будущие рассылки.`
              : `${lead.email} исключен из этой рассылки.`,
          tone: "success",
        });
      }

      setUpdatingLeadId("");
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
