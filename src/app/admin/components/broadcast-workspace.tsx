import { Ban, Check, LoaderCircle, MailX, RefreshCw, X } from "lucide-react";

import Button from "@/components/common/Button";

import type {
  BroadcastAudienceLead,
  BroadcastExclusionScope,
  BroadcastStats,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime } from "../lib/admin.utils";
import {
  BroadcastActionButton,
  BroadcastActionGroup,
  BroadcastAudienceEmail,
  BroadcastAudienceName,
  BroadcastAudienceTable,
  BroadcastAudienceTableWrap,
  BroadcastAudienceWorkspace as BroadcastWorkspaceLayout,
  BroadcastStatusBadge,
  ButtonRow,
  Form,
  IconActionButton,
  JournalEmptyState,
  JournalSkeletonCard,
  JournalSkeletonList,
  SkeletonLine,
  StatusText,
  SummaryGrid,
  SummaryItem,
  SummaryLabel,
  SummaryValue,
  SurfaceCard,
  SurfaceDescription,
  SurfaceHeaderRow,
  SurfaceTitle,
} from "../page.styles";

type BroadcastWorkspaceProps = {
  audience: BroadcastAudienceLead[];
  confirmingGlobalLeadId: string;
  isDisabled: boolean;
  isLoadingStats: boolean;
  isSending: boolean;
  isUpdatingLeadId: string;
  onExclude: (
    lead: BroadcastAudienceLead,
    scope: BroadcastExclusionScope,
  ) => void | Promise<void>;
  onGlobalExcludeCancel: () => void;
  onGlobalExcludeRequest: (leadId: string) => void;
  onRefresh: () => void | Promise<void>;
  onSend: () => void | Promise<void>;
  pendingCount: number;
  stats: BroadcastStats | null;
  status: StatusMessage;
};

export const BroadcastWorkspace = ({
  audience,
  confirmingGlobalLeadId,
  isDisabled,
  isLoadingStats,
  isSending,
  isUpdatingLeadId,
  onExclude,
  onGlobalExcludeCancel,
  onGlobalExcludeRequest,
  onRefresh,
  onSend,
  pendingCount,
  stats,
  status,
}: BroadcastWorkspaceProps) => (
  <BroadcastWorkspaceLayout>
    <SurfaceCard>
      <SurfaceHeaderRow>
        <SurfaceTitle>First Touch: старт продаж</SurfaceTitle>
        <IconActionButton
          type="button"
          onClick={onRefresh}
          disabled={isLoadingStats}
          $isLoading={isLoadingStats}
          aria-label="Обновить данные рассылки"
          title="Обновить данные рассылки"
        >
          {isLoadingStats ? <LoaderCircle aria-hidden /> : <RefreshCw aria-hidden />}
        </IconActionButton>
      </SurfaceHeaderRow>
      <SurfaceDescription>Уже отправленные адреса не затрагиваются.</SurfaceDescription>
      <Form as="div">
        <SummaryGrid>
          <SummaryItem>
            <SummaryLabel>Всего заявок</SummaryLabel>
            <SummaryValue>{stats?.total ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>Ожидают</SummaryLabel>
            <SummaryValue>{stats?.pending ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>С ошибкой</SummaryLabel>
            <SummaryValue>{stats?.failed ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>Отправлено</SummaryLabel>
            <SummaryValue>{stats?.sent ?? 0}</SummaryValue>
          </SummaryItem>
          <SummaryItem>
            <SummaryLabel>Исключено</SummaryLabel>
            <SummaryValue>{stats?.excluded ?? 0}</SummaryValue>
          </SummaryItem>
        </SummaryGrid>
        <ButtonRow>
          <Button
            buttonText={
              isSending
                ? "Отправляю..."
                : isLoadingStats
                  ? "Загружаю данные..."
                  : pendingCount === 0
                    ? "Нет адресов для отправки"
                    : "Отправить рассылку"
            }
            type="button"
            onClick={onSend}
            disabled={isDisabled}
            isLoading={isSending}
            width="100%"
          />
        </ButtonRow>
        {status && <StatusText $tone={status.tone}>{status.text}</StatusText>}
      </Form>
    </SurfaceCard>

    <SurfaceCard>
      <SurfaceTitle>Ожидают отправки</SurfaceTitle>
      <SurfaceDescription>
        Здесь только те, кому письмо еще не отправлено.
      </SurfaceDescription>

      {isLoadingStats && audience.length === 0 ? (
        <JournalSkeletonList>
          {Array.from({ length: 3 }, (_, index) => (
            <JournalSkeletonCard key={`broadcast-audience-skeleton-${index}`}>
              <SkeletonLine $width="42%" />
              <SkeletonLine $width="68%" />
              <SkeletonLine $height="32px" $width="100%" />
            </JournalSkeletonCard>
          ))}
        </JournalSkeletonList>
      ) : audience.length === 0 ? (
        <JournalEmptyState>Все готово — ожидающих отправки нет.</JournalEmptyState>
      ) : (
        <BroadcastAudienceTableWrap>
          <BroadcastAudienceTable aria-label="Пользователи, ожидающие рассылки">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Контакт</th>
                <th>Язык</th>
                <th>Заявка</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {audience.map((lead) => {
                const isUpdating = isUpdatingLeadId === lead.leadId;
                const isConfirmingGlobal = confirmingGlobalLeadId === lead.leadId;

                return (
                  <tr key={lead.leadId}>
                    <td data-label="Участник">
                      <span>
                        <BroadcastAudienceName>
                          {lead.fullName || "Без имени"}
                        </BroadcastAudienceName>
                        <BroadcastAudienceEmail>{lead.email}</BroadcastAudienceEmail>
                      </span>
                    </td>
                    <td data-label="Контакт">{lead.socialContact || "—"}</td>
                    <td data-label="Язык">{lead.locale.toUpperCase() || "—"}</td>
                    <td data-label="Заявка">{formatDateTime(lead.createdAt)}</td>
                    <td data-label="Статус">
                      <BroadcastStatusBadge $status={lead.status}>
                        {lead.status === "failed" ? "Ошибка — повторим" : "Ожидает"}
                      </BroadcastStatusBadge>
                    </td>
                    <td data-label="Действия">
                      <BroadcastActionGroup>
                        {isConfirmingGlobal ? (
                          <>
                            <BroadcastActionButton
                              type="button"
                              $danger
                              onClick={() => onExclude(lead, "global")}
                              disabled={isSending || Boolean(isUpdatingLeadId)}
                              title="Подтвердить исключение из будущих рассылок"
                            >
                              <Check aria-hidden />
                              {isUpdating ? "Сохраняю..." : "Подтвердить"}
                            </BroadcastActionButton>
                            <BroadcastActionButton
                              type="button"
                              onClick={onGlobalExcludeCancel}
                              disabled={Boolean(isUpdatingLeadId)}
                            >
                              <X aria-hidden />
                              Отмена
                            </BroadcastActionButton>
                          </>
                        ) : (
                          <>
                            <BroadcastActionButton
                              type="button"
                              onClick={() => onExclude(lead, "campaign")}
                              disabled={isSending || Boolean(isUpdatingLeadId)}
                              title="Не отправлять письмо в этой рассылке"
                            >
                              <MailX aria-hidden />
                              {isUpdating ? "Сохраняю..." : "Не отправлять"}
                            </BroadcastActionButton>
                            <BroadcastActionButton
                              type="button"
                              $danger
                              onClick={() => onGlobalExcludeRequest(lead.leadId)}
                              disabled={isSending || Boolean(isUpdatingLeadId)}
                              title="Не включать этот email в будущие рассылки"
                            >
                              <Ban aria-hidden />
                              Исключить везде
                            </BroadcastActionButton>
                          </>
                        )}
                      </BroadcastActionGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </BroadcastAudienceTable>
        </BroadcastAudienceTableWrap>
      )}
    </SurfaceCard>
  </BroadcastWorkspaceLayout>
);
