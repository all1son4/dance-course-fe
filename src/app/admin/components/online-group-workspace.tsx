import { LoaderCircle, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";

import Button from "@/components/common/Button";
import Checkbox from "@/components/common/Checkbox";
import Input from "@/components/common/Input";
import ToggleSwitch from "@/components/common/ToggleSwitch";
import { ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID } from "@/constants/sellable-products";

import type {
  OnlineGroupAdminAccessMode,
  OnlineGroupAdminGrant,
  OnlineGroupCampaignEntry,
  RenewalCampaignEntry,
  SelectOption,
  StatusMessage,
  TelegramChatOption,
} from "../lib/admin.types";
import {
  formatDateTime,
  resolveOnlineGroupAccessStateLabel,
  resolveOnlineGroupAccessTitle,
} from "../lib/admin.utils";
import {
  ButtonRow,
  CheckboxList,
  Form,
  FormControl,
  FormGrid,
  IconActionButton,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
  LinkStateBadge,
  PolicyLabel,
  RecentLinkCard,
  RecentLinkHeader,
  RecentLinkMeta,
  RecentLinksList,
  RenewalLinkControls,
  RenewalLinksList,
  SectionHeading,
  SkeletonLine,
  StatusText,
  SummaryGrid,
  SummaryItem,
  SummaryLabel,
  SummaryValue,
  SurfaceCard,
  SurfaceDescription,
  SurfaceHeaderActions,
  SurfaceHeaderRow,
  SurfaceTitle,
} from "../page.styles";
import { CopyableLink } from "./copyable-link";

type ActiveOnlineGroupCardProps = {
  activeCampaign: OnlineGroupCampaignEntry | undefined;
  activeMainChatTitle: string;
  inspirationChatTitle: string;
  isFormOpen: boolean;
  isLoading: boolean;
  isSaveDisabled: boolean;
  isSaving: boolean;
  libraryChatId: string;
  mainChatId: string;
  onFormToggle: () => void;
  onLibraryChatChange: (value: string) => void;
  onMainChatChange: (value: string) => void;
  onRefresh: () => void | Promise<void>;
  onStartsAtChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTitleChange: (value: string) => void;
  startsAt: string;
  status: StatusMessage;
  telegramChatOptions: SelectOption[];
  title: string;
};

export const ActiveOnlineGroupCard = ({
  activeCampaign,
  activeMainChatTitle,
  inspirationChatTitle,
  isFormOpen,
  isLoading,
  isSaveDisabled,
  isSaving,
  libraryChatId,
  mainChatId,
  onFormToggle,
  onLibraryChatChange,
  onMainChatChange,
  onRefresh,
  onStartsAtChange,
  onSubmit,
  onTitleChange,
  startsAt,
  status,
  telegramChatOptions,
  title,
}: ActiveOnlineGroupCardProps) => (
  <SurfaceCard $wide>
    <SurfaceHeaderRow>
      <SurfaceTitle>Активный поток</SurfaceTitle>
      <SurfaceHeaderActions>
        {activeCampaign && (
          <Button
            buttonText={isFormOpen ? "Скрыть форму" : "Изменить"}
            type="button"
            onClick={onFormToggle}
            size="sm"
            variant="secondary"
            width="auto"
          />
        )}
        <IconActionButton
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          $isLoading={isLoading}
          aria-label="Обновить Online Group"
          title="Обновить Online Group"
        >
          {isLoading ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
        </IconActionButton>
      </SurfaceHeaderActions>
    </SurfaceHeaderRow>
    {activeCampaign ? (
      <SummaryGrid>
        <SummaryItem>
          <SummaryLabel>Поток</SummaryLabel>
          <SummaryValue>{activeCampaign.title}</SummaryValue>
        </SummaryItem>
        <SummaryItem>
          <SummaryLabel>Старт потока</SummaryLabel>
          <SummaryValue>{formatDateTime(activeCampaign.startsAt)}</SummaryValue>
        </SummaryItem>
        <SummaryItem>
          <SummaryLabel>Основной чат</SummaryLabel>
          <SummaryValue>{activeMainChatTitle}</SummaryValue>
        </SummaryItem>
        <SummaryItem>
          <SummaryLabel>Inspiration Hub</SummaryLabel>
          <SummaryValue>{inspirationChatTitle}</SummaryValue>
        </SummaryItem>
      </SummaryGrid>
    ) : (
      <StatusText $tone="info">Активный поток еще не настроен.</StatusText>
    )}
    {(isFormOpen || !activeCampaign) && (
      <Form onSubmit={onSubmit}>
        <FormGrid>
          <FormControl>
            <Input
              id="online-group-regular-chat"
              name="onlineGroupRegularChat"
              label="Основной чат потока"
              value={mainChatId}
              placeholder="Выбери новый чат Online Group"
              selectOptions={telegramChatOptions}
              onChange={(event) => onMainChatChange(event.target.value)}
              disabled={isLoading}
              width="100%"
            />
          </FormControl>
          <FormControl>
            <Input
              id="online-group-library-chat"
              name="onlineGroupLibraryChat"
              label="Постоянный Inspiration Hub"
              value={libraryChatId}
              placeholder="Выбери чат Inspiration Hub"
              selectOptions={telegramChatOptions}
              onChange={(event) => onLibraryChatChange(event.target.value)}
              disabled={isLoading || Boolean(activeCampaign)}
              width="100%"
            />
          </FormControl>
          <FormControl>
            <Input
              id="online-group-starts-at"
              name="onlineGroupStartsAt"
              label="Дата и время старта"
              value={startsAt}
              type="datetime-local"
              onChange={(event) => onStartsAtChange(event.target.value)}
              width="100%"
            />
          </FormControl>
          <FormControl>
            <Input
              id="online-group-title"
              name="onlineGroupTitle"
              label="Название потока"
              value={title}
              placeholder="Например: Online Group — август"
              onChange={(event) => onTitleChange(event.target.value)}
              width="100%"
            />
          </FormControl>
        </FormGrid>
        <ButtonRow>
          <Button
            buttonText={isSaving ? "Сохраняю..." : "Сохранить и активировать поток"}
            type="submit"
            disabled={isSaveDisabled}
            isLoading={isSaving}
            width="100%"
          />
        </ButtonRow>
      </Form>
    )}
    {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
  </SurfaceCard>
);

type OnlineGroupInviteLinksCardProps = {
  accessMode: OnlineGroupAdminAccessMode;
  adminLabel: string;
  copyingUrl: string;
  grants: OnlineGroupAdminGrant[];
  isDisabled: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  onAccessModeChange: (value: OnlineGroupAdminAccessMode) => void;
  onAdminLabelChange: (value: string) => void;
  onCopy: (link: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  status: StatusMessage;
};

export const OnlineGroupInviteLinksCard = ({
  accessMode,
  adminLabel,
  copyingUrl,
  grants,
  isDisabled,
  isGenerating,
  isLoading,
  onAccessModeChange,
  onAdminLabelChange,
  onCopy,
  onRefresh,
  onSubmit,
  status,
}: OnlineGroupInviteLinksCardProps) => (
  <SurfaceCard $wide>
    <SurfaceHeaderRow>
      <SurfaceTitle>Выдать доступ вручную</SurfaceTitle>
      <IconActionButton
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        $isLoading={isLoading}
        aria-label="Обновить журнал ручных доступов"
        title="Обновить журнал ручных доступов"
      >
        {isLoading ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
      </IconActionButton>
    </SurfaceHeaderRow>
    <SurfaceDescription>
      Standard — основной чат. Plus — основной чат и Inspiration Hub.
    </SurfaceDescription>

    <Form onSubmit={onSubmit}>
      <FormGrid>
        <FormControl>
          <Input
            id="online-group-admin-access-mode"
            name="onlineGroupAdminAccessMode"
            label="Тариф доступа"
            value={accessMode}
            selectOptions={[
              { label: "Standard — только основной чат", value: "standard" },
              { label: "Plus — основной чат + Hub", value: "plus" },
            ]}
            onChange={(event) =>
              onAccessModeChange(event.target.value as OnlineGroupAdminAccessMode)
            }
            disabled={isLoading}
            width="100%"
          />
        </FormControl>
        <FormControl>
          <Input
            id="online-group-admin-label"
            name="onlineGroupAdminLabel"
            label="Идентификатор"
            value={adminLabel}
            placeholder="Например: Аня / подарок / спец-доступ"
            onChange={(event) => onAdminLabelChange(event.target.value)}
            disabled={isLoading}
            width="100%"
          />
        </FormControl>
      </FormGrid>
      <ButtonRow>
        <Button
          buttonText={isGenerating ? "Генерирую..." : "Создать ссылки доступа"}
          type="submit"
          disabled={isDisabled}
          isLoading={isGenerating}
          width="100%"
        />
      </ButtonRow>
      {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
    </Form>

    <SectionHeading>Журнал выдач</SectionHeading>
    {isLoading && grants.length === 0 ? (
      <JournalSkeletonList>
        {Array.from({ length: 2 }, (_, index) => (
          <JournalSkeletonCard key={`online-group-grant-skeleton-${index}`}>
            <SkeletonLine $width="58%" />
            <SkeletonLine $width="36%" />
            <SkeletonLine $width="100%" $height="36px" />
          </JournalSkeletonCard>
        ))}
      </JournalSkeletonList>
    ) : grants.length === 0 ? (
      <JournalEmptyState>Ручных выдач для Online Group пока нет.</JournalEmptyState>
    ) : (
      <RecentLinksList>
        {grants.map((grant) => (
          <RecentLinkCard key={grant.paymentIntentId}>
            <RecentLinkHeader>
              <RecentLinkMeta>{grant.adminLabel}</RecentLinkMeta>
              <LinkStateBadge $state="active">
                {grant.accessMode === "plus" ? "Plus" : "Standard"}
              </LinkStateBadge>
            </RecentLinkHeader>
            <RecentLinkMeta>Создано: {formatDateTime(grant.createdAtIso)}</RecentLinkMeta>

            {grant.accesses.length === 0 ? (
              <StatusText $tone="error">Ссылки для этой выдачи не созданы.</StatusText>
            ) : (
              grant.accesses.map((access) => (
                <RecentLinkCard
                  key={`${grant.paymentIntentId}-${access.accessKey}-${access.chatId}`}
                >
                  <RecentLinkHeader>
                    <RecentLinkMeta>
                      {resolveOnlineGroupAccessTitle(access.accessKey)}
                    </RecentLinkMeta>
                    <LinkStateBadge
                      $state={access.state === "issued" ? "active" : "used"}
                    >
                      {resolveOnlineGroupAccessStateLabel(access.state)}
                    </LinkStateBadge>
                  </RecentLinkHeader>
                  <RecentLinkMeta>
                    Чат: {access.chatTitle || access.chatId || "не определён"}
                  </RecentLinkMeta>
                  <RecentLinkMeta>
                    Токен до:{" "}
                    {access.tokenExpiresAt
                      ? formatDateTime(access.tokenExpiresAt)
                      : "не определено"}
                    {access.accessExpiresAt
                      ? ` | Доступ до: ${formatDateTime(access.accessExpiresAt)}`
                      : ""}
                  </RecentLinkMeta>
                  {access.accessUrl ? (
                    <CopyableLink
                      isCopying={copyingUrl === access.accessUrl}
                      link={access.accessUrl}
                      onCopy={onCopy}
                    />
                  ) : (
                    <StatusText $tone={access.state === "failed" ? "error" : "info"}>
                      Активной ссылки для копирования нет.
                    </StatusText>
                  )}
                </RecentLinkCard>
              ))
            )}
          </RecentLinkCard>
        ))}
      </RecentLinksList>
    )}
  </SurfaceCard>
);

type RenewalGeneratorCardProps = {
  chats: TelegramChatOption[];
  copyingUrl: string;
  generatedLink: string;
  isDisabled: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  offerId: string;
  offerOptions: SelectOption[];
  onCopy: (link: string) => void | Promise<void>;
  onOfferChange: (value: string) => void;
  onRegenerate: () => void;
  onSourceChatToggle: (chatId: string, checked: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onTitleChange: (value: string) => void;
  sourceChatIds: string[];
  status: StatusMessage;
  title: string;
};

export const RenewalGeneratorCard = ({
  chats,
  copyingUrl,
  generatedLink,
  isDisabled,
  isGenerating,
  isLoading,
  offerId,
  offerOptions,
  onCopy,
  onOfferChange,
  onRegenerate,
  onSourceChatToggle,
  onSubmit,
  onTitleChange,
  sourceChatIds,
  status,
  title,
}: RenewalGeneratorCardProps) => (
  <SurfaceCard>
    <SurfaceTitle>Создать ссылку продления</SurfaceTitle>
    <Form onSubmit={onSubmit}>
      <FormControl>
        <PolicyLabel>Участники из этих чатов смогут оплатить</PolicyLabel>
        {chats.length === 0 ? (
          <StatusText $tone="info">Доступных чатов пока нет.</StatusText>
        ) : (
          <CheckboxList>
            {chats.map((chat) => (
              <Checkbox
                key={chat.chatId}
                checked={sourceChatIds.includes(chat.chatId)}
                disabled={isLoading}
                name={`renewal-source-${chat.chatId}`}
                onChange={(event) =>
                  onSourceChatToggle(chat.chatId, event.target.checked)
                }
                placeholder={`${chat.title} (${chat.chatId})`}
              />
            ))}
          </CheckboxList>
        )}
      </FormControl>
      <FormGrid>
        <FormControl>
          <Input
            id="renewal-offer"
            name="renewalOffer"
            label="Тариф"
            value={offerId}
            placeholder="Выбери тариф"
            selectOptions={offerOptions}
            onChange={(event) => onOfferChange(event.target.value)}
            disabled={isLoading}
            width="100%"
          />
        </FormControl>
        <FormControl>
          <Input
            id="renewal-title"
            name="renewalTitle"
            label="Название для админки"
            value={title}
            placeholder="Например: поток 1 → поток 2"
            onChange={(event) => onTitleChange(event.target.value)}
            width="100%"
          />
        </FormControl>
      </FormGrid>
      <FormGrid>
        <ButtonRow>
          <Button
            buttonText={isGenerating ? "Готовлю..." : "Создать или показать"}
            type="submit"
            disabled={isDisabled}
            isLoading={isGenerating}
            width="100%"
          />
        </ButtonRow>
        <ButtonRow>
          <Button
            buttonText={isGenerating ? "Заменяю..." : "Заменить ссылку новой"}
            type="button"
            onClick={onRegenerate}
            disabled={isDisabled}
            isLoading={isGenerating}
            variant="secondary"
            width="100%"
          />
        </ButtonRow>
      </FormGrid>
      {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
      {generatedLink && (
        <CopyableLink
          ariaLabel="Копировать ссылку продления"
          isCopying={copyingUrl === generatedLink}
          link={generatedLink}
          onCopy={onCopy}
          title="Копировать ссылку продления"
        />
      )}
    </Form>
  </SurfaceCard>
);

type RenewalCampaignsCardProps = {
  campaigns: RenewalCampaignEntry[];
  copyingUrl: string;
  onCopy: (link: string) => void | Promise<void>;
  onToggleStatus: (slug: string, active: boolean) => void | Promise<void>;
  updatingSlug: string;
};

export const RenewalCampaignsCard = ({
  campaigns,
  copyingUrl,
  onCopy,
  onToggleStatus,
  updatingSlug,
}: RenewalCampaignsCardProps) => (
  <SurfaceCard>
    <SurfaceTitle>Ссылки продления</SurfaceTitle>
    {campaigns.length === 0 ? (
      <JournalEmptyState>Ссылок пока нет.</JournalEmptyState>
    ) : (
      <RenewalLinksList>
        {campaigns.map((campaign) => {
          const isActive = campaign.status === "active";

          return (
            <RecentLinkCard key={campaign.slug}>
              <RecentLinkHeader>
                <RecentLinkMeta>{campaign.title}</RecentLinkMeta>
                <RenewalLinkControls>
                  <LinkStateBadge $state={isActive ? "active" : "used"}>
                    {campaign.offerId === ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID
                      ? "Plus"
                      : "Standard"}
                  </LinkStateBadge>
                  <ToggleSwitch
                    ariaLabel={`${isActive ? "Выключить" : "Включить"} ссылку ${campaign.title}`}
                    checked={isActive}
                    disabled={Boolean(updatingSlug)}
                    onChange={(checked) => void onToggleStatus(campaign.slug, checked)}
                  />
                </RenewalLinkControls>
              </RecentLinkHeader>
              <RecentLinkMeta>
                Проверяем: {campaign.sourceChatTitles.join(", ")}
              </RecentLinkMeta>
              <RecentLinkMeta>
                Создано: {formatDateTime(campaign.createdAt)}
              </RecentLinkMeta>
              <CopyableLink
                disabled={!isActive}
                isCopying={copyingUrl === campaign.checkoutUrl}
                link={campaign.checkoutUrl}
                onCopy={onCopy}
                title={isActive ? "Копировать ссылку" : "Сначала включи ссылку"}
              />
            </RecentLinkCard>
          );
        })}
      </RenewalLinksList>
    )}
  </SurfaceCard>
);
