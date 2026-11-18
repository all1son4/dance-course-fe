import { ArrowLeft, Mail, MailPlus } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { useCohortInviteAdmin } from "../hooks/use-cohort-invite-admin";
import { describeCohortInviteTile } from "../lib/cohort-invite-view";
import { CampaignTiles } from "../styles/broadcast.styles";
import { AdminButton, Stack, StatTile } from "../ui/primitives";
import { BroadcastWorkspace } from "./broadcast-workspace";
import { CohortInviteBroadcast } from "./cohort-invite-broadcast";

type Campaign = "cohort-invite" | "first-touch";

/** The campaign last opened in this browser tab: «Рассылки» reopens it. */
const OPENED_KEY = "admin:broadcasts:opened";

const readOpened = (): Campaign | null => {
  try {
    const value = window.sessionStorage.getItem(OPENED_KEY);
    return value === "cohort-invite" || value === "first-touch" ? value : null;
  } catch {
    return null;
  }
};

const storeOpened = (value: Campaign | null) => {
  try {
    if (value) window.sessionStorage.setItem(OPENED_KEY, value);
    else window.sessionStorage.removeItem(OPENED_KEY);
  } catch {
    // Storage blocked: the tab simply opens on the tiles.
  }
};

/**
 * «Рассылки»: a tile per campaign with its main number; a tile opens that
 * campaign, and «Все рассылки» leads back to the tiles. The campaign last opened
 * in this browser tab opens straight away on the next visit.
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
  const [opened, setOpenedState] = useState<Campaign | null>(readOpened);
  const setOpened = (value: Campaign | null) => {
    storeOpened(value);
    setOpenedState(value);
  };
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

  const inviteTile = describeCohortInviteTile(snapshot);
  const firstTouchStats = firstTouch.stats;

  return (
    <CampaignTiles>
      <StatTile
        icon={<MailPlus aria-hidden />}
        label="Приглашение в поток"
        value={inviteTile.value}
        hint={inviteTile.hint}
        hintTone={inviteTile.tone}
        onClick={() => setOpened("cohort-invite")}
      />
      <StatTile
        icon={<Mail aria-hidden />}
        label="First Touch: старт продаж"
        value={
          firstTouchStats && firstTouch.pendingCount === 0
            ? "Завершена"
            : `${firstTouch.pendingCount} ожидают`
        }
        hint={
          firstTouchStats
            ? `Заявок ${firstTouchStats.total} · отправлено ${firstTouchStats.sent}`
            : "Загружаю…"
        }
        hintTone={
          firstTouchStats && firstTouch.pendingCount === 0 ? "success" : undefined
        }
        onClick={() => setOpened("first-touch")}
      />
    </CampaignTiles>
  );
};
