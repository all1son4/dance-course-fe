import { Pencil, X } from "lucide-react";
import type { FormEvent } from "react";
import styled from "styled-components";

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
import { CopyField } from "../ui/copy";
import {
  Checkbox,
  Fact,
  FactGrid,
  Field,
  FormActions,
  FormGrid,
  Input,
  Select,
  StatusLine,
  Switch,
} from "../ui/forms";
import {
  AdminButton,
  Badge,
  EmptyState,
  Muted,
  Panel,
  Row,
  Skeleton,
  Stack,
} from "../ui/primitives";

const Form = styled.form`
  display: grid;
  gap: 16px;
`;

const List = styled.ul`
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;

  > li {
    display: grid;
    gap: 8px;
    padding: 14px 0;
    border-top: 1px solid var(--a-border);
  }

  > li:first-child {
    padding-top: 0;
    border-top: 0;
  }

  > li:last-child {
    padding-bottom: 0;
  }
`;

const ItemHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;

  strong {
    min-width: 0;
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  > :last-child:not(strong) {
    margin-left: auto;
  }
`;

const Meta = styled.p`
  margin: 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
  overflow-wrap: anywhere;
`;

const AccessRow = styled.div`
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--a-radius-sm);
  background: var(--a-surface-sunken);
`;

const ChatChoices = styled.div`
  display: grid;
  gap: 2px;
  max-height: 232px;
  overflow-y: auto;
  padding: 6px 10px;
  border: 1px solid var(--a-border-strong);
  border-radius: var(--a-radius-sm);

  > label {
    padding: 6px 0;
  }
`;

const tariffLabel = (offerId: string) =>
  offerId === ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID ? "Plus" : "Standard";

/* ---------- Current cohort settings ---------- */

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
  onStartsAtChange,
  onSubmit,
  onTitleChange,
  startsAt,
  status,
  telegramChatOptions,
  title,
}: ActiveOnlineGroupCardProps) => (
  <Panel
    title="Текущий поток"
    description="Поток, который сейчас продаётся: его чат, дата старта и название."
    actions={
      activeCampaign && (
        <AdminButton
          size="sm"
          icon={isFormOpen ? <X aria-hidden /> : <Pencil aria-hidden />}
          onClick={onFormToggle}
        >
          {isFormOpen ? "Отменить" : "Изменить"}
        </AdminButton>
      )
    }
  >
    <Stack $gap={16}>
      {isLoading && !activeCampaign ? (
        <Skeleton $height={64} />
      ) : activeCampaign ? (
        <FactGrid>
          <Fact label="Поток" value={activeCampaign.title} />
          <Fact label="Старт" value={formatDateTime(activeCampaign.startsAt)} />
          <Fact label="Основной чат" value={activeMainChatTitle} />
          <Fact label="Inspiration Hub" value={inspirationChatTitle} />
        </FactGrid>
      ) : (
        <Muted>Поток ещё не настроен — заполни форму ниже.</Muted>
      )}

      {(isFormOpen || !activeCampaign) && (
        <Form onSubmit={onSubmit}>
          <FormGrid>
            <Field label="Основной чат потока" htmlFor="og-main-chat">
              <Select
                id="og-main-chat"
                value={mainChatId}
                disabled={isLoading}
                onChange={(event) => onMainChatChange(event.target.value)}
              >
                <option value="" disabled>
                  Выбери чат потока
                </option>
                {telegramChatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Чат Inspiration Hub"
              htmlFor="og-hub-chat"
              hint={
                activeCampaign ? "Меняется только во вкладке Inspiration Hub." : undefined
              }
            >
              <Select
                id="og-hub-chat"
                value={libraryChatId}
                disabled={isLoading || Boolean(activeCampaign)}
                onChange={(event) => onLibraryChatChange(event.target.value)}
              >
                <option value="" disabled>
                  Выбери чат хаба
                </option>
                {telegramChatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Дата и время старта" htmlFor="og-starts-at" hint="По Варшаве.">
              <Input
                id="og-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => onStartsAtChange(event.target.value)}
              />
            </Field>
            <Field label="Название потока" htmlFor="og-title">
              <Input
                id="og-title"
                value={title}
                placeholder="Например: Online Group 3.0"
                onChange={(event) => onTitleChange(event.target.value)}
              />
            </Field>
          </FormGrid>
          <FormActions>
            <AdminButton
              type="submit"
              variant="primary"
              disabled={isSaveDisabled}
              loading={isSaving}
            >
              {activeCampaign ? "Сохранить изменения" : "Сохранить и открыть поток"}
            </AdminButton>
          </FormActions>
        </Form>
      )}
      <StatusLine status={status} />
    </Stack>
  </Panel>
);

/* ---------- Manual access ---------- */

type OnlineGroupInviteLinksCardProps = {
  accessMode: OnlineGroupAdminAccessMode;
  adminLabel: string;
  grants: OnlineGroupAdminGrant[];
  isDisabled: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  onAccessModeChange: (value: OnlineGroupAdminAccessMode) => void;
  onAdminLabelChange: (value: string) => void;
  onRefresh: () => void | Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  status: StatusMessage;
};

export const OnlineGroupInviteLinksCard = ({
  accessMode,
  adminLabel,
  grants,
  isDisabled,
  isGenerating,
  isLoading,
  onAccessModeChange,
  onAdminLabelChange,
  onSubmit,
  status,
}: OnlineGroupInviteLinksCardProps) => (
  <Stack $gap={16}>
    <Panel
      title="Выдать доступ вручную"
      description="Подарок или доступ без оплаты. Standard — основной чат, Plus — основной чат и Inspiration Hub."
    >
      <Form onSubmit={onSubmit}>
        <FormGrid>
          <Field label="Тариф" htmlFor="og-grant-mode">
            <Select
              id="og-grant-mode"
              value={accessMode}
              disabled={isLoading}
              onChange={(event) =>
                onAccessModeChange(event.target.value as OnlineGroupAdminAccessMode)
              }
            >
              <option value="standard">Standard — основной чат</option>
              <option value="plus">Plus — основной чат и хаб</option>
            </Select>
          </Field>
          <Field
            label="Для кого"
            htmlFor="og-grant-label"
            hint="Видно только в админке, чтобы потом найти выдачу."
          >
            <Input
              id="og-grant-label"
              value={adminLabel}
              placeholder="Например: Аня, подарок"
              disabled={isLoading}
              onChange={(event) => onAdminLabelChange(event.target.value)}
            />
          </Field>
        </FormGrid>
        <FormActions>
          <AdminButton
            type="submit"
            variant="primary"
            disabled={isDisabled}
            loading={isGenerating}
          >
            Создать ссылки доступа
          </AdminButton>
        </FormActions>
        <StatusLine status={status} />
      </Form>
    </Panel>

    <Panel title="Журнал выдач" description="Последние ручные доступы и их ссылки.">
      {isLoading && grants.length === 0 ? (
        <Stack $gap={10}>
          <Skeleton $height={72} />
          <Skeleton $height={72} />
        </Stack>
      ) : grants.length === 0 ? (
        <EmptyState title="Ручных выдач пока нет" />
      ) : (
        <List>
          {grants.map((grant) => (
            <li key={grant.paymentIntentId}>
              <ItemHead>
                <strong>{grant.adminLabel}</strong>
                <Badge $tone={grant.accessMode === "plus" ? "accent" : "neutral"}>
                  {grant.accessMode === "plus" ? "Plus" : "Standard"}
                </Badge>
                <Muted>{formatDateTime(grant.createdAtIso)}</Muted>
              </ItemHead>
              {grant.accesses.length === 0 ? (
                <Meta>Ссылки для этой выдачи не созданы.</Meta>
              ) : (
                grant.accesses.map((access) => (
                  <AccessRow key={`${access.accessKey}-${access.chatId}`}>
                    <ItemHead>
                      <strong>{resolveOnlineGroupAccessTitle(access.accessKey)}</strong>
                      <Badge
                        $tone={
                          access.state === "issued"
                            ? "success"
                            : access.state === "failed"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {resolveOnlineGroupAccessStateLabel(access.state)}
                      </Badge>
                    </ItemHead>
                    <Meta>
                      {access.chatTitle || access.chatId || "Чат не определён"}
                      {access.tokenExpiresAt
                        ? ` · ссылка до ${formatDateTime(access.tokenExpiresAt)}`
                        : ""}
                      {access.accessExpiresAt
                        ? ` · доступ до ${formatDateTime(access.accessExpiresAt)}`
                        : ""}
                    </Meta>
                    {access.accessUrl && (
                      <CopyField label="Ссылка доступа" value={access.accessUrl} />
                    )}
                  </AccessRow>
                ))
              )}
            </li>
          ))}
        </List>
      )}
    </Panel>
  </Stack>
);

/* ---------- Renewal links ---------- */

type RenewalGeneratorCardProps = {
  chats: TelegramChatOption[];
  generatedLink: string;
  isDisabled: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  offerId: string;
  offerOptions: SelectOption[];
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
  generatedLink,
  isDisabled,
  isGenerating,
  isLoading,
  offerId,
  offerOptions,
  onOfferChange,
  onRegenerate,
  onSourceChatToggle,
  onSubmit,
  onTitleChange,
  sourceChatIds,
  status,
  title,
}: RenewalGeneratorCardProps) => (
  <Panel
    title="Создать ссылку продления"
    description="Цена продления для тех, кто состоит в выбранных чатах. Сайт проверит членство в Telegram при оплате."
  >
    <Form onSubmit={onSubmit}>
      <Field label="Кто сможет оплатить — люди из этих чатов">
        {chats.length === 0 ? (
          <Muted>Доступных чатов пока нет.</Muted>
        ) : (
          <ChatChoices>
            {chats.map((chat) => (
              <Checkbox
                key={chat.chatId}
                checked={sourceChatIds.includes(chat.chatId)}
                disabled={isLoading}
                label={chat.title}
                onChange={(checked) => onSourceChatToggle(chat.chatId, checked)}
              />
            ))}
          </ChatChoices>
        )}
      </Field>
      <FormGrid>
        <Field label="Тариф" htmlFor="renewal-offer">
          <Select
            id="renewal-offer"
            value={offerId}
            disabled={isLoading}
            onChange={(event) => onOfferChange(event.target.value)}
          >
            <option value="" disabled>
              Выбери тариф
            </option>
            {offerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Название для админки" htmlFor="renewal-title">
          <Input
            id="renewal-title"
            value={title}
            placeholder="Например: поток 2 → поток 3"
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </Field>
      </FormGrid>
      <FormActions>
        <AdminButton
          type="submit"
          variant="primary"
          disabled={isDisabled}
          loading={isGenerating}
        >
          Создать или показать
        </AdminButton>
        <AdminButton disabled={isDisabled || isGenerating} onClick={onRegenerate}>
          Заменить ссылку новой
        </AdminButton>
      </FormActions>
      <StatusLine status={status} />
      {generatedLink && <CopyField label="Ссылка продления" value={generatedLink} />}
    </Form>
  </Panel>
);

type RenewalCampaignsCardProps = {
  campaigns: RenewalCampaignEntry[];
  onToggleStatus: (slug: string, active: boolean) => void | Promise<void>;
  updatingSlug: string;
};

export const RenewalCampaignsCard = ({
  campaigns,
  onToggleStatus,
  updatingSlug,
}: RenewalCampaignsCardProps) => (
  <Panel
    title="Ссылки продления"
    description="Выключенная ссылка перестаёт открывать оплату, включить её можно в любой момент."
  >
    {campaigns.length === 0 ? (
      <EmptyState title="Ссылок продления пока нет" />
    ) : (
      <List>
        {campaigns.map((campaign) => {
          const isActive = campaign.status === "active";
          return (
            <li key={campaign.slug}>
              <ItemHead>
                <strong>{campaign.title}</strong>
                <Badge
                  $tone={tariffLabel(campaign.offerId) === "Plus" ? "accent" : "neutral"}
                >
                  {tariffLabel(campaign.offerId)}
                </Badge>
                <Row $gap={8} $wrap={false}>
                  <Muted>{isActive ? "Включена" : "Выключена"}</Muted>
                  <Switch
                    checked={isActive}
                    disabled={Boolean(updatingSlug)}
                    label={`${isActive ? "Выключить" : "Включить"} ссылку ${campaign.title}`}
                    onChange={(checked) => void onToggleStatus(campaign.slug, checked)}
                  />
                </Row>
              </ItemHead>
              <Meta>
                Для чатов: {campaign.sourceChatTitles.join(", ")} · создана{" "}
                {formatDateTime(campaign.createdAt)}
              </Meta>
              {isActive && (
                <CopyField label="Ссылка продления" value={campaign.checkoutUrl} />
              )}
            </li>
          );
        })}
      </List>
    )}
  </Panel>
);
