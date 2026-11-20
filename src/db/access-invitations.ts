import { randomBytes } from "node:crypto";

import { and, desc, eq, inArray, isNull, like, lte, or, sql } from "drizzle-orm";

import {
  INSPIRATION_HUB_PRODUCT_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";

import { getDatabase } from "./client";
import {
  hasActiveStandaloneHub,
  listHubDiscountCohorts,
  listPlusCohortIdsOf,
} from "./hub-discount";
import { lockHubPeriodOwner } from "./hub-period-chain-resolution";
import { retryHubPeriodChainTransaction } from "./hub-period-chain-retry";
import {
  ensureHubPurchaseAccessInTransaction,
  type PurchaseOwnerWrite,
  recordOnlineGroupPurchaseSourceInTransaction,
} from "./purchase-access-source";
import { normalizeEmail } from "./record-values";
import {
  accessEntitlements,
  customers,
  onlineGroupCohorts,
  productOffers,
  products,
  purchases,
  purchaseSideEffects,
  telegramAccessTokens,
  telegramChats,
  telegramUserBindings,
} from "./schema";
import type { DatabaseExecutor, DatabaseTransaction } from "./transaction";

/** An executor that also runs raw SQL: the database or an open transaction. */
type SqlExecutor = DatabaseExecutor & Pick<ReturnType<typeof getDatabase>, "execute">;

/*
 * Admin invitations (Online Group Standard/Plus and the Hub on its own): a purchase
 * with `source = 'admin_offer_link'`, amount 0 and the person's name, email and
 * language, so the invited person counts in the cohort, gets «Мой доступ» and the
 * future broadcasts, while sales and the revenue report keep reading Stripe only.
 */

export type InvitationKind = "join" | "renewal";
export type InvitationLocale = "ru" | "pl" | "en";

type Purchase = typeof purchases.$inferSelect;

const ONLINE_GROUP_PRODUCT_ID = SELLABLE_PRODUCTS["online-group-anna-strok"].id;

/** The email job keys of one invitation; one invitation email per send, one links email. */
export const invitationEmailKeyPrefix = (purchaseId: string) =>
  `access-invitation:${purchaseId}:`;

const syntheticId = (prefix: string) => `${prefix}${randomBytes(12).toString("hex")}`;

const inFreshTransaction = <Result>(run: (tx: DatabaseTransaction) => Promise<Result>) =>
  retryHubPeriodChainTransaction(() =>
    getDatabase().transaction(run, { isolationLevel: "read committed" }),
  );

/* ---------- Before issuing ---------- */

export type InvitationContactHint = {
  known: boolean;
  locale: InvitationLocale | null;
};

/** What the base knows of an address: the language of its latest purchase, if any. */
export async function findInvitationContactHint(
  email: string,
  database: DatabaseExecutor = getDatabase(),
): Promise<InvitationContactHint> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { known: false, locale: null };

  const [latest] = await database
    .select({ locale: purchases.checkoutLocale })
    .from(purchases)
    .where(
      and(
        eq(purchases.outcome, "succeeded"),
        sql`lower(btrim(${purchases.customerEmailSnapshot})) = ${normalizedEmail}`,
      ),
    )
    .orderBy(desc(sql`coalesce(${purchases.succeededAt}, ${purchases.firstSeenAt})`))
    .limit(1);

  return { known: Boolean(latest), locale: latest?.locale ?? null };
}

export type InvitationDuplicate = "cohort" | "hub";

/**
 * What this address already has: a successful purchase in the cohort, or a Hub that
 * runs right now (a standalone period or the Hub of a Plus).
 */
export async function findInvitationDuplicates(
  {
    cohortId,
    email,
    now = new Date(),
  }: { cohortId: string | null; email: string; now?: Date },
  database: SqlExecutor = getDatabase(),
): Promise<InvitationDuplicate[]> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const [row] = await database.execute<{ cohort: boolean; hub: boolean }>(sql`
    SELECT
      ${
        cohortId
          ? sql`EXISTS (
              SELECT 1 FROM purchases purchase
              WHERE purchase.outcome = 'succeeded'
                AND purchase.online_group_cohort_id = ${cohortId}
                AND lower(btrim(purchase.customer_email_snapshot)) = ${normalizedEmail}
            )`
          : sql`false`
      } AS cohort,
      EXISTS (
        SELECT 1
        FROM access_entitlements entitlement
        JOIN purchases purchase ON purchase.id = entitlement.purchase_id
        WHERE entitlement.access_key = 'inspiration-hub'
          AND entitlement.revoked_at IS NULL
          AND entitlement.status NOT IN ('expired', 'revoked')
          AND (entitlement.expires_at IS NULL OR entitlement.expires_at > ${now.toISOString()}::timestamptz)
          AND purchase.outcome = 'succeeded'
          AND lower(btrim(purchase.customer_email_snapshot)) = ${normalizedEmail}
      ) AS hub
  `);

  return [
    ...(row?.cohort ? (["cohort"] as const) : []),
    ...(row?.hub ? (["hub"] as const) : []),
  ];
}

/* ---------- Issuing ---------- */

export type CreateAccessInvitationCommand = {
  /** The Online Group (into a cohort) or the Hub on its own. */
  scope: "group" | "hub";
  kind: InvitationKind;
  productExternalId: string;
  offerExternalId: string;
  productTitle: string;
  offerLabel: string;
  accessWorkflow: string;
  /** The cohort and its chats; null for the Hub. */
  cohortId: string | null;
  mainChatId: string | null;
  inspirationChatId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  locale: InvitationLocale;
  note: string;
  livemode: boolean;
  now: Date;
};

/**
 * Ties the invitation to the customer of this address, creating one if needed. An
 * existing customer keeps what the payments wrote; only an empty name is filled.
 */
async function ensureInvitationCustomer(
  tx: DatabaseTransaction,
  { email, fullName, now }: { email: string; fullName: string; now: Date },
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const [existing] = await tx
    .select({ id: customers.id, fullName: customers.fullName })
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
    .values({ email: normalizedEmail, normalizedEmail, fullName, updatedAt: now })
    .returning({ id: customers.id });

  if (!inserted) throw new Error("access_invitation_customer_not_created");
  return inserted.id;
}

/**
 * Writes the invitation and what it gives at once: the cohort of a group invitation
 * (both kinds), the Hub period of a Hub joining (from today, or «extended» for
 * someone already in the Hub). A Hub renewal gets its period at the Telegram check.
 * Requires the offer in the catalogue, not an open sale: closed sales still admit.
 */
export async function createAccessInvitationInDatabase(
  command: CreateAccessInvitationCommand,
): Promise<{ purchaseId: string; paymentIntentId: string }> {
  const fullName = [command.firstName, command.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const email = normalizeEmail(command.email);
  const isHub = command.scope === "hub";
  const paymentIntentId = syntheticId("adm_offer_pi_");

  if (!fullName || !email) throw new Error("access_invitation_contact_required");
  if (!isHub && !command.cohortId) throw new Error("access_invitation_cohort_required");

  return inFreshTransaction(async (tx) => {
    const [catalog] = await tx
      .select({ offerId: productOffers.id, productId: products.id })
      .from(productOffers)
      .innerJoin(products, eq(productOffers.productId, products.id))
      .where(
        and(
          eq(productOffers.externalOfferId, command.offerExternalId),
          eq(productOffers.isActive, true),
          eq(products.externalProductId, command.productExternalId),
          eq(products.isActive, true),
        ),
      )
      .limit(1);

    if (!catalog) throw new Error("access_invitation_catalog_selection_not_found");

    const customerId = await ensureInvitationCustomer(tx, {
      email,
      fullName,
      now: command.now,
    });
    const startsNow = !(isHub && command.kind === "renewal");
    const [purchase] = await tx
      .insert(purchases)
      .values({
        adminNote: command.note.trim() || null,
        amountMinor: 0,
        checkoutCurrency: command.locale === "en" ? "eur" : "pln",
        checkoutLocale: command.locale,
        checkoutSessionId: syntheticId("adm_offer_cs_"),
        currency: command.locale === "en" ? "eur" : "pln",
        customerEmailSnapshot: email,
        customerFullNameSnapshot: fullName,
        customerId,
        firstSeenAt: command.now,
        inspirationChatIdSnapshot: command.inspirationChatId,
        invitationKind: command.kind,
        latestEventId: syntheticId("adm_offer_evt_"),
        latestEventType: "admin.invitation.created",
        lessonLanguage: command.locale === "en" ? "en" : "ru",
        livemode: command.livemode,
        offerExternalId: command.offerExternalId,
        offerId: catalog.offerId,
        offerLabelSnapshot: command.offerLabel,
        outcome: "succeeded",
        paymentIntentId,
        productExternalId: command.productExternalId,
        productId: catalog.productId,
        productTitleSnapshot: command.productTitle,
        purchaseItemSnapshot: `${command.productTitle} · ${command.offerLabel}`,
        source: "admin_offer_link",
        stripeStatus: "succeeded",
        // The Hub of a renewal starts when the person confirms Telegram.
        succeededAt: startsNow ? command.now : null,
        updatedAt: command.now,
      })
      .returning({ id: purchases.id });

    if (!purchase) throw new Error("access_invitation_purchase_not_created");

    await tx.insert(accessEntitlements).values({
      accessKey: "primary",
      accessWorkflow: command.accessWorkflow,
      customerId,
      deliveryChannel: "telegram",
      externalTargetType: "telegram_chat",
      offerId: catalog.offerId,
      productId: catalog.productId,
      purchaseId: purchase.id,
      status: "pending",
      telegramChatId: command.mainChatId,
      updatedAt: command.now,
    });

    if (command.cohortId) {
      await recordOnlineGroupPurchaseSourceInTransaction(tx, {
        purchaseId: purchase.id,
        cohortId: command.cohortId,
        verifiedTelegramUserId: null,
        processedAt: command.now,
      });
    } else if (command.kind === "join") {
      await ensureHubPurchaseAccessInTransaction(tx, {
        purchaseId: purchase.id,
        verifiedTelegramUserId: null,
        continuationCohortId: null,
        processedAt: command.now,
      });
    }

    return { purchaseId: purchase.id, paymentIntentId };
  });
}

/* ---------- Reading one ---------- */

export type AccessInvitationRecord = Purchase & {
  cohortTitle: string | null;
  cohortStartsAt: Date | null;
};

/** One invitation by its purchase id; null for anything that is not an invitation. */
export async function readAccessInvitation(
  purchaseId: string,
  database: DatabaseExecutor = getDatabase(),
): Promise<AccessInvitationRecord | null> {
  const [row] = await database
    .select({
      purchase: purchases,
      cohortTitle: onlineGroupCohorts.title,
      cohortStartsAt: onlineGroupCohorts.startsAt,
    })
    .from(purchases)
    .leftJoin(
      onlineGroupCohorts,
      eq(onlineGroupCohorts.id, purchases.onlineGroupCohortId),
    )
    .where(eq(purchases.id, purchaseId))
    .limit(1);

  if (
    !row ||
    row.purchase.source !== "admin_offer_link" ||
    !row.purchase.invitationKind
  ) {
    return null;
  }

  return {
    ...row.purchase,
    cohortTitle: row.cohortTitle,
    cohortStartsAt: row.cohortStartsAt,
  };
}

/* ---------- The Telegram check of a renewal ---------- */

/**
 * The cohort a renewed Hub follows, by the rules of the Hub special price (HUB-D17,
 * HUB-D36) with the database in place of the chat check: a running paid Hub takes
 * the chain itself; else a just-ended cohort where this account had Plus; else the
 * latest cohort where it has a purchase. Otherwise the 8 weeks count from today.
 */
async function findInvitationHubContinuationCohortId(
  tx: DatabaseTransaction,
  { now, telegramUserId }: { now: Date; telegramUserId: string },
): Promise<string | null> {
  if (await hasActiveStandaloneHub(tx, { checkedAt: now, telegramUserId })) return null;

  const cohorts = await listHubDiscountCohorts(tx, now);
  if (cohorts.length === 0) return null;

  const plusCohortIds = await listPlusCohortIdsOf(tx, {
    cohortIds: cohorts.filter((cohort) => cohort.ended).map((cohort) => cohort.id),
    telegramUserId,
  });
  const endedPlus = cohorts.find((cohort) => plusCohortIds.has(cohort.id));
  if (endedPlus) return endedPlus.id;

  const owned = await tx
    .select({ cohortId: purchases.onlineGroupCohortId })
    .from(purchases)
    .where(
      and(
        inArray(
          purchases.onlineGroupCohortId,
          cohorts.map((cohort) => cohort.id),
        ),
        eq(purchases.outcome, "succeeded"),
        eq(purchases.telegramUserId, telegramUserId),
      ),
    );
  const ownedIds = new Set(owned.map((row) => row.cohortId));

  return cohorts.find((cohort) => ownedIds.has(cohort.id))?.id ?? null;
}

/**
 * Names the confirmed account on a renewal invitation and gives what waited for it:
 * the Plus Hub bridge of a group renewal, the Hub period of a Hub renewal. The owner
 * goes only into an empty field; another account answers "mismatch" and writes
 * nothing. Idempotent: a repeat answers "unchanged" and returns the stored state.
 */
export async function confirmInvitationTelegramInDatabase({
  now = new Date(),
  purchaseId,
  telegramUserId,
}: {
  now?: Date;
  purchaseId: string;
  telegramUserId: string;
}): Promise<PurchaseOwnerWrite> {
  return inFreshTransaction(async (tx) => {
    await lockHubPeriodOwner(tx, telegramUserId);
    const [purchase] = await tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, purchaseId))
      .for("update");

    if (
      !purchase ||
      purchase.source !== "admin_offer_link" ||
      purchase.invitationKind !== "renewal" ||
      purchase.outcome !== "succeeded"
    ) {
      throw new Error("access_invitation_not_found");
    }
    if (purchase.telegramUserId !== null && purchase.telegramUserId !== telegramUserId) {
      return "mismatch";
    }

    if (purchase.onlineGroupCohortId) {
      const write = await recordOnlineGroupPurchaseSourceInTransaction(tx, {
        purchaseId,
        cohortId: purchase.onlineGroupCohortId,
        verifiedTelegramUserId: telegramUserId,
        processedAt: now,
      });
      return write ?? "unchanged";
    }

    if (purchase.succeededAt === null) {
      await tx
        .update(purchases)
        .set({ succeededAt: now, updatedAt: now })
        .where(eq(purchases.id, purchaseId));
    }

    const access = await ensureHubPurchaseAccessInTransaction(tx, {
      purchaseId,
      verifiedTelegramUserId: telegramUserId,
      continuationCohortId:
        purchase.succeededAt === null
          ? await findInvitationHubContinuationCohortId(tx, { now, telegramUserId })
          : null,
      processedAt: now,
    });

    return access.ownerWrite ?? "unchanged";
  });
}

/* ---------- Traces of delivery ---------- */

/**
 * The access service failed for these accesses of an invitation: their rights that
 * still wait for a link say `link_failed`, as a failed Telegram invite does, so the
 * journal shows «не удалось создать ссылку». The next successful link replaces it.
 */
export async function markInvitationAccessFailed({
  accessKeys,
  now = new Date(),
  purchaseId,
}: {
  accessKeys: ("inspiration-hub" | "main-group")[];
  now?: Date;
  purchaseId: string;
}): Promise<void> {
  const keys = accessKeys.map((key) => (key === "main-group" ? "primary" : key));
  if (keys.length === 0) return;

  await getDatabase()
    .update(accessEntitlements)
    .set({ status: "link_failed", updatedAt: now })
    .where(
      and(
        eq(accessEntitlements.purchaseId, purchaseId),
        inArray(accessEntitlements.accessKey, keys),
        inArray(accessEntitlements.status, ["pending", "link_failed"]),
        isNull(accessEntitlements.revokedAt),
        // A Hub period not begun stays `pending`: the start-day job gives its link.
        or(isNull(accessEntitlements.startsAt), lte(accessEntitlements.startsAt, now)),
      ),
    );
}

/** How many links emails of an invitation were queued since a moment (sent or not). */
export async function countRecentInvitationLinkEmails({
  purchaseId,
  since,
}: {
  purchaseId: string;
  since: Date;
}): Promise<number> {
  const [row] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseSideEffects)
    .where(
      and(
        eq(purchaseSideEffects.kind, "access_invitation_email"),
        like(
          purchaseSideEffects.deduplicationKey,
          `${invitationEmailKeyPrefix(purchaseId)}links%`,
        ),
        sql`${purchaseSideEffects.createdAt} >= ${since.toISOString()}::timestamptz`,
      ),
    );

  return row?.count ?? 0;
}

/* ---------- The journal ---------- */

/**
 * One access as the journal says it: no link yet, a link not used (until its date),
 * in the chat now, left it, the link expired, revoked, or creating it failed.
 */
export type InvitationAccessState =
  "expired" | "failed" | "issued" | "left" | "member" | "pending" | "revoked";

export type InvitationJournalAccess = {
  accessKey: "inspiration-hub" | "main-group";
  accessUrl: string;
  chatTitle: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  state: InvitationAccessState;
  /** In the chat by this invitation's own link; false: was there already (a Hub extended). */
  joinedByLink: boolean;
  tokenExpiresAt: Date | null;
};

export type InvitationJournalEmail = {
  key: string;
  status: typeof purchaseSideEffects.$inferSelect.status;
  sentAt: Date | null;
  createdAt: Date;
};

export type InvitationJournalEntry = {
  purchaseId: string;
  paymentIntentId: string;
  /** null for a manual access issued before invitations (a label only). */
  kind: InvitationKind | null;
  offerExternalId: string;
  offerLabel: string;
  fullName: string;
  email: string;
  locale: InvitationLocale | null;
  note: string;
  createdAt: Date;
  revoked: boolean;
  /** «Убрать из журнала» by hand; null while it stays in the journal. */
  archivedAt: Date | null;
  /** The account is known: confirmed on the renewal page, or met at the first join. */
  telegramConfirmed: boolean;
  cohortTitle: string | null;
  accesses: InvitationJournalAccess[];
  emails: InvitationJournalEmail[];
};

const resolveAccessState = (
  entitlementStatus: string,
  token: { status: string; expiresAt: Date } | null,
  now: Date,
): InvitationAccessState => {
  if (entitlementStatus === "left_channel") return "left";
  if (entitlementStatus === "link_failed") return "failed";
  if (entitlementStatus === "expired") return "expired";
  if (entitlementStatus === "revoked") return "revoked";
  // In the chat by our record (a join, or found there by a live check).
  if (entitlementStatus === "activated") return "member";
  if (token?.status === "issued") return token.expiresAt > now ? "issued" : "expired";
  if (token?.status === "used") return "member";
  if (token?.status === "expired") return "expired";
  if (token?.status === "revoked") return "revoked";
  return "pending";
};

/**
 * The latest invitations of one place: the Online Group (with its manual accesses
 * from before invitations, which show their label) or the Hub.
 */
export async function listAccessInvitations({
  limit = 60,
  scope,
  productExternalId = scope === "hub"
    ? INSPIRATION_HUB_PRODUCT_ID
    : ONLINE_GROUP_PRODUCT_ID,
}: {
  limit?: number;
  scope: "group" | "hub";
  /** The catalogue product of the place; its default is the real one. */
  productExternalId?: string;
}): Promise<InvitationJournalEntry[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      purchase: purchases,
      cohortTitle: onlineGroupCohorts.title,
    })
    .from(purchases)
    .leftJoin(
      onlineGroupCohorts,
      eq(onlineGroupCohorts.id, purchases.onlineGroupCohortId),
    )
    .where(
      and(
        eq(purchases.source, "admin_offer_link"),
        eq(purchases.productExternalId, productExternalId),
      ),
    )
    .orderBy(desc(purchases.firstSeenAt))
    .limit(Math.max(1, Math.min(limit, 100)));

  if (rows.length === 0) return [];

  const purchaseIds = rows.map((row) => row.purchase.id);
  const [accessRows, emailRows] = await Promise.all([
    db
      .select({
        accessKey: accessEntitlements.accessKey,
        chatId: accessEntitlements.telegramChatId,
        entitlementStatus: accessEntitlements.status,
        expiresAt: accessEntitlements.expiresAt,
        purchaseId: accessEntitlements.purchaseId,
        startsAt: accessEntitlements.startsAt,
        tokenChatId: telegramAccessTokens.chatId,
        tokenExpiresAt: telegramAccessTokens.expiresAt,
        tokenStatus: telegramAccessTokens.status,
        tokenValue: telegramAccessTokens.tokenValue,
      })
      .from(accessEntitlements)
      .leftJoin(
        telegramAccessTokens,
        eq(accessEntitlements.currentTokenId, telegramAccessTokens.tokenId),
      )
      .where(
        and(
          inArray(accessEntitlements.purchaseId, purchaseIds),
          inArray(accessEntitlements.accessKey, ["primary", "inspiration-hub"]),
        ),
      ),
    db
      .select({
        key: purchaseSideEffects.deduplicationKey,
        status: purchaseSideEffects.status,
        sentAt: purchaseSideEffects.sentAt,
        createdAt: purchaseSideEffects.createdAt,
      })
      .from(purchaseSideEffects)
      .where(
        and(
          eq(purchaseSideEffects.kind, "access_invitation_email"),
          or(
            ...purchaseIds.map((id) =>
              like(
                purchaseSideEffects.deduplicationKey,
                `${invitationEmailKeyPrefix(id)}%`,
              ),
            ),
          ),
        ),
      )
      .orderBy(purchaseSideEffects.createdAt),
  ]);
  const chatIds = [
    ...new Set(
      accessRows
        .map((row) => (row.chatId ?? row.tokenChatId ?? "").trim())
        .filter(Boolean),
    ),
  ];
  const chatRows = chatIds.length
    ? await db
        .select({ chatId: telegramChats.chatId, title: telegramChats.title })
        .from(telegramChats)
        .where(inArray(telegramChats.chatId, chatIds))
    : [];
  const chatTitleById = new Map(chatRows.map((chat) => [chat.chatId, chat.title]));

  const now = new Date();
  return rows.map(({ purchase, cohortTitle }) => {
    const isHub = scope === "hub";
    const accesses = accessRows
      .filter((row) => row.purchaseId === purchase.id)
      // A Hub purchase's own access is its Hub right; its `primary` carries no chat.
      .filter((row) => !(isHub && row.accessKey === "primary"))
      .map((row): InvitationJournalAccess => {
        const chatId = (row.chatId ?? row.tokenChatId ?? "").trim();
        return {
          accessKey:
            row.accessKey === "inspiration-hub" ? "inspiration-hub" : "main-group",
          accessUrl: row.tokenValue?.trim() ?? "",
          chatTitle: chatTitleById.get(chatId) ?? "",
          startsAt: row.startsAt,
          expiresAt: row.expiresAt,
          state: resolveAccessState(
            row.entitlementStatus,
            row.tokenStatus && row.tokenExpiresAt
              ? { status: row.tokenStatus, expiresAt: row.tokenExpiresAt }
              : null,
            now,
          ),
          joinedByLink: row.tokenStatus === "used",
          tokenExpiresAt: row.tokenExpiresAt,
        };
      })
      .sort(
        (left, right) =>
          Number(right.accessKey === "main-group") -
          Number(left.accessKey === "main-group"),
      );

    return {
      purchaseId: purchase.id,
      paymentIntentId: purchase.paymentIntentId,
      kind: purchase.invitationKind ?? null,
      offerExternalId: purchase.offerExternalId ?? "",
      offerLabel: purchase.offerLabelSnapshot ?? "",
      // Manual accesses before invitations kept their label in the Telegram field.
      fullName:
        purchase.customerFullNameSnapshot?.trim() ||
        purchase.customerTelegramUsernameSnapshot?.trim() ||
        purchase.purchaseItemSnapshot?.trim() ||
        "Без имени",
      email: purchase.customerEmailSnapshot ?? "",
      locale: purchase.checkoutLocale ?? null,
      note: purchase.adminNote ?? "",
      createdAt: purchase.firstSeenAt,
      revoked: purchase.outcome === "canceled",
      archivedAt: purchase.adminArchivedAt,
      telegramConfirmed: purchase.telegramUserId !== null,
      cohortTitle,
      accesses,
      emails: emailRows.filter((email) =>
        email.key.startsWith(invitationEmailKeyPrefix(purchase.id)),
      ),
    };
  });
}

/* ---------- Revocation ---------- */

export type InvitationRevocationCheck =
  | { revocable: true; issuedInvites: { chatId: string; inviteLink: string }[] }
  | { revocable: false; reason: "not_found" | "already_revoked" | "already_used" };

/**
 * An invitation can be revoked while nobody has used it: no confirmed account, no
 * link used, nobody in a chat by it. Its issued links are listed to be revoked first.
 */
export async function checkInvitationRevocation(
  purchaseId: string,
  database: SqlExecutor = getDatabase(),
): Promise<InvitationRevocationCheck> {
  const invitation = await readAccessInvitation(purchaseId, database);

  if (!invitation) return { revocable: false, reason: "not_found" };
  if (invitation.outcome === "canceled")
    return { revocable: false, reason: "already_revoked" };

  const [usage] = await database.execute<{ used: boolean }>(sql`
    SELECT
      EXISTS (SELECT 1 FROM telegram_user_bindings WHERE purchase_id = ${purchaseId})
      OR EXISTS (
        SELECT 1 FROM telegram_access_tokens
        WHERE purchase_id = ${purchaseId} AND status = 'used'
      )
      OR EXISTS (
        SELECT 1 FROM access_entitlements
        WHERE purchase_id = ${purchaseId} AND status IN ('activated', 'left_channel')
      ) AS used
  `);

  if (invitation.telegramUserId !== null || usage?.used) {
    return { revocable: false, reason: "already_used" };
  }

  const tokens = await database
    .select({
      chatId: telegramAccessTokens.chatId,
      inviteLink: telegramAccessTokens.tokenValue,
    })
    .from(telegramAccessTokens)
    .where(
      and(
        eq(telegramAccessTokens.purchaseId, purchaseId),
        eq(telegramAccessTokens.status, "issued"),
      ),
    );

  return {
    revocable: true,
    issuedInvites: tokens.flatMap((token) =>
      token.chatId && token.inviteLink?.trim()
        ? [{ chatId: token.chatId, inviteLink: token.inviteLink.trim() }]
        : [],
    ),
  };
}

/**
 * Marks a revoked invitation: the purchase becomes `canceled`, so no count, list,
 * broadcast or «Мой доступ» reads it any more; its rights and links are revoked.
 * Re-checks under the purchase lock that nobody used it meanwhile.
 */
export async function markInvitationRevokedInDatabase({
  now = new Date(),
  purchaseId,
}: {
  now?: Date;
  purchaseId: string;
}): Promise<"revoked" | "already_used" | "not_found"> {
  return getDatabase().transaction(async (tx) => {
    const [purchase] = await tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          eq(purchases.id, purchaseId),
          eq(purchases.source, "admin_offer_link"),
          eq(purchases.outcome, "succeeded"),
        ),
      )
      .for("update");

    if (!purchase) return "not_found";

    const check = await checkInvitationRevocation(purchaseId, tx);
    if (!check.revocable)
      return check.reason === "already_used" ? "already_used" : "not_found";

    await tx
      .update(purchases)
      .set({ outcome: "canceled", stripeStatus: "canceled", updatedAt: now })
      .where(eq(purchases.id, purchaseId));
    await tx
      .update(accessEntitlements)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(eq(accessEntitlements.purchaseId, purchaseId));
    await tx
      .update(telegramAccessTokens)
      .set({ status: "revoked", updatedAt: now })
      .where(
        and(
          eq(telegramAccessTokens.purchaseId, purchaseId),
          eq(telegramAccessTokens.status, "issued"),
        ),
      );

    return "revoked";
  });
}

/** Whether an account already sits in a chat by our own records (an active binding). */
export async function hasActiveChatBinding(
  { chatId, telegramUserId }: { chatId: string; telegramUserId: string },
  database: DatabaseExecutor = getDatabase(),
): Promise<boolean> {
  const [binding] = await database
    .select({ id: telegramUserBindings.id })
    .from(telegramUserBindings)
    .where(
      and(
        eq(telegramUserBindings.chatId, chatId),
        eq(telegramUserBindings.telegramUserId, telegramUserId),
        eq(telegramUserBindings.status, "active"),
        isNull(telegramUserBindings.revokedAt),
      ),
    )
    .limit(1);

  return Boolean(binding);
}

/**
 * «Убрать из журнала» / «Вернуть в журнал»: only the admin journals read the mark;
 * the purchase, its rights and every count stay as they are.
 */
export async function setAdminJournalArchived({
  archived,
  now = new Date(),
  purchaseId,
}: {
  archived: boolean;
  now?: Date;
  purchaseId: string;
}): Promise<boolean> {
  const rows = await getDatabase()
    .update(purchases)
    .set({ adminArchivedAt: archived ? now : null })
    .where(and(eq(purchases.id, purchaseId), eq(purchases.source, "admin_offer_link")))
    .returning({ id: purchases.id });

  return rows.length > 0;
}
