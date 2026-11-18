import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  buildCheckoutHref,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_DISCOUNT_SLUG,
  INSPIRATION_HUB_PRODUCT_ID,
  isInspirationHubOfferId,
  isOnlineGroupLibraryOfferId,
} from "@/constants/sellable-products";
import { addWarsawCalendarDays, isStartDayReached } from "@/lib/inspiration-hub/calendar";
import { getPlusHubLastDay } from "@/lib/online-group/cohort-messages";
import {
  getOfferAccessDurationDaysByOfferId,
  isChoreoChannelOfferId,
  isFirstTouchOfferId,
  isLifetimeChannelOfferId,
  isOnlineGroupAccessOfferId,
} from "@/lib/telegram/offer-access";

/*
 * «Мой доступ» (HUB-D28): one card per current access, each product family by its
 * own rule. Pure: the page reads the snapshot and translates the keys. No sums,
 * Telegram IDs or invite links ever reach a card.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A standalone Hub this close to its end offers the renewal (section 11). */
export const HUB_RENEWAL_WINDOW_DAYS = 7;

export const HUB_RENEWAL_HREF = `/payment?renewal=${INSPIRATION_HUB_DISCOUNT_SLUG}`;
/** The Hub at its full price, for someone the renewal price no longer covers. */
export const HUB_PURCHASE_HREF = buildCheckoutHref({
  offerId: INSPIRATION_HUB_ACCESS_OFFER_ID,
  productId: INSPIRATION_HUB_PRODUCT_ID,
});

/**
 * Which purchases the checkout would accept right now; a button that leads to a
 * refused payment is never shown. Both default to open (tests, calendar files).
 */
export type MyAccessSales = { hubRenewal: boolean; hubPurchase: boolean };
const ALL_OPEN: MyAccessSales = { hubPurchase: true, hubRenewal: true };

const WEEK_MS = 7 * DAY_MS;

export type MyAccessPurchase = {
  id: string;
  productExternalId: string;
  offerExternalId: string;
  succeededAt: Date | null;
  cohortId: string | null;
  /** The Telegram identity the purchase belongs to, when known. */
  telegramUserId: string | null;
};

export type MyAccessRight = {
  purchaseId: string;
  accessKey: string;
  status: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  sourceKind: string | null;
  /**
   * Whether an unused, unexpired invite still waits in the payment email; absent
   * when unknown. A buyer who never joined and holds none is sent to support.
   */
  hasLiveInvite?: boolean;
  /** "manual-admin" rights are issued by hand: no self-service invite. */
  accessWorkflow?: string | null;
};

export type MyAccessCohort = {
  id: string;
  startsAt: Date;
  closedAt: Date | null;
  accessEndsAt: Date | null;
  /** HUB-D50: the planned length; the real end is the closure. */
  durationWeeks: number;
};

export type MyAccessSnapshot = {
  /**
   * The cohorts whose chat members get the Hub renewal price now (HUB-D17/D36: the
   * latest started one and those ended at most 7 days ago). The checkout checks the
   * membership itself; the page offers the price only to members of record.
   */
  hubDiscountCohortIds?: readonly string[];
  /** The name given at checkout, for the greeting only; never on a card. */
  customerFullName?: string | null;
  purchases: MyAccessPurchase[];
  rights: MyAccessRight[];
  cohorts: MyAccessCohort[];
};

export type MyAccessCalendarDate =
  { kind: "start"; at: string } | { kind: "end"; at: string };

/** A translated line: the key under `MyAccessPage.cards` and its values (dates as ISO). */
export type MyAccessLine = { key: string; values?: Record<string, string | number> };

export type MyAccessChip =
  "active" | "endsSoon" | "notJoined" | "linkExpired" | "upcoming" | "ended";

export type MyAccessCard = {
  id: string;
  /** The icon family. */
  kind: "hub" | "group" | "channel" | "lifetime";
  /** The status badge; its text says the state, so colour is never the only cue. */
  chip: MyAccessChip;
  /** A running window with both ends known: drives the remaining-time bar. */
  period?: { start: string; end: string };
  /**
   * The week of a running Online Group cycle by its calendar, counted from the
   * cycle start. A fact of the calendar, never a claim about lessons watched.
   */
  cycleWeek?: { current: number; total: number };
  /**
   * The one date worth a calendar entry: a start still ahead (timed, or the whole
   * day for the Hub) or the end of a running access.
   */
  calendar?: MyAccessCalendarDate;
  /** Which title to show: the purchase's product, or the Hub itself. */
  title: { productExternalId: string; offerExternalId: string } | "hub";
  status: MyAccessLine;
  note?: MyAccessLine;
  /**
   * The card's button. `reissue` asks for a fresh invite by email (the link itself
   * never reaches the page); its `href` is support, the way out when that fails.
   */
  action?: {
    key: "renewHub" | "buyHub" | "support" | "reissue";
    href: string;
    purchaseId?: string;
  };
  /** How many identical purchases this one card stands for (folded duplicates). */
  count: number;
  /** 0 — needs action, 1 — running, 2 — later, 3 — ended. Sort key. */
  urgency: 0 | 1 | 2 | 3;
  /** Secondary sort key: the date the card is about. */
  sortAt: number;
};

type BaseCard = Omit<MyAccessCard, "chip" | "count" | "kind">;

/** A fresh invite of this purchase, sent to its email; support when that fails. */
const reissueAction = (purchaseId: string) => ({
  href: SUPPORT_TELEGRAM_URL,
  key: "reissue" as const,
  purchaseId,
});

/** A right issued by hand is re-issued by hand: support, not a self-service invite. */
const SUPPORT_ACTION = { href: SUPPORT_TELEGRAM_URL, key: "support" as const };
const newLinkAction = (right: MyAccessRight) =>
  right.accessWorkflow === "manual-admin"
    ? SUPPORT_ACTION
    : reissueAction(right.purchaseId);

/** The note of an access not joined yet: the emailed link, or a new one once it has expired. */
const joinNote = (right: MyAccessRight) =>
  right.hasLiveInvite === false
    ? { action: newLinkAction(right), note: { key: "linkExpired" } }
    : { note: { key: "linkInEmail" } };

const isRevoked = (right: MyAccessRight) =>
  right.revokedAt !== null || right.status === "revoked";
const isJoined = (right: MyAccessRight) =>
  right.status === "activated" || right.status === "left_channel";
const daysLeft = (end: Date, now: Date) =>
  Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
const iso = (date: Date) => date.toISOString();

const hubPeriodEnd = (right: MyAccessRight) => right.expiresAt;

/** Standalone Hub periods of one identity, folded into one card. */
const buildStandaloneHubCard = ({
  groupId,
  hasPlusHub,
  isDiscountMember,
  now,
  periods,
  sales,
}: {
  groupId: string;
  hasPlusHub: boolean;
  /** A member of record of a cohort whose chat gets the renewal price now. */
  isDiscountMember: boolean;
  now: Date;
  periods: MyAccessRight[];
  sales: MyAccessSales;
}): BaseCard | null => {
  const current = periods.find(
    (period) =>
      period.startsAt !== null &&
      period.startsAt <= now &&
      (period.expiresAt === null || period.expiresAt > now),
  );
  const later = periods.filter(
    (period) => period.startsAt === null || period.startsAt > now,
  );
  const knownEnds = [current, ...later]
    .map((period) => period && hubPeriodEnd(period))
    .filter((end): end is Date => end instanceof Date);
  const paidUntil = knownEnds.length
    ? new Date(Math.max(...knownEnds.map((end) => end.getTime())))
    : null;

  if (current && paidUntil) {
    const left = daysLeft(paidUntil, now);
    // Renewing early loses no day, so the button is there for the whole period.
    // A running paid Hub is itself the basis of the renewal price (HUB-D17).
    const canRenew = later.length === 0 && !hasPlusHub && sales.hubRenewal;
    const endsSoon = canRenew && left <= HUB_RENEWAL_WINDOW_DAYS;
    const notJoined = !isJoined(current) && !hasPlusHub;

    return {
      id: `hub:${groupId}`,
      title: "hub",
      period: { end: iso(paidUntil), start: iso(current.startsAt!) },
      calendar: { kind: "end", at: iso(paidUntil) },
      status: { key: "hub.activeUntil", values: { date: iso(paidUntil) } },
      note: notJoined
        ? current.hasLiveInvite === false
          ? { key: "hub.notJoinedExpired" }
          : { key: "hub.notJoined" }
        : later.length > 0
          ? { key: "hub.renewed" }
          : { key: "daysLeft", values: { count: left } },
      ...(endsSoon
        ? { action: { key: "renewHub" as const, href: HUB_RENEWAL_HREF } }
        : notJoined && current.hasLiveInvite === false
          ? { action: newLinkAction(current) }
          : canRenew
            ? { action: { key: "renewHub" as const, href: HUB_RENEWAL_HREF } }
            : {}),
      urgency: endsSoon || notJoined ? 0 : 1,
      sortAt: paidUntil.getTime(),
    };
  }

  const next = later
    .filter((period) => period.startsAt !== null)
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())[0];

  if (next?.startsAt && paidUntil) {
    return {
      id: `hub:${groupId}`,
      title: "hub",
      calendar: { kind: "start", at: iso(next.startsAt) },
      status: {
        key: "hub.scheduled",
        values: { start: iso(next.startsAt), end: iso(paidUntil) },
      },
      note: { key: "hub.linkOnStart" },
      urgency: 2,
      sortAt: next.startsAt.getTime(),
    };
  }

  if (later.length > 0) {
    return {
      id: `hub:${groupId}`,
      title: "hub",
      status: { key: "hub.afterCohort" },
      urgency: 2,
      sortAt: Number.MAX_SAFE_INTEGER,
    };
  }

  const lastEnd = periods
    .map(hubPeriodEnd)
    .filter((end): end is Date => end instanceof Date && end <= now)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (lastEnd && !hasPlusHub) {
    return {
      id: `hub:${groupId}`,
      title: "hub",
      status: { key: "hub.ended", values: { date: iso(lastEnd) } },
      // The renewal price only where the checkout grants it; else the full price.
      ...(isDiscountMember && sales.hubRenewal
        ? { action: { key: "buyHub" as const, href: HUB_RENEWAL_HREF } }
        : sales.hubPurchase
          ? { action: { key: "buyHub" as const, href: HUB_PURCHASE_HREF } }
          : {}),
      urgency: 3,
      sortAt: lastEnd.getTime(),
    };
  }

  return null;
};

/** The Hub that comes with Plus (section 8, text 3). */
const buildPlusHubCard = ({
  canRenewHub,
  cohort,
  hubContinues,
  now,
  purchase,
  right,
}: {
  /** The renewal price is open to this buyer now and the Hub is on sale. */
  canRenewHub: boolean;
  cohort: MyAccessCohort | null;
  /** A paid Hub period or a later Plus already keeps this buyer in the Hub (§11). */
  hubContinues: boolean;
  now: Date;
  purchase: MyAccessPurchase;
  right: MyAccessRight;
}): BaseCard | null => {
  const base = { id: `plus-hub:${purchase.id}`, title: "hub" as const };
  // A legacy Plus right (cohort #2, HUB-D26) carries its own end, "until the next
  // start"; a classified one ends a week after its cohort (HUB-D24).
  const legacyEnd = right.sourceKind === null ? right.expiresAt : null;

  if (cohort?.closedAt && cohort.accessEndsAt) {
    const lastDay = legacyEnd ?? getPlusHubLastDay(cohort.accessEndsAt);

    if (lastDay <= now) return null;

    // Already renewed: no urgent "renew" next to the Hub already paid for. Without a
    // renewal the checkout would accept, the card only says until when it runs.
    if (!hubContinues && !canRenewHub) {
      return {
        ...base,
        calendar: { kind: "end" as const, at: iso(lastDay) },
        status: { key: "plusHub.closed", values: { date: iso(lastDay) } },
        urgency: 1,
        sortAt: lastDay.getTime(),
      };
    }

    return hubContinues
      ? {
          ...base,
          calendar: { kind: "end" as const, at: iso(lastDay) },
          status: { key: "plusHub.closed", values: { date: iso(lastDay) } },
          note: { key: "hub.renewed" },
          urgency: 1,
          sortAt: lastDay.getTime(),
        }
      : {
          ...base,
          calendar: { kind: "end" as const, at: iso(lastDay) },
          status: { key: "plusHub.closed", values: { date: iso(lastDay) } },
          note: { key: "plusHub.keep" },
          action: { key: "renewHub", href: HUB_RENEWAL_HREF },
          urgency: 0,
          sortAt: lastDay.getTime(),
        };
  }

  const recordedEnd = legacyEnd ?? (cohort ? null : right.expiresAt);

  if (recordedEnd) {
    return recordedEnd > now
      ? {
          ...base,
          calendar: { kind: "end", at: iso(recordedEnd) },
          status: { key: "plusHub.until", values: { date: iso(recordedEnd) } },
          urgency: 1,
          sortAt: recordedEnd.getTime(),
        }
      : null;
  }

  // HUB-D49: the library is open from payment; the library opens before the start.
  // No calendar date: the library is already open, the start is the group's own.
  if (cohort && !isStartDayReached(cohort.startsAt, now)) {
    return {
      ...base,
      status: { key: "plusHub.included" },
      note: { key: "plusHub.openBeforeStart", values: { date: iso(cohort.startsAt) } },
      urgency: 1,
      sortAt: cohort.startsAt.getTime(),
    };
  }

  return {
    ...base,
    status: { key: "plusHub.included" },
    note: cohort
      ? {
          key: "plusHub.duringCohortUntil",
          values: {
            date: iso(addWarsawCalendarDays(cohort.startsAt, cohort.durationWeeks * 7)),
          },
        }
      : { key: "plusHub.duringCohort" },
    urgency: 1,
    sortAt: Number.MAX_SAFE_INTEGER - 1,
  };
};

/** Standard or Plus of one cohort (the title names the tariff): runs while the cohort runs. */
const buildOnlineGroupCard = ({
  cohort,
  now,
  primary,
  purchase,
}: {
  cohort: MyAccessCohort | null;
  now: Date;
  primary: MyAccessRight;
  purchase: MyAccessPurchase;
}): BaseCard | null => {
  const title = {
    offerExternalId: purchase.offerExternalId,
    productExternalId: purchase.productExternalId,
  };
  const base = { id: `group:${purchase.id}`, title };

  if (!cohort) {
    // Without a cohort record only a recorded end tells whether it still runs.
    return primary.expiresAt && primary.expiresAt > now
      ? {
          ...base,
          calendar: { kind: "end", at: iso(primary.expiresAt) },
          status: { key: "group.until", values: { date: iso(primary.expiresAt) } },
          urgency: 1,
          sortAt: primary.expiresAt.getTime(),
        }
      : null;
  }

  if (cohort.accessEndsAt && cohort.accessEndsAt <= now) {
    return null;
  }

  if (cohort.closedAt && cohort.accessEndsAt) {
    return {
      ...base,
      calendar: { kind: "end", at: iso(cohort.accessEndsAt) },
      status: { key: "group.closed", values: { date: iso(cohort.accessEndsAt) } },
      urgency: 1,
      sortAt: cohort.accessEndsAt.getTime(),
    };
  }

  if (cohort.startsAt > now) {
    return {
      ...base,
      calendar: { kind: "start", at: iso(cohort.startsAt) },
      status: { key: "group.startsOn", values: { date: iso(cohort.startsAt) } },
      ...(isJoined(primary) ? {} : joinNote(primary)),
      urgency: isJoined(primary) ? 2 : 0,
      sortAt: cohort.startsAt.getTime(),
    };
  }

  return {
    ...base,
    // HUB-D50: each cohort has its own planned length.
    cycleWeek: {
      current: Math.min(
        cohort.durationWeeks,
        Math.floor((now.getTime() - cohort.startsAt.getTime()) / WEEK_MS) + 1,
      ),
      total: cohort.durationWeeks,
    },
    status: { key: "group.running" },
    ...(isJoined(primary) ? {} : joinNote(primary)),
    urgency: isJoined(primary) ? 1 : 0,
    sortAt: cohort.startsAt.getTime(),
  };
};

/** Choreo reviews and First Touch: N days from the first join. */
const buildTimedChannelCard = ({
  now,
  primary,
  purchase,
}: {
  now: Date;
  primary: MyAccessRight;
  purchase: MyAccessPurchase;
}): BaseCard | null => {
  const title = {
    offerExternalId: purchase.offerExternalId,
    productExternalId: purchase.productExternalId,
  };

  const days = getOfferAccessDurationDaysByOfferId(purchase.offerExternalId);

  if (primary.expiresAt) {
    return primary.expiresAt > now
      ? {
          id: `channel:${purchase.id}`,
          title,
          ...(days
            ? {
                period: {
                  end: iso(primary.expiresAt),
                  start: iso(new Date(primary.expiresAt.getTime() - days * DAY_MS)),
                },
              }
            : {}),
          calendar: { kind: "end", at: iso(primary.expiresAt) },
          status: { key: "channel.until", values: { date: iso(primary.expiresAt) } },
          note: { key: "daysLeft", values: { count: daysLeft(primary.expiresAt, now) } },
          urgency: 1,
          sortAt: primary.expiresAt.getTime(),
        }
      : null;
  }

  return {
    id: `channel:${purchase.id}`,
    title,
    status: days
      ? { key: "channel.startsOnJoin", values: { count: days } }
      : { key: "channel.paid" },
    ...joinNote(primary),
    urgency: 0,
    sortAt: purchase.succeededAt?.getTime() ?? 0,
  };
};

const kindOf = (statusKey: string): MyAccessCard["kind"] => {
  if (statusKey.startsWith("hub.") || statusKey.startsWith("plusHub.")) return "hub";
  if (statusKey.startsWith("group.")) return "group";
  if (statusKey === "lifetime") return "lifetime";
  return "channel";
};

/** The badge follows the card's state; the rules above stay the only source of it. */
const chipOf = (card: BaseCard, now: Date): MyAccessChip => {
  const key = card.status.key;

  if (key === "hub.ended") return "ended";
  if (key === "plusHub.closed" || key === "group.closed") return "endsSoon";
  // A running Hub can be renewed any time; only its last week is "ending soon".
  if (
    card.action?.key === "renewHub" &&
    (key !== "hub.activeUntil" ||
      (card.period &&
        daysLeft(new Date(card.period.end), now) <= HUB_RENEWAL_WINDOW_DAYS))
  ) {
    return "endsSoon";
  }
  if (key === "hub.scheduled" || key === "hub.afterCohort") {
    return "upcoming";
  }
  if (card.action?.key === "reissue" || card.action?.key === "support") {
    return "linkExpired";
  }
  if (card.urgency === 0) return "notJoined";
  if (key === "group.startsOn") return "upcoming";
  if (
    key === "channel.until" &&
    card.period &&
    daysLeft(new Date(card.period.end), now) <= HUB_RENEWAL_WINDOW_DAYS
  ) {
    return "endsSoon";
  }
  return "active";
};

const withPresentation = (card: BaseCard, now: Date): MyAccessCard => ({
  ...card,
  chip: chipOf(card, now),
  count: 1,
  kind: kindOf(card.status.key),
});

export const buildMyAccessCards = (
  snapshot: MyAccessSnapshot,
  now: Date,
  sales: MyAccessSales = ALL_OPEN,
): MyAccessCard[] => {
  const cohorts = new Map(snapshot.cohorts.map((cohort) => [cohort.id, cohort]));
  const rightsByPurchase = new Map<string, MyAccessRight[]>();

  for (const right of snapshot.rights) {
    if (isRevoked(right)) continue;
    rightsByPurchase.set(right.purchaseId, [
      ...(rightsByPurchase.get(right.purchaseId) ?? []),
      right,
    ]);
  }

  // One page is one customer: a standalone Hub period not over yet, or a Plus of a later
  // cohort, means the Hub goes on after a closed Plus — no renewal pitch on it.
  const hasHubAhead = snapshot.rights.some(
    (right) =>
      !isRevoked(right) &&
      right.sourceKind === "standalone_hub" &&
      (right.expiresAt === null || right.expiresAt > now),
  );
  const plusCohortStarts = snapshot.purchases.flatMap((purchase) => {
    const cohort = purchase.cohortId ? cohorts.get(purchase.cohortId) : undefined;
    return cohort && isOnlineGroupLibraryOfferId(purchase.offerExternalId)
      ? [cohort.startsAt.getTime()]
      : [];
  });
  const hubContinuesAfter = (cohort: MyAccessCohort | null) =>
    hasHubAhead ||
    (cohort !== null &&
      plusCohortStarts.some((start) => start > cohort.startsAt.getTime()));

  // A member of record of a cohort the renewal price is open to now: joined its chat
  // (the checkout still checks the membership on Telegram).
  const discountCohorts = new Set(snapshot.hubDiscountCohortIds ?? []);
  const isDiscountMember = snapshot.purchases.some((purchase) => {
    if (!purchase.cohortId || !discountCohorts.has(purchase.cohortId)) return false;
    const primary = rightsByPurchase
      .get(purchase.id)
      ?.find((right) => right.accessKey === "primary");
    return primary !== undefined && primary.status === "activated";
  });

  const cards: BaseCard[] = [];
  const hubGroups = new Map<string, MyAccessRight[]>();
  const plusHubIdentities = new Set<string>();

  for (const purchase of snapshot.purchases) {
    const rights = rightsByPurchase.get(purchase.id) ?? [];
    const primary = rights.find((right) => right.accessKey === "primary");
    const offerId = purchase.offerExternalId;

    if (isInspirationHubOfferId(offerId)) {
      const periods = rights.filter(
        (right) =>
          right.accessKey === "inspiration-hub" && right.sourceKind === "standalone_hub",
      );
      const groupId = purchase.telegramUserId ?? purchase.id;
      hubGroups.set(groupId, [...(hubGroups.get(groupId) ?? []), ...periods]);
      continue;
    }

    if (isOnlineGroupAccessOfferId(offerId)) {
      const cohort = purchase.cohortId ? (cohorts.get(purchase.cohortId) ?? null) : null;
      const groupCard = primary
        ? buildOnlineGroupCard({ cohort, now, primary, purchase })
        : null;
      if (groupCard) cards.push(groupCard);

      const hubRight = rights.find(
        (right) =>
          right.accessKey === "inspiration-hub" &&
          (right.sourceKind === null || right.sourceKind === "online_group"),
      );
      const plusHubCard = hubRight
        ? buildPlusHubCard({
            canRenewHub: sales.hubRenewal && isDiscountMember,
            cohort,
            hubContinues: hubContinuesAfter(cohort),
            now,
            purchase,
            right: hubRight,
          })
        : null;
      if (plusHubCard) {
        cards.push(plusHubCard);
        plusHubIdentities.add(purchase.telegramUserId ?? purchase.id);
      }
      continue;
    }

    if (!primary) continue;

    if (isChoreoChannelOfferId(offerId) || isFirstTouchOfferId(offerId)) {
      const card = buildTimedChannelCard({ now, primary, purchase });
      if (card) cards.push(card);
      continue;
    }

    if (isLifetimeChannelOfferId(offerId)) {
      cards.push({
        id: `lifetime:${purchase.id}`,
        title: {
          offerExternalId: offerId,
          productExternalId: purchase.productExternalId,
        },
        status: { key: "lifetime" },
        urgency: 1,
        sortAt: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  for (const [groupId, periods] of hubGroups) {
    if (periods.length === 0) continue;
    const card = buildStandaloneHubCard({
      groupId,
      hasPlusHub: plusHubIdentities.has(groupId),
      isDiscountMember,
      now,
      periods,
      sales,
    });
    if (card) cards.push(card);
  }

  // Identical cards (the same product bought and left unopened twice) read as one;
  // a folded «new link» asks for the first purchase's, one working invite is enough.
  const folded = new Map<string, MyAccessCard>();
  for (const card of cards.map((base) => withPresentation(base, now))) {
    const key = JSON.stringify([
      card.title,
      card.status,
      card.note,
      card.action && { href: card.action.href, key: card.action.key },
      card.chip,
    ]);
    const existing = folded.get(key);
    if (existing) existing.count += 1;
    else folded.set(key, card);
  }

  return [...folded.values()].sort(
    (a, b) => a.urgency - b.urgency || a.sortAt - b.sortAt,
  );
};
