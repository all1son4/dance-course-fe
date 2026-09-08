import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ADMIN_API_ENDPOINTS, KIND_OPTIONS } from "../lib/admin.constants";
import type {
  GeneratedLinkEntry,
  GenerateResponse,
  GeneratorKind,
  HistoryResponse,
  LessonLanguage,
  LinkState,
  SelectOption,
  StatusMessage,
} from "../lib/admin.types";
import { getChoreoSelections, resolveGeneratorErrorMessage } from "../lib/admin.utils";
import { requestAdminJson } from "../lib/admin-request";

type UseInviteLinksAdminOptions = {
  isAuthorized: boolean;
  onUnauthorized: () => void;
};

export const useInviteLinksAdmin = ({
  isAuthorized,
  onUnauthorized,
}: UseInviteLinksAdminOptions) => {
  const choreoSelections = useMemo(() => getChoreoSelections(), []);
  const choreoSelectionMap = useMemo(
    () => new Map(choreoSelections.map((item) => [item.key, item])),
    [choreoSelections],
  );

  const [kind, setKind] = useState<GeneratorKind>("first-touch");
  const [selectedChoreoKey, setSelectedChoreoKey] = useState("");
  const [adminLabel, setAdminLabel] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [status, setStatus] = useState<StatusMessage>(null);
  const [hasLoadedJournalOnce, setHasLoadedJournalOnce] = useState(false);
  const [isJournalLoading, setIsJournalLoading] = useState(false);
  const [recentLinks, setRecentLinks] = useState<GeneratedLinkEntry[]>([]);
  const journalLoadInFlightRef = useRef(false);

  const resolvedChoreoSelection = selectedChoreoKey
    ? (choreoSelectionMap.get(selectedChoreoKey) ?? null)
    : null;
  const isGenerateDisabled =
    isGenerating || !adminLabel.trim() || (kind === "choreo" && !resolvedChoreoSelection);
  const kindSelectOptions: SelectOption[] = KIND_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
  }));
  const choreoSelectOptions: SelectOption[] = choreoSelections.map((selection) => ({
    label: selection.label,
    value: selection.key,
  }));
  const isJournalInitialLoading = isJournalLoading && !hasLoadedJournalOnce;

  const loadJournal = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      if (journalLoadInFlightRef.current) {
        return;
      }

      journalLoadInFlightRef.current = true;
      setIsJournalLoading(true);

      const endpoint = forceRefresh
        ? `${ADMIN_API_ENDPOINTS.inviteLinksHistory}?refresh=1`
        : ADMIN_API_ENDPOINTS.inviteLinksHistory;

      const result = await requestAdminJson<HistoryResponse>(endpoint);

      if (result.unauthorized) {
        onUnauthorized();
      } else if (result.ok) {
        // A failed history request stays silent by design: it must not block
        // admin actions.
        setRecentLinks(Array.isArray(result.data.items) ? result.data.items : []);
      }

      setHasLoadedJournalOnce(true);
      setIsJournalLoading(false);
      journalLoadInFlightRef.current = false;
    },
    [onUnauthorized],
  );

  const refreshJournal = useCallback(async () => {
    if (isJournalLoading) {
      return;
    }

    await loadJournal({
      forceRefresh: true,
    });
  }, [isJournalLoading, loadJournal]);

  const changeKind = useCallback((nextKind: GeneratorKind) => {
    setKind(nextKind);
    setGeneratedLink("");
    setStatus(null);

    if (nextKind !== "choreo") {
      setSelectedChoreoKey("");
    }
  }, []);

  const selectChoreo = useCallback((value: string) => {
    setSelectedChoreoKey(value);
    setGeneratedLink("");
    setStatus(null);
  }, []);

  const generate = useCallback(async () => {
    if (isGenerateDisabled) {
      return;
    }

    setIsGenerating(true);
    setStatus({
      text: "Генерирую invite-ссылку...",
      tone: "info",
    });
    setGeneratedLink("");

    const normalizedAdminLabel = adminLabel.trim();

    const body =
      kind === "choreo" && resolvedChoreoSelection
        ? {
            adminLabel: normalizedAdminLabel,
            kind,
            lessonLanguage: resolvedChoreoSelection.lessonLanguage,
            offerId: resolvedChoreoSelection.offerId,
            productId: resolvedChoreoSelection.productId,
          }
        : {
            adminLabel: normalizedAdminLabel,
            kind,
            lessonLanguage: "ru" satisfies LessonLanguage,
          };

    const result = await requestAdminJson<GenerateResponse>(
      ADMIN_API_ENDPOINTS.inviteLinks,
      {
        body,
        method: "POST",
      },
    );
    const { accessUrl, status: generatedStatus, tokenExpiresAt } = result.data;

    if (result.unauthorized) {
      onUnauthorized();
      setStatus(null);
    } else if (!result.ok || generatedStatus !== "ready" || !accessUrl) {
      setStatus({
        text: resolveGeneratorErrorMessage(result.errorCode, result.data.reason ?? ""),
        tone: "error",
      });
    } else {
      const selectionLabel =
        kind === "choreo" && resolvedChoreoSelection
          ? resolvedChoreoSelection.label
          : "Первый курс (First Touch)";

      setGeneratedLink(accessUrl);
      setStatus({
        text: "Ссылка готова. Можно копировать.",
        tone: "success",
      });
      setRecentLinks((previousLinks) => [
        {
          accessUrl,
          adminLabel: normalizedAdminLabel,
          createdAtIso: new Date().toISOString(),
          linkState: "active" satisfies LinkState,
          selectionLabel,
          tokenExpiresAt: tokenExpiresAt ?? "",
        },
        ...previousLinks.filter((entry) => entry.accessUrl !== accessUrl),
      ]);
      setAdminLabel("");
    }

    setIsGenerating(false);
  }, [adminLabel, isGenerateDisabled, kind, onUnauthorized, resolvedChoreoSelection]);

  const resetForLogout = useCallback(() => {
    setGeneratedLink("");
    setStatus(null);
    setRecentLinks([]);
    setHasLoadedJournalOnce(false);
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      setHasLoadedJournalOnce(false);
      setIsJournalLoading(false);
      journalLoadInFlightRef.current = false;
      return;
    }

    void loadJournal();
  }, [isAuthorized, loadJournal]);

  return {
    adminLabel,
    changeKind,
    choreoSelectOptions,
    generate,
    generatedLink,
    isGenerateDisabled,
    isGenerating,
    isJournalInitialLoading,
    isJournalLoading,
    kind,
    kindSelectOptions,
    loadJournal,
    recentLinks,
    refreshJournal,
    resetForLogout,
    selectChoreo,
    selectedChoreoKey,
    setAdminLabel,
    setStatus,
    status,
  };
};
