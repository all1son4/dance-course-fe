import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminOverview } from "@/lib/admin/overview";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import { requestAdminJson } from "../lib/admin-request";

const REFRESH_ON_FOCUS_AFTER_MS = 60_000;

/**
 * The overview also feeds the sidebar badges, so it loads as soon as the session is
 * confirmed and refreshes when the operator comes back to the tab.
 */
export const useOverviewAdmin = ({
  isAuthorized,
  onUnauthorized,
}: {
  isAuthorized: boolean;
  onUnauthorized: () => void;
}) => {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadedAt = useRef(0);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setIsLoading(true);
    const result = await requestAdminJson<AdminOverview>(ADMIN_API_ENDPOINTS.overview);
    if (current !== sequence.current) return;
    setIsLoading(false);

    if (result.unauthorized) {
      onUnauthorized();
      return;
    }
    // A reply without the attention list is not an overview (an old deploy, a proxy
    // page): show "не удалось загрузить" instead of breaking the whole admin.
    if (!result.ok || !Array.isArray(result.data?.attention)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setOverview(result.data);
    loadedAt.current = Date.now();
  }, [onUnauthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    void load();

    const onFocus = () => {
      if (Date.now() - loadedAt.current > REFRESH_ON_FOCUS_AFTER_MS) void load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isAuthorized, load]);

  return { failed, isLoading, load, overview };
};
