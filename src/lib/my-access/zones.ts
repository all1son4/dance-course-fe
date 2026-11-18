import type { MyAccessCard } from "./cards";
import { phaseOf } from "./journey";

/*
 * The zones of «Мой доступ»: what waits for the reader, the accesses already
 * paid (running or starting later, all of them hers), what has ended. A card's
 * zone follows its state. Inside a zone (owner, 2026-11-18): what asks the reader
 * to act comes first, then what runs right now, then the rest — each by the day
 * it was bought, newest first; «Завершено» goes by the day it ended, the latest
 * first. Pure.
 */

export type MyAccessZone = "action" | "active" | "ended";

const ZONE_ORDER: readonly MyAccessZone[] = ["action", "active", "ended"];

/** Entering the channel or getting a new link waits on the reader. */
const WAITS_ON_READER = new Set(["linkExpired", "notJoined"]);

export const zoneOf = (card: MyAccessCard): MyAccessZone => {
  if (WAITS_ON_READER.has(card.chip)) return "action";
  return phaseOf(card) === "done" ? "ended" : "active";
};

/** 0 — asks the reader to act (enter, get a new link, renew), 1 — runs now, 2 — later. */
const rankOf = (card: MyAccessCard) =>
  card.urgency === 0 || card.action || WAITS_ON_READER.has(card.chip)
    ? 0
    : phaseOf(card) === "now"
      ? 1
      : 2;

const byZoneOrder = (zone: MyAccessZone) => (a: MyAccessCard, b: MyAccessCard) =>
  zone === "ended"
    ? b.sortAt - a.sortAt
    : rankOf(a) - rankOf(b) || b.boughtAt - a.boughtAt;

export const groupMyAccessCards = (cards: readonly MyAccessCard[]) =>
  ZONE_ORDER.flatMap((zone) => {
    const inZone = cards.filter((card) => zoneOf(card) === zone).sort(byZoneOrder(zone));
    return inZone.length ? [{ cards: inZone, zone }] : [];
  });
