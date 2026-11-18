import { useCallback, useEffect, useState } from "react";

import type {
  CohortInviteAddressCheck,
  CohortInviteAdminSnapshot,
  CohortInviteDeliveryResult,
} from "@/lib/cohort-invite-broadcast";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type { StatusMessage } from "../lib/admin.types";
import { requestAdminJson } from "../lib/admin-request";
import { letters } from "../lib/cohort-invite-view";

type Response = {
  checks?: CohortInviteAddressCheck[];
  errorCode?: string;
  remainingToday?: number;
  result?: CohortInviteDeliveryResult | null;
  snapshot?: CohortInviteAdminSnapshot | null;
};

export type CohortInviteScope = "campaign" | "global";
export type CohortInviteTestInput = {
  email: string;
  links: "pages" | "renewal";
  locale: "en" | "pl" | "ru";
};

const ERROR_TEXT: Record<string, string> = {
  batch_in_progress:
    "Сейчас уже идёт отправка. Дождись её окончания — список обновится сам.",
  batch_size_invalid: "Размер партии — целое число от 1.",
  daily_limit_reached:
    "На сегодня остаток исчерпан: часть лимита Resend оставлена для писем о покупках. Продолжи завтра.",
  delivery_in_progress: "Письмо этому адресу сейчас отправляется. Обнови список.",
  invalid_email: "Проверь адрес для теста.",
  network_error:
    "Ошибка сети: ответа нет. Нажми «Обновить» — по счётчикам будет видно, ушло ли что-то.",
  no_cohort_on_sale: "Нет потока в продаже — рассылать нечего.",
  no_recipients: "Отправлять некому: все уже получили письмо или исключены.",
  not_actionable: "Этому адресу письмо уже отправлено.",
  over_limit:
    "Писем больше, чем осталось на сегодня или в списке. Список пересчитан — проверь число.",
  sales_closed: "Продажи онлайн-группы закрыты — ссылки в письме не сработают.",
  sales_state_unavailable: "Не удалось проверить, открыты ли продажи. Попробуй ещё раз.",
  too_many_addresses: "За один раз — не больше 50 адресов.",
  unsubscribe_not_configured:
    "На сервере нет ACCESS_LINK_SECRET — без ссылки отписки рассылка не уходит.",
};

const errorText = (code: string, fallback: string) => ERROR_TEXT[code] ?? fallback;

const describeDelivery = ({ failed, sent, stoppedByQuota }: CohortInviteDeliveryResult) =>
  [
    `Отправлено: ${sent}.`,
    failed > 0
      ? `Не дошло: ${failed} — они остались в списке, уйдут при следующей отправке.`
      : "",
    stoppedByQuota
      ? "Resend отказал по лимиту — отправка остановлена, остальные остались в списке."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

/** What «Проверить» found, said once: the table under it keeps the details. */
const describeCheck = (
  checks: readonly CohortInviteAddressCheck[],
  remainingToday: number | undefined,
): StatusMessage => {
  const ready = checks.filter(
    (check) => check.status === "ready" || check.status === "ready_new",
  ).length;
  const skipped = checks.length - ready;

  if (ready === 0)
    return {
      text: "Отправлять некому: все адреса из списка уже получили письмо или пропускаются.",
      tone: "info",
    };
  if (remainingToday !== undefined && ready > remainingToday)
    return {
      text: `Сегодня можно ещё ${letters(remainingToday)}, а в списке ${ready}. Убери часть адресов или продолжи завтра.`,
      tone: "error",
    };
  return {
    text:
      skipped > 0
        ? `Отправим ${letters(ready)}, пропустим ${skipped} — причина у каждого адреса в таблице.`
        : `Проверено: отправим ${letters(ready)}.`,
    tone: "info",
  };
};

/** «Приглашение в поток»: reloaded every time the tab opens. */
export const useCohortInviteAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
}) => {
  const [snapshot, setSnapshot] = useState<CohortInviteAdminSnapshot | null>(null);
  const [loadStatus, setLoadStatus] = useState<StatusMessage>(null);
  const [batchStatus, setBatchStatus] = useState<StatusMessage>(null);
  const [testStatus, setTestStatus] = useState<StatusMessage>(null);
  const [listStatus, setListStatus] = useState<StatusMessage>(null);
  const [tableStatus, setTableStatus] = useState<StatusMessage>(null);
  const [listChecks, setListChecks] = useState<CohortInviteAddressCheck[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await requestAdminJson<Response>(
      ADMIN_API_ENDPOINTS.cohortInviteBroadcast,
    );

    if (result.unauthorized) onUnauthorized();
    else if (!result.ok || !result.data.snapshot) {
      setLoadStatus({
        text: errorText(result.errorCode, "Не удалось загрузить список получателей."),
        tone: "error",
      });
    } else {
      setSnapshot(result.data.snapshot);
      setLoadStatus(null);
    }

    setIsLoading(false);
  }, [onUnauthorized]);

  const sendBatch = useCallback(
    async (size: number) => {
      setIsSending(true);
      setBatchStatus({
        text: `Отправляю партию из ${size}. Не закрывай вкладку, это займёт до минуты…`,
        tone: "info",
      });

      const result = await requestAdminJson<Response>(
        ADMIN_API_ENDPOINTS.cohortInviteBroadcast,
        { body: { action: "batch", size }, method: "POST" },
      );

      if (result.unauthorized) onUnauthorized();
      else if (!result.ok || !result.data.result) {
        setBatchStatus({
          text: errorText(
            result.errorCode,
            "Партия не ушла. Обнови список и попробуй снова.",
          ),
          tone: "error",
        });
      } else {
        const { failed, stoppedByQuota } = result.data.result;
        if (result.data.snapshot) setSnapshot(result.data.snapshot);
        setBatchStatus({
          text: describeDelivery(result.data.result),
          tone: failed > 0 || stoppedByQuota ? "info" : "success",
        });
      }

      // Whatever happened, the counters on screen come from the database again.
      if (!result.ok) void load();
      setIsSending(false);
    },
    [load, onUnauthorized],
  );

  const sendTest = useCallback(
    async (input: CohortInviteTestInput) => {
      setIsTesting(true);
      const result = await requestAdminJson<Response>(
        ADMIN_API_ENDPOINTS.cohortInviteBroadcast,
        { body: { action: "test", ...input }, method: "POST" },
      );

      if (result.unauthorized) onUnauthorized();
      else
        setTestStatus(
          result.ok
            ? {
                text: `Тест (${input.locale.toUpperCase()}) отправлен на ${input.email}. Проверь входящие и папку «Спам».`,
                tone: "success",
              }
            : { text: errorText(result.errorCode, "Тест не ушёл."), tone: "error" },
        );

      setIsTesting(false);
    },
    [onUnauthorized],
  );

  const checkList = useCallback(
    async (addresses: string) => {
      setIsChecking(true);
      setListStatus(null);
      const result = await requestAdminJson<Response>(
        ADMIN_API_ENDPOINTS.cohortInviteBroadcast,
        { body: { action: "check", addresses }, method: "POST" },
      );

      if (result.unauthorized) onUnauthorized();
      else if (!result.ok || !result.data.checks) {
        setListChecks(null);
        setListStatus({
          text: errorText(result.errorCode, "Не удалось проверить адреса."),
          tone: "error",
        });
      } else {
        setListChecks(result.data.checks);
        setListStatus(describeCheck(result.data.checks, result.data.remainingToday));
      }

      setIsChecking(false);
    },
    [onUnauthorized],
  );

  const sendList = useCallback(
    async (addresses: string, count: number) => {
      setIsSending(true);
      setListStatus({
        text: `Отправляю ${count}. Не закрывай вкладку…`,
        tone: "info",
      });
      const result = await requestAdminJson<Response>(
        ADMIN_API_ENDPOINTS.cohortInviteBroadcast,
        { body: { action: "list", addresses }, method: "POST" },
      );

      if (result.unauthorized) onUnauthorized();
      else if (!result.ok || !result.data.result) {
        setListStatus({
          text: errorText(result.errorCode, "Письма не ушли. Проверь список ещё раз."),
          tone: "error",
        });
        void load();
      } else {
        if (result.data.checks) setListChecks(result.data.checks);
        if (result.data.snapshot) setSnapshot(result.data.snapshot);
        setListStatus({
          text: describeDelivery(result.data.result),
          tone:
            result.data.result.failed > 0 || result.data.result.stoppedByQuota
              ? "info"
              : "success",
        });
      }

      setIsSending(false);
    },
    [load, onUnauthorized],
  );

  const exclude = useCallback(
    async (email: string, scope: CohortInviteScope) => {
      setUpdatingEmail(email);
      const result = await requestAdminJson<Response>(
        ADMIN_API_ENDPOINTS.cohortInviteBroadcast,
        { body: { email, scope }, method: "PATCH" },
      );

      if (result.unauthorized) onUnauthorized();
      else if (!result.ok || !result.data.snapshot) {
        setTableStatus({
          text: errorText(result.errorCode, "Не удалось исключить адрес."),
          tone: "error",
        });
      } else {
        setSnapshot(result.data.snapshot);
        setTableStatus({
          text:
            scope === "global"
              ? `${email} больше не получит ни одной рассылки.`
              : `${email} не получит эту рассылку.`,
          tone: "success",
        });
      }

      setUpdatingEmail("");
    },
    [onUnauthorized],
  );

  // Every opening of the tab reads the list again: someone may have paid meanwhile.
  useEffect(() => {
    if (!isAuthorized) {
      setSnapshot(null);
      return;
    }
    if (isActive) void load();
  }, [isActive, isAuthorized, load]);

  return {
    batchStatus,
    checkList,
    clearListChecks: () => setListChecks(null),
    exclude,
    isChecking,
    isLoading,
    isSending,
    isTesting,
    listChecks,
    listStatus,
    load,
    loadStatus,
    sendBatch,
    sendList,
    sendTest,
    snapshot,
    tableStatus,
    testStatus,
    updatingEmail,
  };
};
