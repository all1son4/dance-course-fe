import assert from "node:assert/strict";
import test from "node:test";

import type { CohortInviteAdminSnapshot } from "@/lib/cohort-invite-broadcast";

import {
  buildQuotaCells,
  describeCohortInviteTile,
  getBatchBoundary,
  readBatch,
  showsFirstSteps,
} from "./cohort-invite-view";

const snapshot = (
  patch: {
    counts?: Partial<
      Extract<CohortInviteAdminSnapshot, { campaignKey: string }>["counts"]
    >;
    quota?: Partial<Extract<CohortInviteAdminSnapshot, { campaignKey: string }>["quota"]>;
    salesOpen?: boolean;
  } = {},
): Extract<CohortInviteAdminSnapshot, { campaignKey: string }> => ({
  campaignKey: "cohort_invite:c3",
  cohort: { durationWeeks: 8, startsAt: "2026-11-23T09:00:00.000Z", title: "Поток 3.0" },
  counts: {
    alreadyBought: 4,
    excluded: 1,
    failed: 0,
    inProgress: 0,
    remaining: 40,
    sent: 15,
    ...patch.counts,
  },
  defaultBatchSize: 15,
  hubOnSale: true,
  quota: {
    dailyLimit: 30,
    nextBatch: null,
    remainingToday: 12,
    reserve: 10,
    sentLast24h: 8,
    ...patch.quota,
  },
  recipients: [],
  renewal: { plus: true, standard: true },
  salesOpen: patch.salesOpen ?? true,
  unsubscribeConfigured: true,
});

test("an empty batch field means the default, capped by today and by the list", () => {
  assert.deepEqual(readBatch({ input: "", snapshot: snapshot() }), {
    max: 12,
    size: 12,
    valid: true,
  });
  assert.deepEqual(
    readBatch({ input: "", snapshot: snapshot({ quota: { remainingToday: 20 } }) }),
    { max: 20, size: 15, valid: true },
  );
  assert.deepEqual(
    readBatch({ input: "", snapshot: snapshot({ counts: { remaining: 3 } }) }),
    { max: 3, size: 3, valid: true },
  );
  for (const input of ["0", "13", "2.5", "abc"]) {
    assert.equal(readBatch({ input, snapshot: snapshot() }).valid, false, input);
  }
});

test("the batch line goes after the batch's last row, never after the whole list", () => {
  assert.equal(getBatchBoundary({ size: 15, total: 40, valid: true }), 15);
  assert.equal(getBatchBoundary({ size: 15, total: 15, valid: true }), null);
  assert.equal(getBatchBoundary({ size: 15, total: 9, valid: true }), null);
  assert.equal(getBatchBoundary({ size: 99, total: 40, valid: false }), null);
});

test("the three steps show only before the first email of the campaign", () => {
  assert.equal(showsFirstSteps({ remaining: 40, sent: 0 }), true);
  assert.equal(showsFirstSteps({ remaining: 40, sent: 1 }), false);
  assert.equal(showsFirstSteps({ remaining: 0, sent: 0 }), false);
});

test("the quota cells add up to the daily limit in the order they are spent", () => {
  const meter = buildQuotaCells({
    batch: 5,
    quota: { dailyLimit: 30, remainingToday: 12, sentLast24h: 8 },
  });
  assert.deepEqual(
    { batch: meter.batch, free: meter.free, reserve: meter.reserve, sent: meter.sent },
    { batch: 5, free: 7, reserve: 10, sent: 8 },
  );
  assert.equal(meter.cells.length, 30);
  assert.deepEqual([...new Set(meter.cells)], ["sent", "batch", "free", "reserve"]);

  // Emails beyond the campaign's share eat into the reserve; nothing overflows.
  const spent = buildQuotaCells({
    batch: 15,
    quota: { dailyLimit: 30, remainingToday: 0, sentLast24h: 24 },
  });
  assert.deepEqual(
    { batch: spent.batch, free: spent.free, reserve: spent.reserve, sent: spent.sent },
    { batch: 0, free: 0, reserve: 6, sent: 24 },
  );
  assert.equal(spent.cells.length, 30);
});

test("the campaign tile says its state without opening it", () => {
  assert.deepEqual(describeCohortInviteTile(null), { hint: "Загружаю…", value: "—" });
  assert.deepEqual(describeCohortInviteTile({ cohort: null }), {
    hint: "Нет потока в продаже",
    value: "—",
  });
  assert.deepEqual(describeCohortInviteTile(snapshot({ counts: { remaining: 0 } })), {
    hint: "Поток 3.0 · отправлено 15",
    tone: "success",
    value: "Завершена",
  });
  assert.equal(describeCohortInviteTile(snapshot({ salesOpen: false })).tone, "warning");
  assert.deepEqual(
    describeCohortInviteTile(
      snapshot({
        quota: {
          nextBatch: { at: "2026-11-19T13:35:00.000Z", size: 15 },
          remainingToday: 0,
        },
      }),
    ),
    {
      hint: "На сегодня всё · продолжить после 19 ноября в 14:35",
      tone: "info",
      value: "40 получателей",
    },
  );
  assert.equal(
    describeCohortInviteTile(snapshot({ quota: { remainingToday: 0 } })).hint,
    "На сегодня всё · продолжи завтра",
  );
  assert.equal(
    describeCohortInviteTile(snapshot()).hint,
    "Поток 3.0 · идёт · отправлено 15 · сегодня можно ещё 12",
  );
  assert.equal(
    describeCohortInviteTile(snapshot({ counts: { sent: 0 } })).hint,
    "Поток 3.0 · ещё не начата · сегодня можно 12",
  );
});
