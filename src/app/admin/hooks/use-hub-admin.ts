import { useCallback, useEffect, useRef, useState } from "react";

import type { HubAdminOverview } from "@/lib/admin/hub-admin";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import { requestAdminJson } from "../lib/admin-request";

export type ReissuedLink = { accessUrl: string; label: string; tokenExpiresAt: string };

/** What «Ссылка заново» ended with, for the message next to it. */
export type ReissueOutcome = "failed" | "not_needed" | "ready" | "telegram_failed";

export const useHubAdmin = ({
  isActive,
  isAuthorized,
  onUnauthorized,
}: {
  isActive: boolean;
  isAuthorized: boolean;
  onUnauthorized: () => void;
}) => {
  const [hub, setHub] = useState<HubAdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [previewAt, setPreviewAt] = useState<string>("");
  const [reissuing, setReissuing] = useState("");
  const [reissued, setReissued] = useState<Record<string, ReissuedLink[] | "none">>({});
  const sequence = useRef(0);
  const loaded = useRef(false);

  const load = useCallback(
    async (nextPreviewAt = previewAt) => {
      const current = ++sequence.current;
      setIsLoading(true);
      const query = nextPreviewAt
        ? `?previewAt=${encodeURIComponent(nextPreviewAt)}`
        : "";
      const result = await requestAdminJson<HubAdminOverview>(
        `${ADMIN_API_ENDPOINTS.hub}${query}`,
      );
      if (current !== sequence.current) return;
      setIsLoading(false);
      if (result.unauthorized) {
        onUnauthorized();
        return;
      }
      setFailed(!result.ok);
      if (result.ok) {
        setHub(result.data);
        loaded.current = true;
      }
    },
    [onUnauthorized, previewAt],
  );

  useEffect(() => {
    if (isActive && isAuthorized && !loaded.current) void load();
  }, [isActive, isAuthorized, load]);

  const changePreviewAt = (value: string) => {
    setPreviewAt(value);
    void load(value);
  };

  const reissue = async (paymentIntentId: string): Promise<ReissueOutcome> => {
    setReissuing(paymentIntentId);
    const result = await requestAdminJson<{ links?: ReissuedLink[]; status: string }>(
      ADMIN_API_ENDPOINTS.operationsReissueAccess,
      { body: { paymentIntentId }, method: "POST" },
    );
    setReissuing("");
    if (result.unauthorized) {
      onUnauthorized();
      return "failed";
    }
    if (!result.ok) return "failed";
    // "no_links": the purchase needs a link but Telegram did not make one - a
    // failure, not the "nothing to send" of "not_applicable".
    if (result.data.status === "no_links") return "telegram_failed";
    const links = result.data.links ?? [];
    setReissued((current) => ({
      ...current,
      [paymentIntentId]: links.length ? links : "none",
    }));
    return links.length ? "ready" : "not_needed";
  };

  return {
    changePreviewAt,
    failed,
    hub,
    isLoading,
    load,
    previewAt,
    reissue,
    reissued,
    reissuing,
  };
};
