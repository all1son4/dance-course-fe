import type { MyAccessCard } from "./cards";
import { phaseOf } from "./journey";

/*
 * The zones of «Мой доступ»: what waits for the reader, the accesses already
 * paid (running or starting later, all of them hers), what has ended. A card's
 * zone follows its state; the order inside a zone is the cards' own (urgency,
 * then date). Pure.
 */

export type MyAccessZone = "action" | "active" | "ended";

const ZONE_ORDER: readonly MyAccessZone[] = ["action", "active", "ended"];

/** Entering the channel or getting a new link waits on the reader. */
const WAITS_ON_READER = new Set(["linkExpired", "notJoined"]);

export const zoneOf = (card: MyAccessCard): MyAccessZone => {
  if (WAITS_ON_READER.has(card.chip)) return "action";
  return phaseOf(card) === "done" ? "ended" : "active";
};

export const groupMyAccessCards = (cards: readonly MyAccessCard[]) =>
  ZONE_ORDER.flatMap((zone) => {
    const inZone = cards.filter((card) => zoneOf(card) === zone);
    return inZone.length ? [{ cards: inZone, zone }] : [];
  });
