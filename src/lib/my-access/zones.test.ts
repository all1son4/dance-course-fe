import assert from "node:assert/strict";
import test from "node:test";

import type { MyAccessCard } from "@/lib/my-access/cards";
import { groupMyAccessCards, zoneOf } from "@/lib/my-access/zones";

const card = (overrides: Partial<MyAccessCard> & { id: string }): MyAccessCard => ({
  boughtAt: 0,
  chip: "active",
  count: 1,
  kind: "channel",
  sortAt: 0,
  status: { key: "channel.until" },
  title: { offerExternalId: "o", productExternalId: "p" },
  urgency: 1,
  ...overrides,
});

test("zones: what waits on the reader, what is paid, what ended", () => {
  assert.equal(
    zoneOf(
      card({ chip: "linkExpired", id: "a", status: { key: "channel.startsOnJoin" } }),
    ),
    "action",
  );
  assert.equal(
    zoneOf(card({ chip: "notJoined", id: "b", status: { key: "group.startsOn" } })),
    "action",
  );
  assert.equal(zoneOf(card({ id: "c" })), "active");
  assert.equal(
    zoneOf(card({ chip: "upcoming", id: "d", status: { key: "hub.scheduled" } })),
    "active",
  );
  assert.equal(
    zoneOf(card({ chip: "ended", id: "e", status: { key: "hub.ended" } })),
    "ended",
  );
});

test("zones keep their order and skip the empty ones", () => {
  const groups = groupMyAccessCards([
    card({ chip: "upcoming", id: "soon", status: { key: "hub.scheduled" } }),
    card({ id: "run" }),
    card({ chip: "linkExpired", id: "wait", status: { key: "channel.startsOnJoin" } }),
  ]);

  assert.deepEqual(
    groups.map(({ cards, zone }) => [zone, cards.map((c) => c.id)]),
    [
      ["action", ["wait"]],
      ["active", ["soon", "run"]],
    ],
  );
});

test("inside a zone: what asks to act, then newest purchase first; group before its Hub", () => {
  const day = (iso: string) => Date.parse(iso);
  // The owner's screen (2026-11-19): Plus of cycle 3.0 bought on 18 November — its
  // group starts later, its Hub is open now — and the Birthday Drop from August.
  const groups = groupMyAccessCards([
    card({
      boughtAt: day("2026-08-24"),
      id: "birthday-aug",
      kind: "lifetime",
      status: { key: "lifetime" },
    }),
    card({
      boughtAt: day("2026-11-18"),
      id: "hub-of-plus",
      kind: "hub",
      status: { key: "plusHub.included" },
    }),
    card({
      boughtAt: day("2026-11-18"),
      chip: "upcoming",
      id: "group-3",
      kind: "group",
      status: { key: "group.startsOn" },
    }),
    // An access ending soon with a renewal button asks to act: first in its zone.
    card({
      action: { href: "/payment", key: "renewHub" },
      boughtAt: day("2026-05-01"),
      chip: "endsSoon",
      id: "hub-renew-may",
      kind: "hub",
      status: { key: "hub.activeUntil" },
      urgency: 0,
    }),
    card({
      chip: "ended",
      id: "ended-oct",
      sortAt: day("2026-10-01"),
      status: { key: "hub.ended" },
    }),
    card({
      chip: "ended",
      id: "ended-nov",
      sortAt: day("2026-11-01"),
      status: { key: "hub.ended" },
    }),
  ]);

  assert.deepEqual(
    groups.map(({ cards, zone }) => [zone, cards.map((c) => c.id)]),
    [
      ["active", ["hub-renew-may", "group-3", "hub-of-plus", "birthday-aug"]],
      ["ended", ["ended-nov", "ended-oct"]],
    ],
  );
});

test("greetings vary within one hour of the day", async () => {
  const { pickGreeting } = await import("@/lib/my-access/greeting");
  const pools = {
    always: ["Привет, {name}"],
    day: ["Добрый день, {name}", "Хорошего дня, {name}"],
    evening: ["Добрый вечер"],
    morning: ["Доброе утро"],
    night: ["Доброй ночи"],
  };
  const seen = new Set(
    [0, 0.3, 0.5, 0.9].map((r) => pickGreeting(pools, "day", "Анна", () => r)),
  );

  assert.ok(seen.size >= 2);
  for (const greeting of seen) assert.ok(greeting.includes("Анна"));
});
