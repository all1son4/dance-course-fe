import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { MyAccessSnapshot } from "@/lib/my-access/cards";

import { normalizeEmail } from "./record-values";
import { accessEntitlements, customers, onlineGroupCohorts, purchases } from "./schema";
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
    .select({ normalizedEmail: customers.normalizedEmail })
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
  const [rights, cohorts] = await Promise.all([
    ids.length
      ? database
          .select({
            accessKey: accessEntitlements.accessKey,
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
            id: onlineGroupCohorts.id,
            startsAt: onlineGroupCohorts.startsAt,
          })
          .from(onlineGroupCohorts)
          .where(inArray(onlineGroupCohorts.id, cohortIds))
      : Promise.resolve([]),
  ]);

  return {
    cohorts,
    purchases: purchaseRows.map((row) => ({
      ...row,
      offerExternalId: row.offerExternalId ?? "",
      productExternalId: row.productExternalId ?? "",
    })),
    rights: rights.map((right) => ({ ...right, purchaseId: right.purchaseId ?? "" })),
  };
}
