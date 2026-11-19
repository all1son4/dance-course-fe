import {
  and,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import type { MyAccessSnapshot } from "@/lib/my-access/cards";
import type { MyAccessNextCohort } from "@/lib/my-access/next-step";

import { listHubDiscountCohorts } from "./hub-discount";
import { normalizeEmail } from "./record-values";
import {
  accessEntitlements,
  customers,
  onlineGroupCohorts,
  purchases,
  renewalCampaigns,
  renewalCampaignSourceChats,
  telegramAccessTokens,
} from "./schema";
import type { DatabaseExecutor } from "./transaction";

/*
 * Read-only queries of «Мой доступ» (HUB-D28). A customer's purchases are the ones
 * tied to the customer row or, for older rows without that tie, to the same email.
 */

const purchaseOfCustomer = (customerId: string, normalizedEmail: string) =>
  or(
    eq(purchases.customerId, customerId),
    normalizedEmail
      ? sql`lower(trim(${purchases.customerEmailSnapshot})) = ${normalizedEmail}`
      : undefined,
  );

/** The customer behind an email, only if it has at least one successful purchase. */
export async function findMyAccessCustomerIdByEmail(
  database: DatabaseExecutor,
  email: string,
): Promise<string | null> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const [customer] = await database
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.normalizedEmail, normalizedEmail))
    .limit(1);
  if (!customer) return null;

  const [purchase] = await database
    .select({ id: purchases.id })
    .from(purchases)
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        purchaseOfCustomer(customer.id, normalizedEmail),
      ),
    )
    .limit(1);

  return purchase ? customer.id : null;
}

/** The customer of one purchase: its own tie, else the customer with its email. */
export async function findMyAccessCustomerIdForPaymentIntent(
  database: DatabaseExecutor,
  paymentIntentId: string,
): Promise<string | null> {
  const [purchase] = await database
    .select({ customerId: purchases.customerId, email: purchases.customerEmailSnapshot })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId))
    .limit(1);
  if (!purchase) return null;
  if (purchase.customerId) return purchase.customerId;

  const normalizedEmail = normalizeEmail(purchase.email);
  if (!normalizedEmail) return null;

  const [customer] = await database
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.normalizedEmail, normalizedEmail))
    .limit(1);

  return customer?.id ?? null;
}

/** Everything the cards need, or null when the customer no longer exists. */
export async function readMyAccessSnapshot(
  database: DatabaseExecutor,
  customerId: string,
): Promise<MyAccessSnapshot | null> {
  const [customer] = await database
    .select({ fullName: customers.fullName, normalizedEmail: customers.normalizedEmail })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) return null;

  const purchaseRows = await database
    .select({
      cohortId: purchases.onlineGroupCohortId,
      id: purchases.id,
      offerExternalId: purchases.offerExternalId,
      productExternalId: purchases.productExternalId,
      succeededAt: purchases.succeededAt,
      telegramUserId: purchases.telegramUserId,
    })
    .from(purchases)
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        purchaseOfCustomer(customerId, normalizeEmail(customer.normalizedEmail)),
      ),
    )
    .orderBy(purchases.succeededAt);

  const ids = purchaseRows.map((row) => row.id);
  const cohortIds = [
    ...new Set(purchaseRows.flatMap((row) => (row.cohortId ? [row.cohortId] : []))),
  ];
  // Cycles given through an admin offer link carry no customer and no email, only
  // the Telegram account the bot saw: those of the customer's own purchases.
  const telegramUserIds = [
    ...new Set(
      purchaseRows.flatMap((row) => (row.telegramUserId ? [row.telegramUserId] : [])),
    ),
  ];
  const [rights, cohorts, tokens, discountCohorts, telegramCycles, [firstCohort]] =
    await Promise.all([
      ids.length
        ? database
            .select({
              id: accessEntitlements.id,
              telegramChatId: accessEntitlements.telegramChatId,
              accessKey: accessEntitlements.accessKey,
              accessWorkflow: accessEntitlements.accessWorkflow,
              expiresAt: accessEntitlements.expiresAt,
              purchaseId: accessEntitlements.purchaseId,
              revokedAt: accessEntitlements.revokedAt,
              sourceKind: accessEntitlements.sourceKind,
              startsAt: accessEntitlements.startsAt,
              status: accessEntitlements.status,
            })
            .from(accessEntitlements)
            .where(inArray(accessEntitlements.purchaseId, ids))
        : Promise.resolve([]),
      cohortIds.length
        ? database
            .select({
              accessEndsAt: onlineGroupCohorts.accessEndsAt,
              closedAt: onlineGroupCohorts.closedAt,
              durationWeeks: onlineGroupCohorts.durationWeeks,
              id: onlineGroupCohorts.id,
              startsAt: onlineGroupCohorts.startsAt,
              title: onlineGroupCohorts.title,
            })
            .from(onlineGroupCohorts)
            .where(inArray(onlineGroupCohorts.id, cohortIds))
        : Promise.resolve([]),
      ids.length
        ? database
            .select({
              chatId: telegramAccessTokens.chatId,
              entitlementId: telegramAccessTokens.entitlementId,
              expiresAt: telegramAccessTokens.expiresAt,
              purchaseId: telegramAccessTokens.purchaseId,
              status: telegramAccessTokens.status,
            })
            .from(telegramAccessTokens)
            .where(inArray(telegramAccessTokens.purchaseId, ids))
        : Promise.resolve([]),
      // The cohorts whose members get the Hub renewal price now, by the checkout's rule.
      listHubDiscountCohorts(database, new Date()),
      telegramUserIds.length
        ? database
            .select({ id: onlineGroupCohorts.id })
            .from(purchases)
            .innerJoin(
              onlineGroupCohorts,
              eq(onlineGroupCohorts.id, purchases.onlineGroupCohortId),
            )
            .where(
              and(
                eq(purchases.outcome, "succeeded"),
                inArray(purchases.telegramUserId, telegramUserIds),
                isNotNull(onlineGroupCohorts.closedAt),
              ),
            )
        : Promise.resolve([]),
      // The first cycle (May–June 2026) has no cohort record: its purchases predate it.
      database
        .select({ startsAt: sql<Date | null>`min(${onlineGroupCohorts.startsAt})` })
        .from(onlineGroupCohorts),
    ]);
  const now = Date.now();
  // An invite still usable: issued, not expired. Older tokens may lack the right's id
  // and are matched by purchase and chat instead.
  const hasLiveInvite = (right: (typeof rights)[number]) =>
    tokens.some(
      (token) =>
        token.status === "issued" &&
        token.expiresAt.getTime() > now &&
        (token.entitlementId === right.id ||
          (token.entitlementId === null &&
            token.purchaseId === right.purchaseId &&
            (!token.chatId || token.chatId === right.telegramChatId))),
    );

  return {
    closedCohortIdsOfTelegram: [...new Set(telegramCycles.map((cycle) => cycle.id))],
    firstCohortStartsAt: firstCohort?.startsAt ? new Date(firstCohort.startsAt) : null,
    cohorts,
    customerFullName: customer.fullName,
    hubDiscountCohortIds: discountCohorts.map((cohort) => cohort.id),
    purchases: purchaseRows.map((row) => ({
      ...row,
      offerExternalId: row.offerExternalId ?? "",
      productExternalId: row.productExternalId ?? "",
    })),
    rights: rights.map((right) => ({
      accessKey: right.accessKey,
      accessWorkflow: right.accessWorkflow,
      expiresAt: right.expiresAt,
      hasLiveInvite: hasLiveInvite(right),
      purchaseId: right.purchaseId ?? "",
      revokedAt: right.revokedAt,
      sourceKind: right.sourceKind,
      startsAt: right.startsAt,
      status: right.status,
    })),
  };
}

/**
 * «Дальше»: the cycle sold through `mainChatId` and the active renewal campaigns into
 * it from the main chats of the customer's cycles (the links of the closure post).
 */
export async function readMyAccessNextCohort(
  database: DatabaseExecutor,
  { cohortIds, mainChatId, now }: { cohortIds: string[]; mainChatId: string; now: Date },
): Promise<MyAccessNextCohort | null> {
  const [cohort] = await database
    .select({
      durationWeeks: onlineGroupCohorts.durationWeeks,
      id: onlineGroupCohorts.id,
      startsAt: onlineGroupCohorts.startsAt,
    })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.mainChatId, mainChatId))
    .limit(1);
  if (!cohort) return null;

  const memberChats = database
    .select({ chatId: onlineGroupCohorts.mainChatId })
    .from(onlineGroupCohorts)
    .where(inArray(onlineGroupCohorts.id, cohortIds));
  const renewalCampaignRows = cohortIds.length
    ? await database
        .select({
          offerExternalId: renewalCampaigns.offerExternalId,
          productExternalId: renewalCampaigns.productExternalId,
          slug: renewalCampaigns.slug,
        })
        .from(renewalCampaigns)
        .where(
          and(
            eq(renewalCampaigns.status, "active"),
            eq(renewalCampaigns.targetChatId, mainChatId),
            or(isNull(renewalCampaigns.expiresAt), gt(renewalCampaigns.expiresAt, now)),
            exists(
              database
                .select({ id: renewalCampaignSourceChats.id })
                .from(renewalCampaignSourceChats)
                .where(
                  and(
                    eq(renewalCampaignSourceChats.campaignId, renewalCampaigns.id),
                    inArray(renewalCampaignSourceChats.chatId, memberChats),
                  ),
                ),
            ),
          ),
        )
        .orderBy(desc(renewalCampaigns.createdAt))
    : [];

  return { ...cohort, renewalCampaigns: renewalCampaignRows };
}
