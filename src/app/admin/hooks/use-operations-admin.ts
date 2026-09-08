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
  dead_letter: "Задача снова упала в dead letters. Смотри ошибку в списке.",
  failed: "Доставка снова не прошла. Задача уйдет в автоповтор.",
  pending: "Задача поставлена в очередь и будет обработана в ближайший прогон.",
  processed: "Событие успешно обработано.",
  sent: "Доставка прошла успешно.",
  skipped: "Задача обработана и помечена как пропущенная.",
};

const LOAD_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Ошибка сети при загрузке операционного статуса.",
};

const REPLAY_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Ошибка сети при повторе доставки.",
  rate_limited: RATE_LIMITED_STATUS_TEXT,
  replay_event_not_verified:
    "У события нет подтвержденной подписи Stripe (наследие миграции) — повтор невозможен.",
  replay_job_not_found: "Задача не найдена или уже обработана. Обнови статус.",
  replay_kind_unsupported:
    "Эту задачу нельзя повторить из админки — для нее нет автоматического обработчика. Напиши разработчику.",
};

const REISSUE_ERROR_MESSAGES: Record<string, string> = {
  network_error: "Ошибка сети при перевыпуске ссылок.",
  purchase_not_found: "Покупка не найдена в базе.",
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
          LOAD_ERROR_MESSAGES[result.errorCode] ??
          "Не удалось загрузить операционный статус.",
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
        text: "Повторяю доставку...",
        tone: "info",
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
            `Задача переведена в статус «${replayStatus ?? "pending"}».`,
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
        text: "Перевыпускаю ссылки доступа...",
        tone: "info",
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
                    text: "Для этой покупки ссылки не создаются: доступ выдается вручную.",
                    tone: "info",
                  }
                : {
                    text: "Telegram не отдал новые ссылки. Попробуй позже или проверь настройки бота.",
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
