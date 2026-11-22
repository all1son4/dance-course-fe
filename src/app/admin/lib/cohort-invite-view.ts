import type { CohortInviteAdminSnapshot } from "@/lib/cohort-invite-broadcast";

import type { AdminTone } from "../styles/tokens.styles";
import { formatDayMonthTime, plural } from "./admin.utils";

/*
 * What «Приглашение в поток» shows, computed from the snapshot: the batch the
 * number field describes, the day's quota, the tile of «Рассылки».
 * Pure, so the rules are tested without rendering.
 */

type Snapshot = Extract<CohortInviteAdminSnapshot, { campaignKey: string }>;

export const letters = (count: number) =>
  `${count} ${plural(count, "письмо", "письма", "писем")}`;

/** The batch the number field describes; an empty field means the default. */
export const readBatch = ({
  input,
  snapshot,
}: {
  input: string;
  snapshot: Pick<Snapshot, "counts" | "defaultBatchSize" | "quota">;
}) => {
  const max = Math.min(snapshot.quota.remainingToday, snapshot.counts.remaining);
  const size = input === "" ? Math.min(snapshot.defaultBatchSize, max) : Number(input);
  const valid = Number.isInteger(size) && size >= 1 && size <= max;

  return { max, size, valid };
};

/**
 * After how many rows of «Следующая партия» the line «дальше — следующие»
 * goes; null when there is no valid batch or the whole list fits in it.
 */
export const getBatchBoundary = ({
  size,
  total,
  valid,
}: {
  size: number;
  total: number;
  valid: boolean;
}) => (valid && size < total ? size : null);

/** The three-step strip shows until the first email of the campaign goes out. */
export const showsFirstSteps = (counts: Pick<Snapshot["counts"], "remaining" | "sent">) =>
  counts.sent === 0 && counts.remaining > 0;

export type QuotaPart = "sent" | "batch" | "free" | "reserve";

/**
 * The day's Resend limit split the way it is spent: sent in the last 24 hours,
 * this batch, still free today, the reserve for purchase emails and tests
 * (smaller once other emails have eaten into it). The parts add up to the limit.
 */
export const buildQuotaMeter = ({
  batch,
  quota,
}: {
  batch: number;
  quota: Pick<Snapshot["quota"], "dailyLimit" | "remainingToday" | "sentLast24h">;
}) => {
  const sent = Math.min(quota.sentLast24h, quota.dailyLimit);
  const inBatch = Math.max(0, Math.min(batch, quota.remainingToday));
  const free = quota.remainingToday - inBatch;
  const reserve = Math.max(0, quota.dailyLimit - sent - quota.remainingToday);
  const parts: { count: number; kind: QuotaPart }[] = [
    { count: sent, kind: "sent" },
    { count: inBatch, kind: "batch" },
    { count: free, kind: "free" },
    { count: reserve, kind: "reserve" },
  ];

  return { batch: inBatch, free, parts, reserve, sent };
};

export type CampaignTile = { hint: string; tone?: AdminTone; value: string };

const recipients = (count: number) =>
  `${count} ${plural(count, "получатель", "получателя", "получателей")}`;

/** The tile of «Приглашение в поток»: its state and main number without opening it. */
export const describeCohortInviteTile = (
  snapshot: CohortInviteAdminSnapshot | null,
): CampaignTile => {
  if (!snapshot) return { hint: "Загружаю…", value: "—" };
  if (!snapshot.cohort) return { hint: "Нет потока в продаже", value: "—" };

  const { counts, quota } = snapshot;
  const title = snapshot.cohort.title;

  if (counts.remaining === 0) {
    return {
      hint: `${title} · отправлено ${counts.sent}`,
      tone: "success",
      value: "Завершена",
    };
  }
  if (!snapshot.salesOpen) {
    return {
      hint: `${title} · продажи закрыты, отправка недоступна`,
      tone: "warning",
      value: recipients(counts.remaining),
    };
  }
  if (quota.remainingToday === 0) {
    return {
      hint: quota.nextBatch
        ? `На сегодня всё · продолжить после ${formatDayMonthTime(quota.nextBatch.at)}`
        : "На сегодня всё · продолжи завтра",
      tone: "info",
      value: recipients(counts.remaining),
    };
  }

  return {
    hint:
      counts.sent === 0
        ? `${title} · ещё не начата · сегодня можно ${quota.remainingToday}`
        : `${title} · идёт · отправлено ${counts.sent} · сегодня можно ещё ${quota.remainingToday}`,
    value: recipients(counts.remaining),
  };
};
