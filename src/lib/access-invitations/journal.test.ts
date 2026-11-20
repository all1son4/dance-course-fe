import assert from "node:assert/strict";
import test from "node:test";

import type { InvitationJournalAccess } from "@/db/access-invitations";

import { describeInvitationJournalEntry } from "./journal";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const LATER = new Date("2026-12-20T12:00:00.000Z");

const access = (
  overrides: Partial<InvitationJournalAccess> &
    Pick<InvitationJournalAccess, "accessKey">,
): InvitationJournalAccess => ({
  accessUrl: "",
  chatTitle:
    overrides.accessKey === "main-group" ? "Online group 3.0" : "Inspiration Hub",
  expiresAt: null,
  joinedByLink: false,
  startsAt: null,
  state: "pending",
  tokenExpiresAt: null,
  ...overrides,
});

const entry = (
  accesses: InvitationJournalAccess[],
  overrides: Partial<Parameters<typeof describeInvitationJournalEntry>[0]> = {},
) =>
  describeInvitationJournalEntry(
    {
      accesses,
      inviteEmailStatus: "sent",
      kind: "renewal",
      revoked: false,
      telegramConfirmed: true,
      ...overrides,
    },
    NOW,
  );

test("a Plus with the Hub already running is not «in the chat» before the cohort chat", () => {
  const view = entry([
    access({
      accessKey: "main-group",
      accessUrl: "https://t.me/+main",
      state: "issued",
      tokenExpiresAt: LATER,
    }),
    access({ accessKey: "inspiration-hub", expiresAt: LATER, state: "member" }),
  ]);

  assert.deepEqual(view.next, { label: "Ждёт входа в чат потока", tone: "neutral" });
  assert.deepEqual(view.inChats, ["Inspiration Hub"]);
  assert.equal(view.accesses[0]?.label, "Ссылка выдана, ещё не использована");
  assert.deepEqual(view.accesses[0]?.date, {
    kind: "linkUntil",
    at: LATER.toISOString(),
  });
  assert.equal(view.accesses[0]?.accessUrl, "https://t.me/+main");
  assert.equal(view.accesses[1]?.label, "Уже в Hub, доступ продлён");
  assert.equal(view.canResendLinks, true);
});

test("left is not «in the chat», and out of every chat shows no chat badge", () => {
  const view = entry([
    access({ accessKey: "main-group", joinedByLink: true, state: "left" }),
  ]);

  assert.deepEqual(view.inChats, []);
  assert.equal(view.next, null);
  assert.equal(view.accesses[0]?.label, "Вышли из чата");
});

test("in the cohort chat: the badge names that chat, nothing left to do", () => {
  const view = entry([
    access({ accessKey: "main-group", joinedByLink: true, state: "member" }),
  ]);

  assert.deepEqual(view.inChats, ["Online group 3.0"]);
  assert.equal(view.next, null);
  assert.equal(view.needsAnna, false);
  assert.equal(view.canResendLinks, false);
});

test("a confirmed renewal without any link and a failed link need Anna", () => {
  const nothing = entry([access({ accessKey: "main-group", state: "pending" })]);
  assert.equal(nothing.needsAnna, true);
  assert.equal(nothing.next?.tone, "danger");
  assert.equal(nothing.canResendLinks, true);

  const failed = entry([access({ accessKey: "main-group", state: "failed" })]);
  assert.equal(failed.needsAnna, true);
  assert.equal(failed.accesses[0]?.label, "Не удалось создать ссылку");
});

test("a renewal before its Telegram check waits for the person, not for Anna", () => {
  const view = entry([access({ accessKey: "main-group", state: "pending" })], {
    telegramConfirmed: false,
  });

  assert.deepEqual(view.next, { label: "Ждёт проверки Telegram", tone: "neutral" });
  assert.equal(view.needsAnna, false);
  assert.equal(view.canResendInvite, true);
  assert.equal(view.canResendLinks, false);
  assert.equal(view.canRecheck, false);
  assert.equal(view.accesses[0]?.label, "Ждёт проверки Telegram");
});
