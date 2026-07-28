import { randomBytes } from "node:crypto";

import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import {
  isOnlineGroupRenewalOfferId,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";

import { getDatabase } from "./client";
import {
  customers,
  productOffers,
  products,
  purchases,
  renewalCampaigns,
  renewalCampaignSourceChats,
  telegramChats,
  telegramRenewalVerifications,
  telegramUserBindings,
} from "./schema";

type RenewalCampaignDetails = {
  id: string;
  offerExternalId: string;
  productExternalId: string;
  slug: string;
  sourceChatId: string;
  sourceChatIds: string[];
  sourceChatTitle: string;
  sourceChatTitles: string[];
  targetChatId: string;
  targetChatTitle: string;
  title: string;
};

type RenewalCustomerProfile = {
  address: string;
  city: string;
  country: string;
  email: string;
  fullName: string;
  nickname: string;
  postalCode: string;
};

const RENEWAL_VERIFICATION_TTL_MS = 60 * 60 * 1000;
const RENEWAL_SLUG_BYTES = 8;
const MAX_RENEWAL_SOURCE_CHATS = 8;
const RENEWAL_SLUG_GENERATION_ATTEMPTS = 4;
const RENEWAL_PRODUCT = SELLABLE_PRODUCTS["online-group-anna-strok"];

const createRenewalSlug = () => `rnw_${randomBytes(RENEWAL_SLUG_BYTES).toString("hex")}`;

const getRenewalVerificationExpiresAt = () =>
  new Date(Date.now() + RENEWAL_VERIFICATION_TTL_MS);

const normalizeTitle = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const firstNonEmpty = (...values: Array<string | null | undefined>) =>
  values.find((value) => value?.trim())?.trim() ?? "";

export const findRenewalCustomerProfile = async ({
  sourceChatId,
  telegramUserId,
}: {
  sourceChatId: string;
  telegramUserId: string;
}): Promise<RenewalCustomerProfile | null> => {
  const db = getDatabase();
  const [row] = await db
    .select({
      customerAddress: customers.addressLine,
      customerCity: customers.city,
      customerCountry: customers.country,
      customerEmail: customers.email,
      customerFullName: customers.fullName,
      customerNickname: customers.telegramUsername,
      customerPostalCode: customers.postalCode,
      purchaseAddress: purchases.customerAddressLineSnapshot,
      purchaseCity: purchases.customerCitySnapshot,
      purchaseCountry: purchases.customerCountrySnapshot,
      purchaseEmail: purchases.customerEmailSnapshot,
      purchaseFullName: purchases.customerFullNameSnapshot,
      purchaseNickname: purchases.customerTelegramUsernameSnapshot,
      purchasePostalCode: purchases.customerPostalCodeSnapshot,
    })
    .from(telegramUserBindings)
    .innerJoin(purchases, eq(telegramUserBindings.purchaseId, purchases.id))
    .leftJoin(customers, eq(purchases.customerId, customers.id))
    .where(
      and(
        eq(telegramUserBindings.telegramUserId, telegramUserId.trim()),
        eq(telegramUserBindings.chatId, sourceChatId.trim()),
        eq(purchases.outcome, "succeeded"),
      ),
    )
    .orderBy(desc(purchases.succeededAt), desc(purchases.createdAt))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    address: firstNonEmpty(row.purchaseAddress, row.customerAddress),
    city: firstNonEmpty(row.purchaseCity, row.customerCity),
    country: firstNonEmpty(row.purchaseCountry, row.customerCountry),
    email: firstNonEmpty(row.purchaseEmail, row.customerEmail),
    fullName: firstNonEmpty(row.purchaseFullName, row.customerFullName),
    nickname: firstNonEmpty(row.purchaseNickname, row.customerNickname),
    postalCode: firstNonEmpty(row.purchasePostalCode, row.customerPostalCode),
  };
};

const getOnlineGroupRenewalCheckoutSelection = async (
  offerExternalId = ONLINE_GROUP_RENEWAL_OFFER_ID,
) => {
  if (!isOnlineGroupRenewalOfferId(offerExternalId)) {
    return null;
  }

  const db = getDatabase();
  const [productRow] = await db
    .select()
    .from(products)
    .where(eq(products.externalProductId, RENEWAL_PRODUCT.id))
    .limit(1);

  if (!productRow) {
    return null;
  }

  const [offerRow] = await db
    .select()
    .from(productOffers)
    .where(
      and(
        eq(productOffers.productId, productRow.id),
        eq(productOffers.externalOfferId, offerExternalId),
      ),
    )
    .limit(1);

  if (!offerRow) {
    return null;
  }

  return {
    offerRow,
    productRow,
  };
};

type DatabaseClient = ReturnType<typeof getDatabase>;
type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type RegisteredTelegramChat = typeof telegramChats.$inferSelect;
type RenewalCampaign = typeof renewalCampaigns.$inferSelect;
type RenewalCheckoutSelection = NonNullable<
  Awaited<ReturnType<typeof getOnlineGroupRenewalCheckoutSelection>>
>;

type RenewalCampaignResult = {
  campaign: RenewalCampaign;
  isReused: boolean;
};

const normalizeRenewalCampaignChatIds = ({
  sourceChatIds,
  targetChatId,
}: {
  sourceChatIds: string[];
  targetChatId: string;
}) => {
  const normalizedSourceChatIds = [...new Set(sourceChatIds.map((id) => id.trim()))]
    .filter(Boolean)
    .slice(0, MAX_RENEWAL_SOURCE_CHATS);
  const normalizedTargetChatId = targetChatId.trim();

  if (!normalizedSourceChatIds.length || !normalizedTargetChatId) {
    throw new Error("missing_chat_selection");
  }

  if (normalizedSourceChatIds.includes(normalizedTargetChatId)) {
    throw new Error("same_source_and_target_chat");
  }

  return {
    normalizedSourceChatIds,
    normalizedTargetChatId,
  };
};

const getRegisteredRenewalCampaignChats = async ({
  db,
  normalizedSourceChatIds,
  normalizedTargetChatId,
}: {
  db: DatabaseClient;
  normalizedSourceChatIds: string[];
  normalizedTargetChatId: string;
}): Promise<{
  sourceChats: RegisteredTelegramChat[];
  targetChat: RegisteredTelegramChat;
}> => {
  const chats = await db
    .select()
    .from(telegramChats)
    .where(
      inArray(telegramChats.chatId, [...normalizedSourceChatIds, normalizedTargetChatId]),
    );
  const sourceChats = normalizedSourceChatIds
    .map((chatId) => chats.find((chat) => chat.chatId === chatId))
    .filter((chat): chat is RegisteredTelegramChat => Boolean(chat?.isActive));
  const targetChat = chats.find((chat) => chat.chatId === normalizedTargetChatId);

  if (sourceChats.length !== normalizedSourceChatIds.length || !targetChat?.isActive) {
    throw new Error("telegram_chat_not_registered");
  }

  return {
    sourceChats,
    targetChat,
  };
};

const getRenewalCampaignTitle = ({
  sourceChats,
  targetChat,
  title,
}: {
  sourceChats: RegisteredTelegramChat[];
  targetChat: RegisteredTelegramChat;
  title?: string | null;
}) =>
  normalizeTitle(title) ||
  `${sourceChats.map((chat) => chat.title.trim()).join(" + ")} -> ${targetChat.title.trim()}`;

const findExistingActiveRenewalCampaign = async ({
  db,
  offerExternalId,
  targetChatId,
}: {
  db: DatabaseClient;
  offerExternalId: string;
  targetChatId: string;
}) => {
  const [campaign] = await db
    .select()
    .from(renewalCampaigns)
    .where(
      and(
        eq(renewalCampaigns.targetChatId, targetChatId),
        eq(renewalCampaigns.offerExternalId, offerExternalId),
        eq(renewalCampaigns.status, "active"),
      ),
    )
    .orderBy(desc(renewalCampaigns.createdAt))
    .limit(1);

  return campaign;
};

const getExistingRenewalCampaignUpdateState = async ({
  existingCampaign,
  normalizedSourceChatIds,
  regenerate,
  selection,
  sourceChatId,
  title,
  tx,
}: {
  existingCampaign: RenewalCampaign;
  normalizedSourceChatIds: string[];
  regenerate: boolean;
  selection: RenewalCheckoutSelection;
  sourceChatId: string;
  title: string;
  tx: DatabaseTransaction;
}) => {
  const existingSourceRows = await tx
    .select({ chatId: renewalCampaignSourceChats.chatId })
    .from(renewalCampaignSourceChats)
    .where(eq(renewalCampaignSourceChats.campaignId, existingCampaign.id));

  // Campaigns created before the source-chat relation existed still keep the
  // canonical source on the campaign row, so that value remains the fallback.
  const existingSourceChatIds = existingSourceRows.length
    ? existingSourceRows.map((row) => row.chatId)
    : [existingCampaign.sourceChatId];
  const sourceChatsChanged =
    existingSourceChatIds.length !== normalizedSourceChatIds.length ||
    normalizedSourceChatIds.some((chatId) => !existingSourceChatIds.includes(chatId));

  // A source-set change invalidates the audience represented by a distributed
  // link, therefore it follows the same slug rotation path as an explicit reset.
  const shouldRegenerateSlug = regenerate || sourceChatsChanged;
  const campaignChanged =
    shouldRegenerateSlug ||
    existingCampaign.sourceChatId !== sourceChatId ||
    existingCampaign.title !== title ||
    existingCampaign.offerId !== selection.offerRow.id ||
    existingCampaign.productId !== selection.productRow.id;

  return {
    campaignChanged,
    shouldRegenerateSlug,
    sourceChatsChanged,
  };
};

const reuseOrUpdateRenewalCampaign = async ({
  db,
  existingCampaign,
  normalizedSourceChatIds,
  normalizedTitle,
  regenerate,
  selection,
  sourceChats,
}: {
  db: DatabaseClient;
  existingCampaign: RenewalCampaign;
  normalizedSourceChatIds: string[];
  normalizedTitle: string;
  regenerate: boolean;
  selection: RenewalCheckoutSelection;
  sourceChats: RegisteredTelegramChat[];
}): Promise<RenewalCampaignResult | null> =>
  db.transaction(async (tx) => {
    const { campaignChanged, shouldRegenerateSlug, sourceChatsChanged } =
      await getExistingRenewalCampaignUpdateState({
        existingCampaign,
        normalizedSourceChatIds,
        regenerate,
        selection,
        sourceChatId: sourceChats[0].chatId,
        title: normalizedTitle,
        tx,
      });

    if (!campaignChanged) {
      return {
        campaign: existingCampaign,
        isReused: true,
      };
    }

    const [campaign] = await tx
      .update(renewalCampaigns)
      .set({
        offerExternalId: selection.offerRow.externalOfferId,
        offerId: selection.offerRow.id,
        productExternalId: selection.productRow.externalProductId,
        productId: selection.productRow.id,
        slug: shouldRegenerateSlug ? createRenewalSlug() : existingCampaign.slug,
        sourceChatId: sourceChats[0].chatId,
        title: normalizedTitle,
        updatedAt: new Date(),
      })
      .where(eq(renewalCampaigns.id, existingCampaign.id))
      .returning();

    if (!campaign) {
      return null;
    }

    if (sourceChatsChanged) {
      await tx
        .delete(renewalCampaignSourceChats)
        .where(eq(renewalCampaignSourceChats.campaignId, campaign.id));
      await tx.insert(renewalCampaignSourceChats).values(
        sourceChats.map((chat) => ({
          campaignId: campaign.id,
          chatId: chat.chatId,
        })),
      );
    }

    // Verification invalidation belongs to the same transaction as slug
    // rotation so an old link cannot survive a partially committed update.
    if (shouldRegenerateSlug) {
      await tx
        .delete(telegramRenewalVerifications)
        .where(eq(telegramRenewalVerifications.campaignId, campaign.id));
    }

    return {
      campaign,
      isReused: !shouldRegenerateSlug,
    };
  });

const insertRenewalCampaign = async ({
  db,
  normalizedTitle,
  selection,
  slug,
  sourceChats,
  targetChat,
}: {
  db: DatabaseClient;
  normalizedTitle: string;
  selection: RenewalCheckoutSelection;
  slug: string;
  sourceChats: RegisteredTelegramChat[];
  targetChat: RegisteredTelegramChat;
}): Promise<RenewalCampaign | null> =>
  db.transaction(async (tx) => {
    const [createdCampaign] = await tx
      .insert(renewalCampaigns)
      .values({
        offerExternalId: selection.offerRow.externalOfferId,
        offerId: selection.offerRow.id,
        productExternalId: selection.productRow.externalProductId,
        productId: selection.productRow.id,
        slug,
        sourceChatId: sourceChats[0].chatId,
        targetChatId: targetChat.chatId,
        title: normalizedTitle,
      })
      .onConflictDoNothing({
        target: renewalCampaigns.slug,
      })
      .returning();

    if (!createdCampaign) {
      return null;
    }

    await tx.insert(renewalCampaignSourceChats).values(
      sourceChats.map((chat) => ({
        campaignId: createdCampaign.id,
        chatId: chat.chatId,
      })),
    );

    return createdCampaign;
  });

const createNewRenewalCampaign = async ({
  db,
  normalizedTitle,
  selection,
  sourceChats,
  targetChat,
}: {
  db: DatabaseClient;
  normalizedTitle: string;
  selection: RenewalCheckoutSelection;
  sourceChats: RegisteredTelegramChat[];
  targetChat: RegisteredTelegramChat;
}): Promise<RenewalCampaign> => {
  for (let attempt = 0; attempt < RENEWAL_SLUG_GENERATION_ATTEMPTS; attempt += 1) {
    const campaign = await insertRenewalCampaign({
      db,
      normalizedTitle,
      selection,
      slug: createRenewalSlug(),
      sourceChats,
      targetChat,
    });

    if (campaign) {
      return campaign;
    }
  }

  throw new Error("renewal_slug_generation_failed");
};

export const listActiveTelegramChats = async () => {
  const db = getDatabase();

  return db
    .select({
      chatId: telegramChats.chatId,
      title: telegramChats.title,
      type: telegramChats.type,
      updatedAt: telegramChats.updatedAt,
    })
    .from(telegramChats)
    .where(eq(telegramChats.isActive, true))
    .orderBy(telegramChats.title, telegramChats.chatId);
};

export const upsertRegisteredTelegramChat = async ({
  chatId,
  registeredByTelegramUserId,
  registeredByTelegramUsername,
  title,
  type,
}: {
  chatId: string;
  registeredByTelegramUserId?: string | null;
  registeredByTelegramUsername?: string | null;
  title: string;
  type: string;
}) => {
  const db = getDatabase();
  const normalizedChatId = chatId.trim();
  const normalizedTitle = normalizeTitle(title) || normalizedChatId;
  const normalizedType = normalizeTitle(type) || "unknown";
  const now = new Date();
  const [chat] = await db
    .insert(telegramChats)
    .values({
      chatId: normalizedChatId,
      isActive: true,
      registeredByTelegramUserId: registeredByTelegramUserId?.trim() || null,
      registeredByTelegramUsername: registeredByTelegramUsername?.trim() || null,
      title: normalizedTitle,
      type: normalizedType,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        isActive: true,
        registeredByTelegramUserId: registeredByTelegramUserId?.trim() || null,
        registeredByTelegramUsername: registeredByTelegramUsername?.trim() || null,
        title: normalizedTitle,
        type: normalizedType,
        updatedAt: now,
      },
      target: telegramChats.chatId,
    })
    .returning();

  return chat;
};

export const createRenewalCampaign = async ({
  offerExternalId = ONLINE_GROUP_RENEWAL_OFFER_ID,
  regenerate = false,
  sourceChatIds,
  targetChatId,
  title,
}: {
  offerExternalId?: string;
  regenerate?: boolean;
  sourceChatIds: string[];
  targetChatId: string;
  title?: string | null;
}) => {
  const db = getDatabase();
  const selection = await getOnlineGroupRenewalCheckoutSelection(offerExternalId);

  if (!selection) {
    throw new Error("renewal_offer_not_seeded");
  }

  const { normalizedSourceChatIds, normalizedTargetChatId } =
    normalizeRenewalCampaignChatIds({
      sourceChatIds,
      targetChatId,
    });
  const { sourceChats, targetChat } = await getRegisteredRenewalCampaignChats({
    db,
    normalizedSourceChatIds,
    normalizedTargetChatId,
  });
  const normalizedTitle = getRenewalCampaignTitle({
    sourceChats,
    targetChat,
    title,
  });
  const existingActiveCampaign = await findExistingActiveRenewalCampaign({
    db,
    offerExternalId: selection.offerRow.externalOfferId,
    targetChatId: targetChat.chatId,
  });

  if (existingActiveCampaign) {
    const result = await reuseOrUpdateRenewalCampaign({
      db,
      existingCampaign: existingActiveCampaign,
      normalizedSourceChatIds,
      normalizedTitle,
      regenerate,
      selection,
      sourceChats,
    });

    if (result) {
      return {
        ...result,
        sourceChats,
        targetChat,
      };
    }
  }

  const campaign = await createNewRenewalCampaign({
    db,
    normalizedTitle,
    selection,
    sourceChats,
    targetChat,
  });

  return {
    campaign,
    isReused: false,
    sourceChats,
    targetChat,
  };
};

export const listRecentRenewalCampaigns = async (limit = 12) => {
  const db = getDatabase();
  const campaigns = await db
    .select({
      createdAt: renewalCampaigns.createdAt,
      id: renewalCampaigns.id,
      offerExternalId: renewalCampaigns.offerExternalId,
      productExternalId: renewalCampaigns.productExternalId,
      slug: renewalCampaigns.slug,
      sourceChatId: renewalCampaigns.sourceChatId,
      status: renewalCampaigns.status,
      targetChatId: renewalCampaigns.targetChatId,
      title: renewalCampaigns.title,
    })
    .from(renewalCampaigns)
    .orderBy(desc(renewalCampaigns.createdAt))
    .limit(limit);

  const sourceRows = campaigns.length
    ? await db
        .select({
          campaignId: renewalCampaignSourceChats.campaignId,
          chatId: renewalCampaignSourceChats.chatId,
          title: telegramChats.title,
        })
        .from(renewalCampaignSourceChats)
        .innerJoin(
          telegramChats,
          eq(renewalCampaignSourceChats.chatId, telegramChats.chatId),
        )
        .where(
          inArray(
            renewalCampaignSourceChats.campaignId,
            campaigns.map((campaign) => campaign.id),
          ),
        )
    : [];

  return campaigns.map((campaign) => {
    const sources = sourceRows.filter((row) => row.campaignId === campaign.id);

    return {
      ...campaign,
      sourceChatIds: sources.length
        ? sources.map((source) => source.chatId)
        : [campaign.sourceChatId],
      sourceChatTitles: sources.length
        ? sources.map((source) => source.title)
        : [campaign.sourceChatId],
    };
  });
};

export const getRenewalCampaignBySlug = async (slug: string) => {
  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    return null;
  }

  const [campaign] = await getDatabase()
    .select()
    .from(renewalCampaigns)
    .where(eq(renewalCampaigns.slug, normalizedSlug))
    .limit(1);

  return campaign ?? null;
};

export const setRenewalCampaignStatus = async ({
  slug,
  status,
}: {
  slug: string;
  status: "active" | "archived";
}) => {
  const db = getDatabase();
  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    return null;
  }

  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(renewalCampaigns)
      .where(eq(renewalCampaigns.slug, normalizedSlug))
      .limit(1);

    if (!campaign) {
      return null;
    }

    if (status === "active") {
      await tx
        .update(renewalCampaigns)
        .set({
          status: "archived",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(renewalCampaigns.targetChatId, campaign.targetChatId),
            eq(renewalCampaigns.offerExternalId, campaign.offerExternalId),
            eq(renewalCampaigns.status, "active"),
          ),
        );
    }

    const [updatedCampaign] = await tx
      .update(renewalCampaigns)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(renewalCampaigns.id, campaign.id))
      .returning();

    return updatedCampaign ?? null;
  });
};

export const getActiveRenewalCampaignBySlug = async (
  slug: string,
): Promise<RenewalCampaignDetails | null> => {
  const db = getDatabase();
  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    return null;
  }

  const [row] = await db
    .select({
      expiresAt: renewalCampaigns.expiresAt,
      id: renewalCampaigns.id,
      offerExternalId: renewalCampaigns.offerExternalId,
      productExternalId: renewalCampaigns.productExternalId,
      slug: renewalCampaigns.slug,
      sourceChatId: renewalCampaigns.sourceChatId,
      status: renewalCampaigns.status,
      targetChatId: renewalCampaigns.targetChatId,
      title: renewalCampaigns.title,
    })
    .from(renewalCampaigns)
    .where(
      and(
        eq(renewalCampaigns.slug, normalizedSlug),
        eq(renewalCampaigns.status, "active"),
        or(
          gt(renewalCampaigns.expiresAt, new Date()),
          isNull(renewalCampaigns.expiresAt),
        ),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const [targetChatRows, sourceRows] = await Promise.all([
    db
      .select({ title: telegramChats.title })
      .from(telegramChats)
      .where(eq(telegramChats.chatId, row.targetChatId))
      .limit(1),
    db
      .select({ chatId: renewalCampaignSourceChats.chatId, title: telegramChats.title })
      .from(renewalCampaignSourceChats)
      .innerJoin(
        telegramChats,
        eq(renewalCampaignSourceChats.chatId, telegramChats.chatId),
      )
      .where(eq(renewalCampaignSourceChats.campaignId, row.id)),
  ]);
  const sourceChatIds = sourceRows.length
    ? sourceRows.map((source) => source.chatId)
    : [row.sourceChatId];
  const sourceChatTitles = sourceRows.length
    ? sourceRows.map((source) => source.title)
    : [row.sourceChatId];
  const targetChat = targetChatRows[0];

  return {
    id: row.id,
    offerExternalId: row.offerExternalId,
    productExternalId: row.productExternalId,
    slug: row.slug,
    sourceChatId: row.sourceChatId,
    sourceChatIds,
    sourceChatTitle: sourceChatTitles[0] ?? row.sourceChatId,
    sourceChatTitles,
    targetChatId: row.targetChatId,
    targetChatTitle: targetChat?.title ?? row.targetChatId,
    title: row.title,
  };
};

export const upsertRenewalVerification = async ({
  campaign,
  checkoutSessionId,
  lastError,
  sourceChatId,
  status,
  telegramName,
  telegramUserId,
  telegramUsername,
}: {
  campaign: RenewalCampaignDetails;
  checkoutSessionId: string;
  lastError?: string | null;
  sourceChatId?: string | null;
  status: "failed" | "not_member" | "verified";
  telegramName?: string | null;
  telegramUserId: string;
  telegramUsername?: string | null;
}) => {
  const db = getDatabase();
  const now = new Date();
  const expiresAt = getRenewalVerificationExpiresAt();
  const verifiedSourceChatId =
    sourceChatId?.trim() || campaign.sourceChatIds[0] || campaign.sourceChatId;
  const [verification] = await db
    .insert(telegramRenewalVerifications)
    .values({
      campaignId: campaign.id,
      checkoutSessionId,
      expiresAt,
      lastError: lastError?.trim() || null,
      sourceChatId: verifiedSourceChatId,
      status,
      targetChatId: campaign.targetChatId,
      telegramName: telegramName?.trim() || null,
      telegramUserId,
      telegramUsername: telegramUsername?.trim() || null,
      updatedAt: now,
      verifiedAt: status === "verified" ? now : null,
    })
    .onConflictDoUpdate({
      set: {
        expiresAt,
        lastError: lastError?.trim() || null,
        sourceChatId: verifiedSourceChatId,
        status,
        targetChatId: campaign.targetChatId,
        telegramName: telegramName?.trim() || null,
        telegramUserId,
        telegramUsername: telegramUsername?.trim() || null,
        updatedAt: now,
        verifiedAt: status === "verified" ? now : null,
      },
      target: [
        telegramRenewalVerifications.checkoutSessionId,
        telegramRenewalVerifications.campaignId,
      ],
    })
    .returning();

  return verification;
};

export const findValidRenewalVerification = async ({
  checkoutSessionId,
  slug,
}: {
  checkoutSessionId: string;
  slug: string;
}) => {
  const campaign = await getActiveRenewalCampaignBySlug(slug);

  if (!campaign) {
    return null;
  }

  const db = getDatabase();
  const [verification] = await db
    .select()
    .from(telegramRenewalVerifications)
    .where(
      and(
        eq(telegramRenewalVerifications.campaignId, campaign.id),
        eq(telegramRenewalVerifications.checkoutSessionId, checkoutSessionId.trim()),
        eq(telegramRenewalVerifications.status, "verified"),
        gt(telegramRenewalVerifications.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!verification) {
    return null;
  }

  return {
    campaign,
    verification,
  };
};
