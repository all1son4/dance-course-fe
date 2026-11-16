import assert from "node:assert/strict";
import test from "node:test";

import {
  groupOnlineGroupCampaigns,
  type OnlineGroupCampaignSnapshot,
} from "./online-group-campaign-inventory";

function campaign(
  id: string,
  overrides: Partial<OnlineGroupCampaignSnapshot> = {},
): OnlineGroupCampaignSnapshot {
  return {
    id,
    title: "Online Group 2",
    regularChatId: "chat-2",
    libraryChatId: "hub-1",
    startsAt: new Date("2026-09-01T10:00:00Z"),
    status: "archived",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

test("campaign inventory: an empty history has no groups", () => {
  assert.deepEqual(groupOnlineGroupCampaigns([]), []);
});

test("campaign inventory: a single configuration preserves its complete snapshot", () => {
  const version = campaign("version-1", { status: "active" });

  assert.deepEqual(groupOnlineGroupCampaigns([version]), [
    { mainChatId: "chat-2", campaigns: [version], hubChatIds: ["hub-1"] },
  ]);
});

test("campaign inventory: edits of one chat stay together without choosing a title or start", () => {
  const earlier = campaign("version-1");
  const later = campaign("version-2", {
    title: "Online Group 2, rescheduled",
    startsAt: new Date("2026-09-08T10:00:00Z"),
    status: "active",
    createdAt: new Date("2026-08-15T10:00:00Z"),
  });

  assert.deepEqual(groupOnlineGroupCampaigns([later, earlier]), [
    { mainChatId: "chat-2", campaigns: [earlier, later], hubChatIds: ["hub-1"] },
  ]);
});

test("campaign inventory: matching titles and dates never merge different main chats", () => {
  const first = campaign("version-1", { regularChatId: "chat-1" });
  const second = campaign("version-2", { status: "active" });

  assert.deepEqual(groupOnlineGroupCampaigns([second, first]), [
    { mainChatId: "chat-1", campaigns: [first], hubChatIds: ["hub-1"] },
    { mainChatId: "chat-2", campaigns: [second], hubChatIds: ["hub-1"] },
  ]);
});

test("campaign inventory: conflicting Hub IDs are preserved, deduplicated and sorted", () => {
  const first = campaign("version-1", { libraryChatId: "hub-b" });
  const second = campaign("version-2", { libraryChatId: "hub-a" });
  const third = campaign("version-3", { libraryChatId: "hub-b", status: "active" });

  assert.deepEqual(groupOnlineGroupCampaigns([third, first, second]), [
    {
      mainChatId: "chat-2",
      campaigns: [first, second, third],
      hubChatIds: ["hub-a", "hub-b"],
    },
  ]);
});

test("campaign inventory: a shared Hub never merges different main chats", () => {
  const first = campaign("version-1", { regularChatId: "chat-1" });
  const second = campaign("version-2");

  assert.deepEqual(groupOnlineGroupCampaigns([first, second]), [
    { mainChatId: "chat-1", campaigns: [first], hubChatIds: ["hub-1"] },
    { mainChatId: "chat-2", campaigns: [second], hubChatIds: ["hub-1"] },
  ]);
});

test("campaign inventory: versions sort by creation time, then ID, independently of startsAt", () => {
  const older = campaign("version-z", {
    createdAt: new Date("2026-07-01T10:00:00Z"),
    startsAt: new Date("2026-10-01T10:00:00Z"),
  });
  const newerA = campaign("version-a", {
    startsAt: new Date("2026-08-01T10:00:00Z"),
  });
  const newerB = campaign("version-b");

  assert.deepEqual(groupOnlineGroupCampaigns([newerB, older, newerA]), [
    {
      mainChatId: "chat-2",
      campaigns: [older, newerA, newerB],
      hubChatIds: ["hub-1"],
    },
  ]);
});

test("campaign inventory: report order is independent of input order", () => {
  const history = [
    campaign("version-c", { regularChatId: "chat-c", libraryChatId: "hub-c" }),
    campaign("version-b", { regularChatId: "chat-a", libraryChatId: "hub-b" }),
    campaign("version-a", { regularChatId: "chat-a", libraryChatId: "hub-a" }),
  ];
  const expected = [
    {
      mainChatId: "chat-a",
      campaigns: [history[2], history[1]],
      hubChatIds: ["hub-a", "hub-b"],
    },
    { mainChatId: "chat-c", campaigns: [history[0]], hubChatIds: ["hub-c"] },
  ];

  for (const input of [
    history,
    [...history].reverse(),
    [history[1], history[0], history[2]],
  ]) {
    assert.deepEqual(groupOnlineGroupCampaigns(input), expected);
  }
});

test("campaign inventory: repeated reports do not mutate or reuse caller-owned arrays", () => {
  const older = campaign("version-1");
  const newer = campaign("version-2", {
    createdAt: new Date("2026-08-15T10:00:00Z"),
  });
  const history = Object.freeze([Object.freeze(newer), Object.freeze(older)]);
  const before = JSON.stringify(history);
  const expected = [
    { mainChatId: "chat-2", campaigns: [older, newer], hubChatIds: ["hub-1"] },
  ];

  const first = groupOnlineGroupCampaigns(history);
  const second = groupOnlineGroupCampaigns(history);
  assert.deepEqual(first, expected);
  assert.deepEqual(second, expected);
  assert.equal(JSON.stringify(history), before);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first[0].campaigns, history);
  first[0].campaigns.pop();
  first[0].hubChatIds.push("local-only-hub");
  assert.deepEqual(second, expected);
  assert.equal(JSON.stringify(history), before);
});
