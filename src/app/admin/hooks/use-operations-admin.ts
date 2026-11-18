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
import { requestAdminJson } from "../lib/admin-request";

type UseOperationsAdminOptions = {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

const REPLAY_RESULT_LABELS: Record<string, string> = {
  dead_letter: "Снова не получилось. Причина — в строке задачи.",
  failed: "Снова не получилось. Система сама попробует ещё раз.",
  pending: "Задача запущена заново — нажми «Обновить» через пару минут.",
  processed: "Готово: оплата обработана.",
  sent: "Готово: доставлено.",
  skipped: "Готово: делать ничего не пришлось.",
};

const LOAD_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Статус не загрузился: нет связи. Проверь интернет и нажми «Обновить».",
};

const REPLAY_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Повтор не запущен: нет связи. Проверь интернет и повтори.",
  rate_limited: RATE_LIMITED_STATUS_TEXT,
  replay_event_not_verified: "Это старое событие, до переезда сайта: повторить нельзя.",
  replay_job_not_found: "Задача не найдена или уже обработана. Обнови статус.",
  replay_kind_unsupported: "Эту задачу нельзя повторить отсюда. Напиши разработчику.",
};

const REISSUE_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Ссылки не перевыпущены: нет связи. Проверь интернет и повтори.",
  purchase_not_found: "Покупка не найдена. Нажми «Обновить».",
  purchase_not_succeeded:
    "Эта оплата не завершилась успехом — выдавать доступ не за что.",
  rate_limited: RATE_LIMITED_STATUS_TEXT,
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

    const result = await requestAdminJson<OperationsSnapshotResponse>(
      ADMIN_API_ENDPOINTS.operations,
    );

    if (result.unauthorized) {
      onUnauthorized();
    } else if (!result.ok) {
      setStatus({
        text:
          LOAD_ERROR_MESSAGES[result.errorCode] ?? "Не удалось загрузить статус систем.",
        tone: "error",
      });
    } else {
      setSnapshot(result.data as OperationsSnapshot);
    }

    setHasLoaded(true);
    setIsLoading(false);
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
        text: "Повторяю…",
        tone: "progress",
      });

      const result = await requestAdminJson<OperationsReplayResponse>(
        ADMIN_API_ENDPOINTS.operationsReplay,
        {
          body: { key, queue },
          method: "POST",
        },
      );

      if (result.unauthorized) {
        onUnauthorized();
        setStatus(null);
      } else if (!result.ok) {
        setStatus({
          text:
            REPLAY_ERROR_MESSAGES[result.errorCode] ?? "Не удалось повторить доставку.",
          tone: "error",
        });
      } else {
        const { status: replayStatus } = result.data;

        setStatus({
          text:
            REPLAY_RESULT_LABELS[replayStatus ?? ""] ??
            "Повтор запущен. Нажми «Обновить» через минуту.",
          tone:
            replayStatus === "dead_letter" || replayStatus === "failed"
              ? "error"
              : "success",
        });
        await load();
      }

      setReplayingKey("");
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
        text: "Перевыпускаю ссылки доступа…",
        tone: "progress",
      });

      const result = await requestAdminJson<ReissueAccessResponse>(
        ADMIN_API_ENDPOINTS.operationsReissueAccess,
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
            REISSUE_ERROR_MESSAGES[result.errorCode] ??
            "Не удалось перевыпустить ссылки доступа.",
          tone: "error",
        });
      } else {
        const { links, status: reissueStatus } = result.data;

        setReissuedLinks((currentLinks) => ({
          ...currentLinks,
          [paymentIntentId]: links ?? [],
        }));
        setStatus(
          reissueStatus === "ready"
            ? {
                text: "Ссылки готовы. Скопируй их из карточки или переотправь письмо о покупке.",
                tone: "success",
              }
            : reissueStatus === "partial"
              ? {
                  text: "Готова только часть ссылок. Проверь карточку и попробуй снова.",
                  tone: "info",
                }
              : reissueStatus === "not_applicable"
                ? {
                    text: "Для этой покупки ссылки не создаются: доступ выдаётся вручную.",
                    tone: "info",
                  }
                : {
                    text: "Telegram не выдал новые ссылки. Попробуй позже; если повторится — проверь права бота в чате.",
                    tone: "error",
                  },
        );
        await load();
      }

      setReissuingPaymentIntentId("");
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
