import type { MyAccessCard } from "./cards";
import { phaseOf } from "./journey";

/*
 * The zones of «Мой доступ»: what waits for the reader, the accesses already
 * paid (running or starting later, all of them hers), what has ended. A card's
 * zone follows its state. Inside a zone (owner, 2026-11-18): what asks the reader
 * to act comes first, then the rest by the day it was bought, newest first — so a
 * cycle just bought tops the list even before it starts, and the group card comes
 * before the Hub of the same purchase. «Завершено» goes by the day it ended, the
 * latest first. Pure.
 */

export type MyAccessZone = "action" | "active" | "ended";

const ZONE_ORDER: readonly MyAccessZone[] = ["action", "active", "ended"];

/** Entering the channel or getting a new link waits on the reader. */
const WAITS_ON_READER = new Set(["linkExpired", "notJoined", "confirmTelegram"]);

export const zoneOf = (card: MyAccessCard): MyAccessZone => {
  if (WAITS_ON_READER.has(card.chip)) return "action";
  return phaseOf(card) === "done" ? "ended" : "active";
};

/** What asks the reader to act (enter, get a new link, renew) goes first. */
const asksToAct = (card: MyAccessCard) =>
  card.urgency === 0 || Boolean(card.action) || WAITS_ON_READER.has(card.chip);

/** One purchase, several cards: the group itself before the Hub that comes with it. */
const KIND_ORDER: Record<MyAccessCard["kind"], number> = {
  channel: 2,
  group: 0,
  hub: 1,
  lifetime: 3,
};

const byZoneOrder = (zone: MyAccessZone) => (a: MyAccessCard, b: MyAccessCard) =>
  zone === "ended"
    ? b.sortAt - a.sortAt
    : Number(asksToAct(b)) - Number(asksToAct(a)) ||
      b.boughtAt - a.boughtAt ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind];

export const groupMyAccessCards = (cards: readonly MyAccessCard[]) =>
  ZONE_ORDER.flatMap((zone) => {
    const inZone = cards.filter((card) => zoneOf(card) === zone).sort(byZoneOrder(zone));
    return inZone.length ? [{ cards: inZone, zone }] : [];
  });
