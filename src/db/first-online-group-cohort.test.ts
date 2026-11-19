import assert from "node:assert/strict";
import test from "node:test";

import {
  checkFirstCohortDates,
  findFirstCohortChat,
  FIRST_COHORT_TITLE,
} from "./first-online-group-cohort";

const c2 = {
  id: "c2",
  mainChatId: "chat-2",
  startsAt: new Date("2026-08-10T06:00:00Z"),
  title: "Online Group 2.0",
};
const c3 = {
  id: "c3",
  mainChatId: "chat-3",
  startsAt: new Date("2026-11-23T17:00:00Z"),
  title: "Online Group 3.0",
};
// Prod's shape: 1.0 → 2.0 from an unrecorded chat; 2.0 → 3.0 twice (two tariffs).
const campaigns = [
  { sourceChatIds: ["chat-1", "chat-1"], targetChatId: "chat-2" },
  { sourceChatIds: ["chat-2"], targetChatId: "chat-3" },
  { sourceChatIds: ["chat-2"], targetChatId: "chat-3" },
];

test("the first cycle's chat is the one unrecorded source of a renewal into the first recorded cycle", () => {
  const found = findFirstCohortChat({ campaigns, cohorts: [c2, c3] });
  assert.deepEqual(found, { existing: null, next: c2, ok: true, sourceChatId: "chat-1" });

  // Rerun after recording it: the same pair, and the existing cohort is ours.
  const ours = {
    id: "c1",
    mainChatId: "chat-1",
    startsAt: new Date("2026-06-01T15:00:00Z"),
    title: FIRST_COHORT_TITLE,
  };
  assert.deepEqual(findFirstCohortChat({ campaigns, cohorts: [ours, c2, c3] }), {
    existing: ours,
    next: c2,
    ok: true,
    sourceChatId: "chat-1",
  });
});

test("anything ambiguous stops the run", () => {
  // A cohort someone else recorded on that chat: not ours, nothing to create.
  const foreign = { ...c2, id: "x", mainChatId: "chat-1", title: "Something else" };
  assert.equal(findFirstCohortChat({ campaigns, cohorts: [foreign, c2, c3] }).ok, false);
  // Two unrecorded source chats.
  assert.equal(
    findFirstCohortChat({
      campaigns: [...campaigns, { sourceChatIds: ["chat-0"], targetChatId: "chat-3" }],
      cohorts: [c2, c3],
    }).ok,
    false,
  );
  // A campaign naming several source chats proves no single one.
  assert.equal(
    findFirstCohortChat({
      campaigns: [{ sourceChatIds: ["chat-1", "chat-0"], targetChatId: "chat-2" }],
      cohorts: [c2, c3],
    }).ok,
    false,
  );
  // The cycle it leads into is not the first recorded one.
  const earlier = {
    ...c2,
    id: "e",
    mainChatId: "chat-e",
    startsAt: new Date("2026-07-01T00:00:00Z"),
    title: "Earlier",
  };
  assert.equal(findFirstCohortChat({ campaigns, cohorts: [earlier, c2, c3] }).ok, false);
});

test("the dates must be a plausible closed cycle before the next one", () => {
  const now = new Date("2026-11-19T10:00:00Z");
  const ok = {
    closedAt: new Date("2026-07-13T10:00:00Z"),
    durationWeeks: 6,
    startsAt: new Date("2026-06-01T15:00:00Z"),
  };
  assert.equal(checkFirstCohortDates(ok, c2, now), null);
  assert.ok(checkFirstCohortDates({ ...ok, durationWeeks: 0 }, c2, now));
  assert.ok(checkFirstCohortDates({ ...ok, durationWeeks: 2.5 }, c2, now));
  assert.ok(checkFirstCohortDates({ ...ok, closedAt: ok.startsAt }, c2, now));
  assert.ok(
    checkFirstCohortDates({ ...ok, closedAt: new Date("2026-08-11T00:00:00Z") }, c2, now),
  );
  assert.ok(checkFirstCohortDates(ok, c2, new Date("2026-07-13T12:00:00Z")));
});
