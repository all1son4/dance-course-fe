import { useCallback, useEffect, useRef, useState } from "react";

import type { CohortOverview } from "@/lib/online-group/cohort-admin";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import { requestAdminJson } from "../lib/admin-request";

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
  postStatus: string | null;
};

const CLOSE_ERRORS: Record<string, string> = {
  cohort_closure_before_start: "Поток ещё не начался — закрыть его можно после старта.",
  cohort_closure_lessons_not_cleared: "Сначала убери уроки из чата и отметь это.",
  cohort_closure_next_cohort_missing:
    "Следующий поток не заведён: продажи открывать нечему. Сними галочку или попроси разработчика.",
  cohort_closure_not_found: "Поток не найден. Обнови страницу.",
  cohort_closure_title_mismatch: "Название введено с ошибкой.",
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
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await requestAdminJson<{ cohorts: CohortOverview[] }>(
      ADMIN_API_ENDPOINTS.onlineGroupCohorts,
    );
    setIsLoading(false);
    if (result.unauthorized) return onUnauthorized();
    if (result.ok) {
      setCohorts(result.data.cohorts);
      setLoadedAt(Date.now());
      loaded.current = true;
    }
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

  return {
    close,
    cohorts,
    isClosing,
    isLoading,
    load,
    loadedAt,
    retryPost,
    retryingId,
  };
};
