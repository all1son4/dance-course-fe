import { useCallback, useEffect, useRef, useState } from "react";

import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
} from "@/constants/sellable-products";
import type { CohortOverview } from "@/lib/online-group/cohort-admin";

import type {
  NextCohortInput,
  RenewalLinkKind,
} from "../components/cohort-transition-guide";
import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import { parseWarsawDateTimeInput } from "../lib/admin.utils";
import { requestAdminJson } from "../lib/admin-request";
import type { useOnlineGroupAdmin } from "./use-online-group-admin";

export type CloseCohortInput = {
  cohortId: string;
  confirmationTitle: string;
  lessonsCleared: boolean;
  openNextCohortSales: boolean;
  post: { pin: boolean; text: string } | null;
};

export type CloseCohortResult = {
  accessEndsAt: string | null;
  alreadyClosed: boolean;
  continuations: { failures: { entitlementId: string; reason: string }[] };
  nextCohortSalesOpened: boolean;
  /** The next cohort became the current one in «Настройки потока». */
  campaignSwitch: "switched" | "not_needed" | "failed";
  postStatus: string | null;
};

const CLOSE_ERRORS: Record<string, string> = {
  cohort_closure_before_start: "Поток ещё не начался — закрыть его можно после старта.",
  cohort_closure_lessons_not_cleared: "Сначала убери уроки из чата и отметь это.",
  cohort_closure_next_cohort_missing:
    "Следующий поток не заведён: продажи открывать нечему. Сними галочку «Открыть продажи» или сначала заведи следующий поток.",
  cohort_closure_not_found: "Поток не найден. Обнови страницу.",
  cohort_closure_title_mismatch:
    "Название не совпадает — скопируй его из заголовка окна.",
  rate_limited: "Слишком часто. Подожди минуту.",
};

export const useCohortsAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
}) => {
  const [cohorts, setCohorts] = useState<CohortOverview[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [loadedAt, setLoadedAt] = useState(0);
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);
  // Close, retry and the switch all reload: only the latest answer may land.
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setIsLoading(true);
    const result = await requestAdminJson<{ cohorts: CohortOverview[] }>(
      ADMIN_API_ENDPOINTS.onlineGroupCohorts,
    );
    if (current !== sequence.current) return;
    setIsLoading(false);
    if (result.unauthorized) return onUnauthorized();
    if (!result.ok || !Array.isArray(result.data?.cohorts)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setCohorts(result.data.cohorts);
    setLoadedAt(Date.now());
    loaded.current = true;
  }, [onUnauthorized]);

  useEffect(() => {
    if (isActive && isAuthorized && !loaded.current) void load();
  }, [isActive, isAuthorized, load]);

  const close = async (
    input: CloseCohortInput,
  ): Promise<
    { ok: true; result: CloseCohortResult } | { ok: false; message: string }
  > => {
    setIsClosing(true);
    const response = await requestAdminJson<{ result: CloseCohortResult }>(
      ADMIN_API_ENDPOINTS.onlineGroupCohorts,
      { body: input, method: "POST" },
    );
    setIsClosing(false);
    if (response.unauthorized) {
      onUnauthorized();
      return { ok: false, message: "Сессия закончилась. Войди заново." };
    }
    if (!response.ok) {
      return {
        ok: false,
        message:
          CLOSE_ERRORS[response.errorCode] ??
          "Поток не закрылся. Ничего не изменилось — попробуй ещё раз.",
      };
    }
    await load();
    return { ok: true, result: response.data.result };
  };

  const retryPost = async (cohortId: string) => {
    setRetryingId(cohortId);
    const response = await requestAdminJson<{ status: string }>(
      ADMIN_API_ENDPOINTS.onlineGroupCohortPostRetry,
      { body: { cohortId }, method: "POST" },
    );
    setRetryingId("");
    if (response.unauthorized) {
      onUnauthorized();
      return false;
    }
    await load();
    return response.ok && response.data.status === "sent";
  };

  /** HUB-D44: the per-cohort switch of the removal from the previous chat. */
  const setPreviousChatRemoval = async (cohortId: string, enabled: boolean) => {
    const response = await requestAdminJson<{ enabled: boolean }>(
      ADMIN_API_ENDPOINTS.onlineGroupCohorts,
      { body: { cohortId, removesPreviousChatMembers: enabled }, method: "PATCH" },
    );
    if (response.unauthorized) {
      onUnauthorized();
      return false;
    }
    await load();
    return response.ok;
  };

  /** HUB-D50: the planned length of a cohort, in weeks. */
  const setDurationWeeks = async (cohortId: string, durationWeeks: number) => {
    const response = await requestAdminJson<{ durationWeeks: number }>(
      ADMIN_API_ENDPOINTS.onlineGroupCohorts,
      { body: { cohortId, durationWeeks }, method: "PATCH" },
    );
    if (response.unauthorized) {
      onUnauthorized();
      return false;
    }
    await load();
    return response.ok;
  };

  return {
    close,
    cohorts,
    failed,
    isClosing,
    isLoading,
    load,
    loadedAt,
    retryPost,
    retryingId,
    setDurationWeeks,
    setPreviousChatRemoval,
  };
};

const NEXT_COHORT_ERRORS: Record<string, string> = {
  cohort_duration_invalid: "Длительность — целое число недель от 1 до 26.",
  cohort_not_found: "Предыдущий поток не найден. Обнови страницу.",
  next_cohort_chat_is_library: "Это чат Inspiration Hub — для потока нужен свой чат.",
  next_cohort_chat_taken: "Этот чат уже занят другим потоком.",
  next_cohort_exists: "Следующий поток уже заведён. Обнови страницу.",
  next_cohort_incomplete: "Заполни название, чат и дату старта.",
  next_cohort_starts_too_early: "Старт должен быть позже старта предыдущего потока.",
  rate_limited: "Слишком много попыток. Подожди минуту.",
  telegram_chat_not_registered:
    "Чат не зарегистрирован: добавь бота в чат администратором и отправь /register_chat.",
};

/**
 * The Online Group tab's two transition actions. Each reloads both the cohorts and the
 * stream settings, so they take both hooks instead of living inside one of them.
 */
export const createCohortTransitionActions = ({
  cohorts,
  onUnauthorized,
  settings,
}: {
  cohorts: ReturnType<typeof useCohortsAdmin>;
  onUnauthorized: () => void;
  settings: ReturnType<typeof useOnlineGroupAdmin>;
}) => {
  /** «Завести следующий поток»: the record that follows the newest cohort. */
  const createNextCohort = async (
    previous: CohortOverview,
    input: NextCohortInput,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    const startsAt = parseWarsawDateTimeInput(input.startsAt);
    if (!startsAt) return { ok: false, message: "Укажи дату и время старта." };

    const response = await requestAdminJson<{ status?: string; errorCode?: string }>(
      ADMIN_API_ENDPOINTS.onlineGroupNextCohort,
      {
        body: {
          durationWeeks: input.durationWeeks,
          mainChatId: input.mainChatId,
          previousCohortId: previous.id,
          startsAt,
          title: input.title,
        },
        method: "POST",
      },
    );
    if (response.unauthorized) {
      onUnauthorized();
      return { ok: false, message: "Сессия закончилась. Войди заново." };
    }
    if (response.ok && response.data.status === "created") {
      await Promise.all([cohorts.load(), settings.load()]);
      return { ok: true };
    }
    return {
      ok: false,
      message:
        NEXT_COHORT_ERRORS[response.data.errorCode ?? response.errorCode] ??
        "Не получилось завести поток. Попробуй ещё раз.",
    };
  };

  /** One click from the transition guide: the running cohort's chat is the only source. */
  const createRenewalLink = async (cohort: CohortOverview, kind: RenewalLinkKind) => {
    const response = await requestAdminJson<{ status?: string }>(
      ADMIN_API_ENDPOINTS.renewalCampaigns,
      {
        body: {
          offerId:
            kind === "plus"
              ? ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID
              : ONLINE_GROUP_RENEWAL_OFFER_ID,
          sourceChatIds: [cohort.mainChatId],
          title: `${cohort.title} → ${cohort.next?.title ?? ""}`.trim(),
        },
        method: "POST",
      },
    );
    if (response.unauthorized) {
      onUnauthorized();
      return false;
    }
    await Promise.all([cohorts.load(), settings.load()]);
    return response.ok && response.data.status === "ready";
  };

  return { createNextCohort, createRenewalLink };
};
