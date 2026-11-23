import { Info, RefreshCw } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  createCohortTransitionActions,
  type useCohortsAdmin,
} from "../hooks/use-cohorts-admin";
import type { useOnlineGroupAdmin } from "../hooks/use-online-group-admin";
import { AdminButton, Callout, PageHeader, SegmentedTabs, Stack } from "../ui/primitives";
import { AccessInvitations } from "./access-invitations";
import { CohortsPanel } from "./cohorts-panel";
import {
  ActiveOnlineGroupCard,
  RenewalCampaignsCard,
  RenewalGeneratorCard,
} from "./online-group-workspace";

type Section = "cohorts" | "stream" | "renewals" | "manual";

type OnlineGroupTabProps = {
  cohorts: ReturnType<typeof useCohortsAdmin>;
  onProblemsChanged: () => void;
  onUnauthorized: () => void;
  settings: ReturnType<typeof useOnlineGroupAdmin>;
};

const submit = (action: () => unknown) => (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  void action();
};

/**
 * Everything about the teaching cohorts in one place: the cohorts themselves, then
 * the tools the operator reaches for less often. What needs fixing lives in the
 * overview's one list and on the cohort cards, never a third time here.
 */
export const OnlineGroupTab = ({
  cohorts,
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

  const { createNextCohort, createRenewalLink } = createCohortTransitionActions({
    cohorts,
    onUnauthorized,
    settings,
  });

  return (
    <Stack $gap={20}>
      <PageHeader
        title="Online Group"
        description="Потоки, продажи Standard и Plus, ссылки продления и приглашения."
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

      <SegmentedTabs<Section>
        label="Разделы Online Group"
        value={section}
        onChange={setSection}
        items={[
          { id: "cohorts", label: "Потоки" },
          { id: "stream", label: "Настройки потока" },
          { id: "renewals", label: "Продления" },
          { id: "manual", label: "Приглашения" },
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

      {section === "manual" && (
        <AccessInvitations scope="group" onUnauthorized={onUnauthorized} />
      )}
    </Stack>
  );
};
