import { useCallback, useEffect, useState } from "react";

import { ADMIN_API_ENDPOINTS, RATE_LIMITED_STATUS_TEXT } from "../lib/admin.constants";
import type {
  OperationsReplayResponse,
  OperationsSnapshot,
  OperationsSnapshotResponse,
  ReissueAccessResponse,
  ReissuedAccessLink,
  StatusMessage,
} from "../lib/admin.types";

type UseOperationsAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

const REPLAY_RESULT_LABELS: Record<string, string> = {
  dead_letter: "Задача снова упала в dead letters. Смотри ошибку в списке.",
  failed: "Доставка снова не прошла. Задача уйдет в автоповтор.",
  pending: "Задача поставлена в очередь и будет обработана в ближайший прогон.",
  processed: "Событие успешно обработано.",
  sent: "Доставка прошла успешно.",
  skipped: "Задача обработана и помечена как пропущенная.",
};

export const useOperationsAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: UseOperationsAdminOptions) => {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [replayingKey, setReplayingKey] = useState("");
  const [reissuingPaymentIntentId, setReissuingPaymentIntentId] = useState("");
  const [reissuedLinks, setReissuedLinks] = useState<
    Record<string, ReissuedAccessLink[]>
  >({});

  const load = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(ADMIN_API_ENDPOINTS.operations, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as OperationsSnapshotResponse;

      if (!response.ok) {
        if (data.errorCode === "unauthorized") {
          onUnauthorized();
          return;
        }

        setStatus({
          text: "Не удалось загрузить операционный статус.",
          tone: "error",
        });
        return;
      }

      setSnapshot(data as OperationsSnapshot);
    } catch {
      setStatus({
        text: "Ошибка сети при загрузке операционного статуса.",
        tone: "error",
      });
    } finally {
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [onUnauthorized]);

  const refresh = useCallback(async () => {
    setStatus(null);
    await load();
  }, [load]);

  const replay = useCallback(
    async (queue: "inbox" | "outbox", key: string) => {
      if (!key || replayingKey) {
        return;
      }

      setReplayingKey(key);
      setStatus({
        text: "Повторяю доставку...",
        tone: "info",
      });

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.operationsReplay, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, queue }),
        });
        const data = (await response.json()) as OperationsReplayResponse;

        if (!response.ok) {
          if (data.errorCode === "unauthorized") {
            onUnauthorized();
            setStatus(null);
            return;
          }

          setStatus({
            text:
              data.errorCode === "replay_job_not_found"
                ? "Задача не найдена или уже обработана. Обнови статус."
                : data.errorCode === "replay_kind_unsupported"
                  ? "Эту задачу нельзя повторить из админки — для нее нет автоматического обработчика. Напиши разработчику."
                  : data.errorCode === "replay_event_not_verified"
                    ? "У события нет подтвержденной подписи Stripe (наследие миграции) — повтор невозможен."
                    : data.errorCode === "rate_limited"
                      ? RATE_LIMITED_STATUS_TEXT
                      : "Не удалось повторить доставку.",
            tone: "error",
          });
          return;
        }

        const resultLabel =
          REPLAY_RESULT_LABELS[data.status ?? ""] ??
          `Задача переведена в статус «${data.status ?? "pending"}».`;

        setStatus({
          text: resultLabel,
          tone:
            data.status === "dead_letter" || data.status === "failed"
              ? "error"
              : "success",
        });
        await load();
      } catch {
        setStatus({
          text: "Ошибка сети при повторе доставки.",
          tone: "error",
        });
      } finally {
        setReplayingKey("");
      }
    },
    [load, onUnauthorized, replayingKey],
  );

  const reissueAccess = useCallback(
    async (paymentIntentId: string) => {
      if (!paymentIntentId || reissuingPaymentIntentId) {
        return;
      }

      setReissuingPaymentIntentId(paymentIntentId);
      setStatus({
        text: "Перевыпускаю ссылки доступа...",
        tone: "info",
      });

      try {
        const response = await fetch(ADMIN_API_ENDPOINTS.operationsReissueAccess, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        });
        const data = (await response.json()) as ReissueAccessResponse;

        if (!response.ok) {
          if (data.errorCode === "unauthorized") {
            onUnauthorized();
            setStatus(null);
            return;
          }

          setStatus({
            text:
              data.errorCode === "purchase_not_found"
                ? "Покупка не найдена в базе."
                : data.errorCode === "purchase_not_succeeded"
                  ? "Эта оплата не завершилась успехом — выдавать доступ не за что."
                  : data.errorCode === "rate_limited"
                    ? RATE_LIMITED_STATUS_TEXT
                    : "Не удалось перевыпустить ссылки доступа.",
            tone: "error",
          });
          return;
        }

        setReissuedLinks((links) => ({
          ...links,
          [paymentIntentId]: data.links ?? [],
        }));
        setStatus(
          data.status === "ready"
            ? {
                text: "Ссылки готовы. Скопируй их из карточки или переотправь письмо о покупке.",
                tone: "success",
              }
            : data.status === "partial"
              ? {
                  text: "Готова только часть ссылок. Проверь карточку и попробуй снова.",
                  tone: "info",
                }
              : data.status === "not_applicable"
                ? {
                    text: "Для этой покупки ссылки не создаются: доступ выдается вручную.",
                    tone: "info",
                  }
                : {
                    text: "Telegram не отдал новые ссылки. Попробуй позже или проверь настройки бота.",
                    tone: "error",
                  },
        );
        await load();
      } catch {
        setStatus({
          text: "Ошибка сети при перевыпуске ссылок.",
          tone: "error",
        });
      } finally {
        setReissuingPaymentIntentId("");
      }
    },
    [load, onUnauthorized, reissuingPaymentIntentId],
  );

  useEffect(() => {
    if (!isAuthorized) {
      setSnapshot(null);
      setHasLoaded(false);
      setIsLoading(false);
      setStatus(null);
      setReplayingKey("");
      setReissuingPaymentIntentId("");
      setReissuedLinks({});
      return;
    }

    if (!isActive || hasLoaded || isLoading) {
      return;
    }

    void load();
  }, [hasLoaded, isActive, isAuthorized, isLoading, load]);

  return {
    isLoading,
    refresh,
    reissueAccess,
    reissuedLinks,
    reissuingPaymentIntentId,
    replay,
    replayingKey,
    snapshot,
    status,
  };
};
