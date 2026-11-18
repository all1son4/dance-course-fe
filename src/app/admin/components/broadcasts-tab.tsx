import { ArrowLeft, Mail, MailPlus } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { useCohortInviteAdmin } from "../hooks/use-cohort-invite-admin";
import { CampaignTiles } from "../styles/broadcast.styles";
import { AdminButton, Stack, StatTile } from "../ui/primitives";
import { BroadcastWorkspace } from "./broadcast-workspace";
import { CohortInviteBroadcast } from "./cohort-invite-broadcast";

type Campaign = "cohort-invite" | "first-touch";

const recipientsLabel = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "получатель"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "получателя"
        : "получателей";
  return `${count} ${word}`;
};

/**
 * «Рассылки»: a tile per campaign with its main number; a tile opens that
 * campaign, and «Все рассылки» leads back to the tiles.
 */
export const BroadcastsTab = ({
  firstTouch,
  isAuthorized,
  onUnauthorized,
}: {
  firstTouch: ComponentProps<typeof BroadcastWorkspace>;
  isAuthorized: boolean;
  onUnauthorized: () => void;
}) => {
  const [opened, setOpened] = useState<Campaign | null>(null);
  // Mounted only while the tab is open: every visit reads the audience again.
  const invite = useCohortInviteAdmin({ isActive: true, isAuthorized, onUnauthorized });
  const snapshot = invite.snapshot;
  const busy = invite.isSending || firstTouch.isSending;

  if (opened) {
    return (
      <Stack $gap={16}>
        <div>
          <AdminButton
            size="sm"
            variant="ghost"
            icon={<ArrowLeft aria-hidden />}
            disabled={busy}
            title={busy ? "Дождись окончания отправки" : undefined}
            onClick={() => setOpened(null)}
          >
            Все рассылки
          </AdminButton>
        </div>
        {opened === "cohort-invite" ? (
          <CohortInviteBroadcast invite={invite} />
        ) : (
          <BroadcastWorkspace {...firstTouch} />
        )}
      </Stack>
    );
  }

  const inviteHint = !snapshot
    ? "Загружаю…"
    : !snapshot.cohort
      ? "Нет потока в продаже"
      : `${snapshot.cohort.title} · отправлено ${snapshot.counts.sent} · сегодня можно ещё ${snapshot.quota.remainingToday}`;
  const firstTouchStats = firstTouch.stats;

  return (
    <CampaignTiles>
      <StatTile
        icon={<MailPlus aria-hidden />}
        label="Приглашение в поток"
        value={snapshot?.cohort ? recipientsLabel(snapshot.counts.remaining) : "—"}
        hint={inviteHint}
        onClick={() => setOpened("cohort-invite")}
      />
      <StatTile
        icon={<Mail aria-hidden />}
        label="First Touch: старт продаж"
        value={`${firstTouch.pendingCount} ожидают`}
        hint={
          firstTouchStats
            ? `Заявок ${firstTouchStats.total} · отправлено ${firstTouchStats.sent}`
            : "Загружаю…"
        }
        onClick={() => setOpened("first-touch")}
      />
    </CampaignTiles>
  );
};
