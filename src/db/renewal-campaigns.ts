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

  const normalizedSourceChatIds = [...new Set(sourceChatIds.map((id) => id.trim()))]
    .filter(Boolean)
    .slice(0, 8);
  const normalizedTargetChatId = targetChatId.trim();

  if (!normalizedSourceChatIds.length || !normalizedTargetChatId) {
    throw new Error("missing_chat_selection");
  }

  if (normalizedSourceChatIds.includes(normalizedTargetChatId)) {
    throw new Error("same_source_and_target_chat");
  }

  const chats = await db
    .select()
    .from(telegramChats)
    .where(
      inArray(telegramChats.chatId, [...normalizedSourceChatIds, normalizedTargetChatId]),
    );
  const sourceChats = normalizedSourceChatIds
    .map((chatId) => chats.find((chat) => chat.chatId === chatId))
    .filter((chat): chat is NonNullable<typeof chat> => Boolean(chat?.isActive));
  const target = chats.find((chat) => chat.chatId === normalizedTargetChatId);

  if (sourceChats.length !== normalizedSourceChatIds.length || !target?.isActive) {
    throw new Error("telegram_chat_not_registered");
  }

  const normalizedTitle =
    normalizeTitle(title) ||
    `${sourceChats.map((chat) => chat.title.trim()).join(" + ")} -> ${target.title.trim()}`;

  const [existingActiveCampaign] = await db
    .select()
    .from(renewalCampaigns)
    .where(
      and(
        eq(renewalCampaigns.targetChatId, target.chatId),
        eq(renewalCampaigns.offerExternalId, selection.offerRow.externalOfferId),
        eq(renewalCampaigns.status, "active"),
      ),
    )
    .orderBy(desc(renewalCampaigns.createdAt))
    .limit(1);

  if (existingActiveCampaign) {
    const result = await db.transaction(async (tx) => {
      const existingSourceRows = await tx
        .select({ chatId: renewalCampaignSourceChats.chatId })
        .from(renewalCampaignSourceChats)
        .where(eq(renewalCampaignSourceChats.campaignId, existingActiveCampaign.id));
      const existingSourceChatIds = existingSourceRows.length
        ? existingSourceRows.map((row) => row.chatId)
        : [existingActiveCampaign.sourceChatId];
      const sourceChatsChanged =
        existingSourceChatIds.length !== normalizedSourceChatIds.length ||
        normalizedSourceChatIds.some((chatId) => !existingSourceChatIds.includes(chatId));
      const shouldRegenerateSlug = regenerate || sourceChatsChanged;
      const campaignChanged =
        shouldRegenerateSlug ||
        existingActiveCampaign.sourceChatId !== sourceChats[0].chatId ||
        existingActiveCampaign.title !== normalizedTitle ||
        existingActiveCampaign.offerId !== selection.offerRow.id ||
        existingActiveCampaign.productId !== selection.productRow.id;

      if (!campaignChanged) {
        return {
          campaign: existingActiveCampaign,
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
          slug: shouldRegenerateSlug ? createRenewalSlug() : existingActiveCampaign.slug,
          sourceChatId: sourceChats[0].chatId,
          title: normalizedTitle,
          updatedAt: new Date(),
        })
        .where(eq(renewalCampaigns.id, existingActiveCampaign.id))
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

    if (result) {
      return {
        ...result,
        sourceChats,
        targetChat: target,
      };
    }
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = createRenewalSlug();
    const campaign = await db.transaction(async (tx) => {
      const [createdCampaign] = await tx
        .insert(renewalCampaigns)
        .values({
          offerExternalId: selection.offerRow.externalOfferId,
          offerId: selection.offerRow.id,
          productExternalId: selection.productRow.externalProductId,
          productId: selection.productRow.id,
          slug,
          sourceChatId: sourceChats[0].chatId,
          targetChatId: target.chatId,
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

    if (campaign) {
      return {
        campaign,
        isReused: false,
        sourceChats,
        targetChat: target,
      };
    }
  }

  throw new Error("renewal_slug_generation_failed");
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
