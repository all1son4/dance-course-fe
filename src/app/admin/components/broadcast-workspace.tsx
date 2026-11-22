import { Ban, Check, MailCheck, MailX, RefreshCw, Send, X } from "lucide-react";
import { useState } from "react";

import type {
  BroadcastAudienceLead,
  BroadcastExclusionScope,
  BroadcastStats,
  StatusMessage,
} from "../lib/admin.types";
import { formatDateTime, plural } from "../lib/admin.utils";
import {
  AudienceActions,
  AudienceFacts,
  AudienceTable,
} from "../styles/broadcast.styles";
import { ConfirmDialog } from "../ui/feedback";
import { Fact, FormActions, StatusLine } from "../ui/forms";
import { AdminButton, Badge, EmptyState, Panel, Skeleton, Stack } from "../ui/primitives";
import { CellPrimary, CellSecondary, TableScroller } from "../ui/table";
import { useShownRows } from "./shown-rows";

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
}: BroadcastWorkspaceProps) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const shownAudience = useShownRows(audience);

  const confirmSend = async () => {
    try {
      await onSend();
    } finally {
      setIsConfirmOpen(false);
    }
  };

  return (
    <Stack $gap={16}>
      <Panel
        title="First Touch: старт продаж"
        description="Уже отправленные адреса не затрагиваются."
        actions={
          <AdminButton
            size="sm"
            icon={<RefreshCw aria-hidden />}
            loading={isLoadingStats}
            onClick={() => void onRefresh()}
          >
            Обновить
          </AdminButton>
        }
      >
        <Stack $gap={14}>
          <AudienceFacts>
            <Fact label="Всего заявок" value={stats?.total ?? 0} />
            <Fact label="Ожидают" value={stats?.pending ?? 0} />
            <Fact label="Отправлено" value={stats?.sent ?? 0} />
            <Fact label="Исключено" value={stats?.excluded ?? 0} />
            {(stats?.failed ?? 0) > 0 && (
              <Fact label="С ошибкой, отправим снова" value={stats?.failed ?? 0} />
            )}
          </AudienceFacts>
        </Stack>
      </Panel>

      <Panel
        title="Ожидают отправки"
        description="Здесь только те, кому письмо ещё не отправлено."
      >
        <Stack $gap={14}>
          <FormActions>
            <AdminButton
              variant="primary"
              icon={<Send aria-hidden />}
              loading={isSending}
              disabled={isDisabled}
              onClick={() => setIsConfirmOpen(true)}
            >
              {isSending
                ? "Отправляю…"
                : isLoadingStats
                  ? "Загружаю данные…"
                  : pendingCount === 0
                    ? "Нет адресов для отправки"
                    : "Отправить рассылку"}
            </AdminButton>
          </FormActions>
          <StatusLine status={status} />
          {isLoadingStats && audience.length === 0 ? (
            <Stack $gap={10}>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={`broadcast-audience-skeleton-${index}`} $height={44} />
              ))}
            </Stack>
          ) : audience.length === 0 ? (
            <EmptyState
              icon={<MailCheck aria-hidden />}
              title="Всё готово"
              text="Ожидающих отправки нет."
            />
          ) : (
            <TableScroller>
              <AudienceTable aria-label="Пользователи, ожидающие рассылки">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Контакт</th>
                    <th>Язык</th>
                    <th>Заявка</th>
                    <th>Статус</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {shownAudience.rows.map((lead) => {
                    const isUpdating = isUpdatingLeadId === lead.leadId;
                    const isConfirmingGlobal = confirmingGlobalLeadId === lead.leadId;
                    const isLocked = isSending || Boolean(isUpdatingLeadId);

                    return (
                      <tr key={lead.leadId}>
                        <td data-label="Имя">
                          <span>
                            <CellPrimary>{lead.fullName || "Без имени"}</CellPrimary>
                            <CellSecondary>{lead.email}</CellSecondary>
                          </span>
                        </td>
                        <td data-label="Контакт">{lead.socialContact || "—"}</td>
                        <td data-label="Язык">{lead.locale.toUpperCase() || "—"}</td>
                        <td data-label="Заявка">{formatDateTime(lead.createdAt)}</td>
                        <td data-label="Статус">
                          <Badge $tone={lead.status === "failed" ? "danger" : "info"}>
                            {lead.status === "failed"
                              ? "Не дошло — уйдёт при следующей отправке"
                              : "Ожидает"}
                          </Badge>
                        </td>
                        <td data-label="Действия" data-actions>
                          <AudienceActions>
                            {isConfirmingGlobal ? (
                              <>
                                <AdminButton
                                  size="sm"
                                  variant="danger"
                                  icon={<Check aria-hidden />}
                                  loading={isUpdating}
                                  disabled={isLocked}
                                  onClick={() => void onExclude(lead, "global")}
                                  title="Подтвердить исключение из будущих рассылок"
                                >
                                  Подтвердить
                                </AdminButton>
                                <AdminButton
                                  size="sm"
                                  variant="ghost"
                                  icon={<X aria-hidden />}
                                  disabled={Boolean(isUpdatingLeadId)}
                                  onClick={onGlobalExcludeCancel}
                                >
                                  Отмена
                                </AdminButton>
                              </>
                            ) : (
                              <>
                                <AdminButton
                                  size="sm"
                                  icon={<MailX aria-hidden />}
                                  loading={isUpdating}
                                  disabled={isLocked}
                                  onClick={() => void onExclude(lead, "campaign")}
                                  title="Не отправлять письмо в этой рассылке"
                                >
                                  Не отправлять
                                </AdminButton>
                                <AdminButton
                                  size="sm"
                                  variant="ghost"
                                  icon={<Ban aria-hidden />}
                                  disabled={isLocked}
                                  onClick={() => onGlobalExcludeRequest(lead.leadId)}
                                  title="Не включать этот email в будущие рассылки"
                                >
                                  Исключить везде
                                </AdminButton>
                              </>
                            )}
                          </AudienceActions>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </AudienceTable>
            </TableScroller>
          )}
          {shownAudience.toggle}
        </Stack>
      </Panel>

      <ConfirmDialog
        open={isConfirmOpen}
        title="Отправить рассылку First Touch?"
        description={`Письмо о старте продаж уйдёт на ${pendingCount} ${plural(pendingCount, "адрес", "адреса", "адресов")}: ожидающим и тем, у кого прошлая попытка не удалась. Уже отправленные адреса не затрагиваются.`}
        confirmLabel="Отправить"
        busy={isSending}
        confirmDisabled={isDisabled && !isSending}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={() => void confirmSend()}
      />
    </Stack>
  );
};
