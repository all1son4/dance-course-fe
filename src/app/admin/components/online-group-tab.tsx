import { Info, RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
} from "@/constants/sellable-products";
import type { AttentionItem } from "@/lib/admin/overview";
import type { CohortOverview } from "@/lib/online-group/cohort-admin";

import type { useCohortsAdmin } from "../hooks/use-cohorts-admin";
import type { useOnlineGroupAdmin } from "../hooks/use-online-group-admin";
import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type { AdminFeatureId } from "../lib/admin.types";
import { parseWarsawDateTimeInput } from "../lib/admin.utils";
import { requestAdminJson } from "../lib/admin-request";
import {
  AdminButton,
  Callout,
  PageHeader,
  Panel,
  SegmentedTabs,
  Stack,
  TextButton,
} from "../ui/primitives";
import { AttentionList } from "./attention-list";
import type { NextCohortInput, RenewalLinkKind } from "./cohort-transition-guide";
import { CohortsPanel } from "./cohorts-panel";
import {
  ActiveOnlineGroupCard,
  OnlineGroupInviteLinksCard,
  RenewalCampaignsCard,
  RenewalGeneratorCard,
} from "./online-group-workspace";

type Section = "cohorts" | "stream" | "renewals" | "manual";

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

type OnlineGroupTabProps = {
  attention: AttentionItem[];
  cohorts: ReturnType<typeof useCohortsAdmin>;
  onNavigate: (view: AdminFeatureId) => void;
  onProblemsChanged: () => void;
  onUnauthorized: () => void;
  settings: ReturnType<typeof useOnlineGroupAdmin>;
};

const submit = (action: () => unknown) => (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  void action();
};

/**
 * Everything about the teaching cohorts in one place: what needs fixing first,
 * then the cohorts themselves, then the tools the operator reaches for less often.
 */
export const OnlineGroupTab = ({
  attention,
  cohorts,
  onNavigate,
  onProblemsChanged,
  onUnauthorized,
  settings,
}: OnlineGroupTabProps) => {
  const [section, setSection] = useState<Section>("cohorts");
  const isRefreshing = cohorts.isLoading || settings.isLoading;

  const refresh = () => {
    void cohorts.load();
    void settings.load();
    onProblemsChanged();
  };

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

  return (
    <Stack $gap={20}>
      <PageHeader
        title="Online Group"
        description="Потоки, продажи Standard и Plus, ссылки продления и ручные доступы."
        actions={
          <AdminButton
            icon={<RefreshCw aria-hidden />}
            loading={isRefreshing}
            onClick={refresh}
          >
            Обновить
          </AdminButton>
        }
      />

      {attention.length > 0 && (
        <Panel title={`Требует внимания · ${attention.length}`}>
          <AttentionList
            currentView="online-group"
            items={attention}
            onFixed={refresh}
            onNavigate={onNavigate}
          />
        </Panel>
      )}

      <SegmentedTabs<Section>
        label="Разделы Online Group"
        value={section}
        onChange={setSection}
        items={[
          { id: "cohorts", label: "Потоки" },
          { id: "stream", label: "Настройки потока" },
          { id: "renewals", label: "Продления" },
          { id: "manual", label: "Ручной доступ" },
        ]}
      />

      {section === "cohorts" && (
        <CohortsPanel
          cohorts={cohorts.cohorts}
          failed={cohorts.failed}
          isClosing={cohorts.isClosing}
          loadedAt={cohorts.loadedAt}
          onClose={cohorts.close}
          onClosed={() => {
            void settings.load();
            onProblemsChanged();
          }}
          onReload={cohorts.load}
          onRetryPost={cohorts.retryPost}
          onCreateRenewalLink={createRenewalLink}
          onCreateNextCohort={createNextCohort}
          chats={settings.telegramChats}
          libraryChatId={settings.activeCampaign?.inspirationChatId ?? ""}
          onSetDurationWeeks={cohorts.setDurationWeeks}
          onSetPreviousChatRemoval={cohorts.setPreviousChatRemoval}
          onUnauthorized={onUnauthorized}
          retryingId={cohorts.retryingId}
        />
      )}

      {section === "stream" && (
        <Stack $gap={12}>
          <Callout tone="info" icon={<Info aria-hidden />}>
            Переход на следующий поток делается во вкладке «Потоки» → «Настроить переход»:
            ссылки продления, пост, закрытие. Закрытие само сделает следующий поток
            текущим, здесь для этого ничего менять не нужно.
          </Callout>
          {settings.activeCampaign && (
            <Callout tone="info" icon={<Info aria-hidden />}>
              Plus даёт доступ в библиотеку Inspiration Hub (группа «
              {settings.inspirationChatTitle}»). Всё о ней — в разделе{" "}
              <TextButton type="button" onClick={() => onNavigate("inspiration-hub")}>
                Inspiration Hub
              </TextButton>
              .
            </Callout>
          )}
          <ActiveOnlineGroupCard
            activeCampaign={settings.activeCampaign}
            activeMainChatTitle={settings.activeMainChatTitle}
            inspirationChatTitle={settings.inspirationChatTitle}
            isFormOpen={settings.isFormOpen}
            isLoading={settings.isLoading}
            isSaveDisabled={settings.isSaveDisabled}
            isSaving={settings.isSaving}
            libraryChatId={settings.libraryChatId}
            mainChatId={settings.mainChatId}
            onFormToggle={settings.toggleForm}
            onLibraryChatChange={settings.changeLibraryChat}
            onMainChatChange={settings.changeMainChat}
            onRefresh={settings.load}
            onStartsAtChange={settings.changeStartsAt}
            onSubmit={submit(async () => {
              await settings.saveSettings();
              // A new start or title shows in the cohort cards and the overview too.
              void cohorts.load();
              onProblemsChanged();
            })}
            onTitleChange={settings.setTitle}
            startsAt={settings.startsAt}
            status={settings.status}
            telegramChatOptions={settings.telegramChatSelectOptions}
            title={settings.title}
          />
        </Stack>
      )}

      {section === "renewals" &&
        (settings.activeCampaign || settings.renewalCampaigns.length > 0 ? (
          <Stack $gap={16}>
            <Callout tone="info" icon={<Info aria-hidden />}>
              Ссылки Plus и Standard для перехода на следующий поток удобнее создать в
              «Потоках» одной кнопкой. Здесь — для особых случаев: несколько
              чатов-источников или замена ссылки.
            </Callout>
            {settings.activeCampaign && (
              <RenewalGeneratorCard
                chats={settings.telegramChats}
                generatedLink={settings.generatedRenewalLink}
                isDisabled={settings.isRenewalGenerateDisabled}
                isGenerating={settings.isGeneratingRenewal}
                isLoading={settings.isLoading}
                offerId={settings.renewalOfferId}
                offerOptions={settings.renewalOfferSelectOptions}
                onOfferChange={settings.changeRenewalOffer}
                onRegenerate={() => void settings.generateRenewal(true)}
                onSourceChatToggle={settings.toggleRenewalSourceChat}
                onSubmit={submit(settings.generateRenewal)}
                sourceChatIds={settings.renewalSourceChatIds}
                status={settings.renewalStatus}
                title={settings.renewalTitle}
                onTitleChange={settings.setRenewalTitle}
              />
            )}
            <RenewalCampaignsCard
              campaigns={settings.renewalCampaigns}
              onToggleStatus={settings.toggleRenewalStatus}
              updatingSlug={settings.updatingRenewalSlug}
            />
          </Stack>
        ) : (
          <Callout tone="info" icon={<Info aria-hidden />}>
            Ссылки продления появятся, когда будет настроен поток.
          </Callout>
        ))}

      {section === "manual" &&
        (settings.hasConfiguredCampaign ? (
          <OnlineGroupInviteLinksCard
            target={
              settings.activeCampaign
                ? `«${settings.activeCampaign.title}» (чат «${settings.activeMainChatTitle}»)`
                : ""
            }
            accessMode={settings.adminAccessMode}
            adminLabel={settings.adminLabel}
            grants={settings.adminGrants}
            isDisabled={settings.isAdminGenerateDisabled}
            isGenerating={settings.isGeneratingAdminAccess}
            isLoading={settings.isLoading}
            onAccessModeChange={settings.changeAdminAccessMode}
            onAdminLabelChange={settings.changeAdminLabel}
            onRefresh={settings.load}
            onSubmit={submit(settings.generateAdminAccess)}
            status={settings.adminStatus}
          />
        ) : (
          <Callout tone="info" icon={<Info aria-hidden />}>
            Ручной доступ можно выдать, когда настроен поток.
          </Callout>
        ))}
    </Stack>
  );
};
