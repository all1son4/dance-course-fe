import { createHash } from "node:crypto";

import { and, eq, isNull, or, sql } from "drizzle-orm";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";

import { normalizeEmail } from "./record-values";
import {
  accessEntitlements,
  customers,
  onlineGroupCohorts,
  productOffers,
  products,
  purchases,
} from "./schema";
import type { DatabaseTransaction } from "./transaction";

/*
 * Fills in the Online Group roster of closed cycles from Anna's registration sheet
 * (owner, 2026-11-19), one decision at a time, each approved by the owner:
 *  - a link: an admin offer link purchase that carries only a Telegram account gets
 *    the person's customer, email and name, as an invitation would have written;
 *  - a participation: someone who took part outside the site gets a purchase in the
 *    invitation's shape (`admin_offer_link`, amount 0, name, email, customer, cohort)
 *    with the primary right the other rows of that cycle have.
 * Closed cohorts only, so no access flow starts; nothing goes to the outbox; sales
 * and the revenue report read `stripe` purchases only. A row that already holds
 * other data is left alone and reported. Run it inside one transaction.
 */

export type RosterLink = {
  email: string;
  fullName: string;
  purchaseId: string;
  /** The Telegram account the purchase must carry: a guard against a wrong id. */
  telegramUserId: string;
};

export type RosterParticipation = {
  cohortTitle: string;
  email: string;
  fullName: string;
  /** When the person registered (the sheet's timestamp): the purchase's first sight. */
  registeredAt: string;
};

export type RosterDecisions = {
  links: RosterLink[];
  participations: RosterParticipation[];
};

export type RosterOutcome =
  "linked" | "already linked" | "created" | "already recorded" | `skipped: ${string}`;

export type RosterResult = {
  links: { purchaseId: string; outcome: RosterOutcome; customerId?: string }[];
  participations: {
    cohortTitle: string;
    email: string;
    outcome: RosterOutcome;
    customerId?: string;
    purchaseId?: string;
  }[];
  createdCustomerIds: string[];
};

const GROUP_PRODUCT_ID = SELLABLE_PRODUCTS["online-group-anna-strok"].id;
/** The first cycles sold one offer only; its row label is the one they carry. */
const STANDARD_OFFER_ID = "off_R6vN2cH9sW4y";
const PRODUCT_TITLE = "Online group by Anna Strok";
const OFFER_LABEL = "Online group";

/** Stable synthetic ids, so a rerun finds its own row; no email in the id. */
export const rosterPaymentIntentId = (cohortId: string, email: string) =>
  `adm_offer_pi_roster_${createHash("sha256")
    .update(`${cohortId}:${normalizeEmail(email)}`)
    .digest("hex")
    .slice(0, 24)}`;

/** The customer of an email: the earliest row, its empty name filled; else a new one. */
async function ensureCustomer(
  tx: DatabaseTransaction,
  { email, fullName, now }: { email: string; fullName: string; now: Date },
  created: string[],
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const [existing] = await tx
    .select({ fullName: customers.fullName, id: customers.id })
    .from(customers)
    .where(eq(customers.normalizedEmail, normalizedEmail))
    .orderBy(customers.createdAt)
    .limit(1);

  if (existing) {
    if (!existing.fullName?.trim()) {
      await tx
        .update(customers)
        .set({ fullName, updatedAt: now })
        .where(eq(customers.id, existing.id));
    }
    return existing.id;
  }

  const [inserted] = await tx
    .insert(customers)
    .values({ email: normalizedEmail, fullName, normalizedEmail, updatedAt: now })
    .returning({ id: customers.id });
  created.push(inserted!.id);
  return inserted!.id;
}

async function applyLink(
  tx: DatabaseTransaction,
  link: RosterLink,
  now: Date,
  created: string[],
): Promise<RosterResult["links"][number]> {
  const email = normalizeEmail(link.email);
  const fullName = link.fullName.trim();
  const result = (outcome: RosterOutcome, customerId?: string) => ({
    purchaseId: link.purchaseId,
    outcome,
    ...(customerId ? { customerId } : {}),
  });
  if (!email || !fullName) return result("skipped: email and name are required");

  const [row] = await tx
    .select({
      closedAt: onlineGroupCohorts.closedAt,
      customerId: purchases.customerId,
      email: purchases.customerEmailSnapshot,
      outcome: purchases.outcome,
      source: purchases.source,
      telegramUserId: purchases.telegramUserId,
    })
    .from(purchases)
    .leftJoin(
      onlineGroupCohorts,
      eq(onlineGroupCohorts.id, purchases.onlineGroupCohortId),
    )
    .where(eq(purchases.id, link.purchaseId))
    .for("update", { of: purchases });

  if (!row) return result("skipped: no such purchase");
  if (row.source !== "admin_offer_link" || row.outcome !== "succeeded")
    return result("skipped: not a succeeded admin offer link purchase");
  if (row.telegramUserId !== link.telegramUserId)
    return result("skipped: another Telegram account");
  if (!row.closedAt) return result("skipped: the cohort is not closed");

  if (row.customerId || row.email?.trim()) {
    const [owner] = row.customerId
      ? await tx
          .select({ email: customers.normalizedEmail })
          .from(customers)
          .where(eq(customers.id, row.customerId))
      : [];
    const same =
      normalizeEmail(row.email) === email &&
      (!row.customerId || normalizeEmail(owner?.email) === email);
    return same
      ? result("already linked", row.customerId ?? undefined)
      : result("skipped: already tied to someone else");
  }

  const customerId = await ensureCustomer(tx, { email, fullName, now }, created);
  await tx
    .update(purchases)
    .set({
      customerEmailSnapshot: email,
      customerFullNameSnapshot: sql`coalesce(nullif(btrim(${purchases.customerFullNameSnapshot}), ''), ${fullName})`,
      customerId,
      updatedAt: now,
    })
    .where(eq(purchases.id, link.purchaseId));
  await tx
    .update(accessEntitlements)
    .set({ customerId, updatedAt: now })
    .where(
      and(
        eq(accessEntitlements.purchaseId, link.purchaseId),
        isNull(accessEntitlements.customerId),
      ),
    );
  return result("linked", customerId);
}

async function applyParticipation(
  tx: DatabaseTransaction,
  participation: RosterParticipation,
  now: Date,
  created: string[],
): Promise<RosterResult["participations"][number]> {
  const email = normalizeEmail(participation.email);
  const fullName = participation.fullName.trim();
  const registeredAt = new Date(participation.registeredAt);
  const result = (
    outcome: RosterOutcome,
    ids: { customerId?: string; purchaseId?: string } = {},
  ) => ({ cohortTitle: participation.cohortTitle, email, outcome, ...ids });
  if (!email || !fullName) return result("skipped: email and name are required");
  if (Number.isNaN(registeredAt.getTime()))
    return result("skipped: no registration time");

  const [cohort] = await tx
    .select({ closedAt: onlineGroupCohorts.closedAt, id: onlineGroupCohorts.id })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.title, participation.cohortTitle));
  if (!cohort) return result("skipped: no such cohort");
  if (!cohort.closedAt) return result("skipped: the cohort is not closed");

  const paymentIntentId = rosterPaymentIntentId(cohort.id, email);
  // Serializes reruns of the same person and cycle.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${paymentIntentId}, 0))`,
  );
  const [own] = await tx
    .select({ customerId: purchases.customerId, id: purchases.id })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId));
  if (own) {
    return result("already recorded", {
      customerId: own.customerId ?? undefined,
      purchaseId: own.id,
    });
  }

  // Anyone already in that cycle under this email keeps what they have.
  const [owner] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.normalizedEmail, email));
  const [member] = await tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.onlineGroupCohortId, cohort.id),
        eq(purchases.outcome, "succeeded"),
        or(
          sql`lower(btrim(${purchases.customerEmailSnapshot})) = ${email}`,
          owner ? eq(purchases.customerId, owner.id) : undefined,
        ),
      ),
    )
    .limit(1);
  if (member) return result("skipped: already a member of this cohort");

  const [catalog] = await tx
    .select({ offerId: productOffers.id, productId: products.id })
    .from(productOffers)
    .innerJoin(products, eq(productOffers.productId, products.id))
    .where(
      and(
        eq(products.externalProductId, GROUP_PRODUCT_ID),
        eq(productOffers.externalOfferId, STANDARD_OFFER_ID),
      ),
    );
  if (!catalog) return result("skipped: the Standard offer is not in the catalogue");

  const customerId = await ensureCustomer(tx, { email, fullName, now }, created);
  const suffix = paymentIntentId.slice("adm_offer_pi_".length);
  const [purchase] = await tx
    .insert(purchases)
    .values({
      amountMinor: 0,
      checkoutSessionId: `adm_offer_cs_${suffix}`,
      currency: "eur",
      customerEmailSnapshot: email,
      customerFullNameSnapshot: fullName,
      customerId,
      firstSeenAt: registeredAt,
      latestEventId: `adm_offer_evt_${suffix}`,
      latestEventType: "admin.roster_backfill",
      livemode: false,
      offerExternalId: STANDARD_OFFER_ID,
      offerId: catalog.offerId,
      offerLabelSnapshot: OFFER_LABEL,
      onlineGroupCohortId: cohort.id,
      outcome: "succeeded",
      paymentIntentId,
      productExternalId: GROUP_PRODUCT_ID,
      productId: catalog.productId,
      productTitleSnapshot: PRODUCT_TITLE,
      purchaseItemSnapshot: `${PRODUCT_TITLE} — ${OFFER_LABEL}`,
      source: "admin_offer_link",
      stripeStatus: "succeeded",
      updatedAt: now,
    })
    .returning({ id: purchases.id });
  // The right the first cycle's other purchases carry: nothing to deliver any more.
  await tx.insert(accessEntitlements).values({
    accessKey: "primary",
    accessWorkflow: "manual-admin",
    customerId,
    deliveryChannel: "manual",
    externalTargetType: "manual",
    offerId: catalog.offerId,
    productId: catalog.productId,
    purchaseId: purchase!.id,
    status: "not_required",
    updatedAt: now,
  });
  return result("created", { customerId, purchaseId: purchase!.id });
}

export async function backfillOnlineGroupRoster(
  tx: DatabaseTransaction,
  decisions: RosterDecisions,
  now = new Date(),
): Promise<RosterResult> {
  const createdCustomerIds: string[] = [];
  const links = [];
  for (const link of decisions.links) {
    links.push(await applyLink(tx, link, now, createdCustomerIds));
  }
  const participations = [];
  for (const participation of decisions.participations) {
    participations.push(
      await applyParticipation(tx, participation, now, createdCustomerIds),
    );
  }
  return { createdCustomerIds, links, participations };
}
