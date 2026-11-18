import type { CohortInviteAdminSnapshot } from "@/lib/cohort-invite-broadcast";

import type { AdminTone } from "../styles/tokens.styles";

/*
 * What «Приглашение в поток» shows, computed from the snapshot: the batch the
 * number field describes, the day's quota cells, the tile of «Рассылки».
 * Pure, so the rules are tested without rendering.
 */

type Snapshot = Extract<CohortInviteAdminSnapshot, { campaignKey: string }>;

export const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const letters = (count: number) =>
  `${count} ${plural(count, "письмо", "письма", "писем")}`;

/** «19 ноября, 14:35» in Warsaw time, like every admin time. */
export const formatDayTime = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));

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

export type QuotaCell = "sent" | "batch" | "free" | "reserve";

/**
 * The day's Resend limit as one cell per email, in the order they are spent:
 * sent in the last 24 hours, this batch, still free today, the reserve for
 * purchase emails and tests (smaller once other emails have eaten into it).
 */
export const buildQuotaCells = ({
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
  const cells: QuotaCell[] = [
    ...Array<QuotaCell>(sent).fill("sent"),
    ...Array<QuotaCell>(inBatch).fill("batch"),
    ...Array<QuotaCell>(free).fill("free"),
    ...Array<QuotaCell>(reserve).fill("reserve"),
  ];

  return { batch: inBatch, cells, free, reserve, sent };
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
        ? `На сегодня всё · продолжить после ${formatDayTime(quota.nextBatch.at)}`
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
