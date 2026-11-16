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
import { requestAdminJson } from "../lib/admin-request";
import {
  AdminButton,
  Callout,
  PageHeader,
  Panel,
  SegmentedTabs,
  Stack,
} from "../ui/primitives";
import { AttentionList } from "./attention-list";
import type { RenewalLinkKind } from "./cohort-transition-guide";
import { CohortsPanel } from "./cohorts-panel";
import {
  ActiveOnlineGroupCard,
  OnlineGroupInviteLinksCard,
  RenewalCampaignsCard,
  RenewalGeneratorCard,
} from "./online-group-workspace";

type Section = "cohorts" | "stream" | "renewals" | "manual";

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
          onSetDurationWeeks={cohorts.setDurationWeeks}
          onSetPreviousChatRemoval={cohorts.setPreviousChatRemoval}
          onUnauthorized={onUnauthorized}
          retryingId={cohorts.retryingId}
        />
      )}

      {section === "stream" && (
        <Stack $gap={12}>
          <Callout tone="info" icon={<Info aria-hidden />}>
            Переход на следующий поток делается во вкладке «Потоки» по шагам: ссылки
            продления, пост, закрытие. Здесь ничего менять не нужно — закрытие само
            сделает следующий поток текущим.
          </Callout>
          {settings.activeCampaign && (
            <Callout tone="info" icon={<Info aria-hidden />}>
              Plus подключает Inspiration Hub: {settings.inspirationChatTitle}. Чат хаба и
              его состояние — во вкладке{" "}
              <AdminButton
                size="sm"
                variant="ghost"
                onClick={() => onNavigate("inspiration-hub")}
              >
                Inspiration Hub
              </AdminButton>
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
            onSubmit={submit(settings.saveSettings)}
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
