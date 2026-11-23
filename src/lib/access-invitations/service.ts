import { eq } from "drizzle-orm";

import {
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  isInspirationHubOfferId,
  isOnlineGroupLibraryOfferId,
  ONLINE_GROUP_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  ONLINE_GROUP_RENEWAL_OFFER_ID,
  ONLINE_GROUP_STANDARD_OFFER_ID,
  SELLABLE_PRODUCTS,
  type SellableProduct,
  type SellableProductOffer,
} from "@/constants/sellable-products";
import {
  type AccessInvitationRecord,
  checkInvitationRevocation,
  countRecentInvitationLinkEmails,
  createAccessInvitationInDatabase,
  findInvitationDuplicates,
  type InvitationDuplicate,
  invitationEmailKeyPrefix,
  type InvitationKind,
  type InvitationLocale,
  markInvitationAccessFailed,
  markInvitationRevokedInDatabase,
  readAccessInvitation,
} from "@/db/access-invitations";
import { getDatabase } from "@/db/client";
import { findInspirationHubChatId } from "@/db/hub-access-coverage";
import { getActiveOnlineGroupCampaign } from "@/db/online-group-campaigns";
import { findPaymentRecordByIntentIdFromDatabase } from "@/db/payment-records";
import { listActiveTelegramChats } from "@/db/renewal-campaigns";
import { onlineGroupCohorts } from "@/db/schema";
import {
  type ClaimedOutboxJob,
  enqueueOutboxJob,
  nonRetryable,
  processOutboxJobByDeduplicationKey,
} from "@/db/transactional-outbox";
import { isProductionDeployment } from "@/lib/deployment";
import {
  buildInvitationJoinEmail,
  buildInvitationLinksEmail,
  buildInvitationRenewalEmail,
  type InvitationEmailAccess,
  type InvitationEmailProduct,
} from "@/lib/email/access-invitation";
import { sendResendEmail } from "@/lib/email/resend";
import { EMAIL_PATTERN } from "@/lib/email-suggestion";
import { getFirstName } from "@/lib/my-access/greeting";
import { buildMyAccessUrl } from "@/lib/my-access/link";
import { logSafeError } from "@/lib/safe-error-log";
import {
  getTelegramChatMember,
  revokeTelegramChatInviteLink,
} from "@/lib/telegram/bot-api";
import { isActiveTelegramMember } from "@/lib/telegram/chat-membership";
import {
  ensureOnlineGroupAccessForPayment,
  recordOnlineGroupMemberPresent,
  syncOnlineGroupMembership,
} from "@/lib/telegram/online-group-access";

import { buildInvitationUrl } from "./link";

export type InvitationProduct = InvitationEmailProduct;
export type { InvitationKind, InvitationLocale };

const OFFER_IDS: Record<InvitationProduct, Record<InvitationKind, string>> = {
  standard: {
    join: ONLINE_GROUP_STANDARD_OFFER_ID,
    renewal: ONLINE_GROUP_RENEWAL_OFFER_ID,
  },
  plus: {
    join: ONLINE_GROUP_LIBRARY_OFFER_ID,
    renewal: ONLINE_GROUP_RENEWAL_LIBRARY_OFFER_ID,
  },
  hub: {
    join: INSPIRATION_HUB_ACCESS_OFFER_ID,
    renewal: INSPIRATION_HUB_RENEWAL_OFFER_ID,
  },
};

const NAME_MAX = 80;
const NOTE_MAX = 500;

export const getInvitationProduct = (offerId: string): InvitationProduct =>
  isInspirationHubOfferId(offerId)
    ? "hub"
    : isOnlineGroupLibraryOfferId(offerId)
      ? "plus"
      : "standard";

const resolveCatalog = (
  product: InvitationProduct,
  kind: InvitationKind,
): { product: SellableProduct; offer: SellableProductOffer } => {
  const catalogProduct =
    SELLABLE_PRODUCTS[product === "hub" ? "inspiration-hub" : "online-group-anna-strok"];
  const offer = catalogProduct.offers.find(
    (candidate) => candidate.id === OFFER_IDS[product][kind],
  );
  if (!offer) throw new Error("access_invitation_offer_missing");
  return { product: catalogProduct, offer };
};

/* ---------- Where an invitation leads ---------- */

export type InvitationTarget =
  | {
      kind: "group";
      cohortId: string;
      cohortTitle: string;
      mainChatId: string;
      libraryChatId: string;
    }
  | { kind: "hub"; hubChatId: string };

export type InvitationTargetRefusal =
  "group_not_configured" | "cohort_missing" | "cohort_closed" | "hub_not_configured";

/**
 * The current cohort: the one in the main chat of the active campaign, while it is
 * not closed. Its sales switch does not matter — Anna invites after sales close too.
 */
export async function resolveInvitationTarget(
  scope: "group" | "hub",
): Promise<{ target: InvitationTarget } | { refusal: InvitationTargetRefusal }> {
  if (scope === "hub") {
    const hubChatId = await findInspirationHubChatId(getDatabase());
    return hubChatId
      ? { target: { kind: "hub", hubChatId } }
      : { refusal: "hub_not_configured" };
  }

  const campaign = await getActiveOnlineGroupCampaign();
  const activeChats = campaign ? await listActiveTelegramChats() : [];
  const activeChatIds = new Set(activeChats.map((chat) => chat.chatId));

  if (
    !campaign?.regularChatId ||
    !campaign.libraryChatId ||
    !activeChatIds.has(campaign.regularChatId) ||
    !activeChatIds.has(campaign.libraryChatId)
  ) {
    return { refusal: "group_not_configured" };
  }

  const [cohort] = await getDatabase()
    .select({
      id: onlineGroupCohorts.id,
      title: onlineGroupCohorts.title,
      closedAt: onlineGroupCohorts.closedAt,
    })
    .from(onlineGroupCohorts)
    .where(eq(onlineGroupCohorts.mainChatId, campaign.regularChatId))
    .limit(1);

  if (!cohort) return { refusal: "cohort_missing" };
  if (cohort.closedAt) return { refusal: "cohort_closed" };

  return {
    target: {
      kind: "group",
      cohortId: cohort.id,
      cohortTitle: cohort.title,
      mainChatId: campaign.regularChatId,
      libraryChatId: campaign.libraryChatId,
    },
  };
}

/* ---------- Issuing ---------- */

export type IssueInvitationInput = {
  firstName: string;
  lastName: string;
  email: string;
  locale: string;
  product: string;
  kind: string;
  note: string;
  /** The operator saw the duplicate warning and confirmed. */
  confirmDuplicates: boolean;
};

export type IssueInvitationResult =
  | { status: "issued"; purchaseId: string; email: InvitationEmailDelivery }
  | { status: "duplicate"; duplicates: InvitationDuplicate[] }
  | {
      status: "invalid";
      field: "firstName" | "email" | "locale" | "product" | "kind" | "note";
    }
  | { status: "refused"; refusal: InvitationTargetRefusal };

const clean = (value: string | null | undefined, max: number) =>
  (value ?? "").replace(/\s+/gu, " ").trim().slice(0, max);

const isLocale = (value: string): value is InvitationLocale =>
  value === "ru" || value === "pl" || value === "en";

const isProduct = (value: string): value is InvitationProduct =>
  value === "standard" || value === "plus" || value === "hub";

const isKind = (value: string): value is InvitationKind =>
  value === "join" || value === "renewal";

/** The invitation email of one send: the first, or a later «send again». */
const inviteEmailKey = (purchaseId: string, sendId: string) =>
  `${invitationEmailKeyPrefix(purchaseId)}invite:${sendId}`;
/** The links email after the Telegram check (one), or of a later «send the links again». */
export const linksEmailKey = (purchaseId: string, sendId?: string) =>
  `${invitationEmailKeyPrefix(purchaseId)}links${sendId ? `:${sendId}` : ""}`;

/** «Send the links again» at most once in 10 minutes and 3 times a day per invitation. */
const LINKS_RESEND_WINDOWS = [
  { limit: 1, ms: 10 * 60 * 1000 },
  { limit: 3, ms: 24 * 60 * 60 * 1000 },
] as const;

export const enqueueInvitationEmail = async ({
  deduplicationKey,
  payload,
  recipient,
}: {
  deduplicationKey: string;
  payload: Record<string, unknown>;
  recipient: string;
}) => {
  await enqueueOutboxJob({
    deduplicationKey,
    kind: "access_invitation_email",
    payload,
    provider: "resend",
    recipient,
  });
  // Sent now; a failure stays queued for the business-jobs cron to retry.
  try {
    const result = await processOutboxJobByDeduplicationKey({
      deduplicationKey,
      deliver: deliverAccessInvitationEmail,
    });
    return result.status === "sent" ? ("sent" as const) : ("queued" as const);
  } catch (error) {
    logSafeError("Failed to deliver an access invitation email", error);
    return "queued" as const;
  }
};

/** «sent»: Resend accepted the email now; «queued»: it waits for a retry. */
export type InvitationEmailDelivery = Awaited<ReturnType<typeof enqueueInvitationEmail>>;

export async function issueAccessInvitation(
  input: IssueInvitationInput,
  now = new Date(),
): Promise<IssueInvitationResult> {
  const firstName = clean(input.firstName, NAME_MAX);
  const lastName = clean(input.lastName, NAME_MAX);
  const email = clean(input.email, 254).toLowerCase();
  const note = (input.note ?? "").trim();

  if (!firstName) return { status: "invalid", field: "firstName" };
  if (!EMAIL_PATTERN.test(email)) return { status: "invalid", field: "email" };
  if (!isLocale(input.locale)) return { status: "invalid", field: "locale" };
  if (!isProduct(input.product)) return { status: "invalid", field: "product" };
  if (!isKind(input.kind)) return { status: "invalid", field: "kind" };
  if (note.length > NOTE_MAX) return { status: "invalid", field: "note" };

  const resolved = await resolveInvitationTarget(
    input.product === "hub" ? "hub" : "group",
  );
  if ("refusal" in resolved) return { status: "refused", refusal: resolved.refusal };

  const { target } = resolved;
  const cohortId = target.kind === "group" ? target.cohortId : null;
  const duplicates = (await findInvitationDuplicates({ cohortId, email, now })).filter(
    (duplicate) =>
      input.product === "hub" ? duplicate === "hub" : duplicate === "cohort",
  );
  if (duplicates.length > 0 && !input.confirmDuplicates) {
    return { status: "duplicate", duplicates };
  }

  const catalog = resolveCatalog(input.product, input.kind);
  const { purchaseId, paymentIntentId } = await createAccessInvitationInDatabase({
    scope: target.kind,
    kind: input.kind,
    productExternalId: catalog.product.id,
    offerExternalId: catalog.offer.id,
    productTitle: catalog.product.title,
    offerLabel: catalog.offer.label,
    accessWorkflow: catalog.offer.accessWorkflow ?? "telegram-online-group",
    cohortId,
    mainChatId: target.kind === "group" ? target.mainChatId : null,
    inspirationChatId:
      target.kind === "group" && input.product === "plus" ? target.libraryChatId : null,
    firstName,
    lastName,
    email,
    locale: input.locale,
    note,
    livemode: isProductionDeployment(),
    now,
  });

  if (input.kind === "join") {
    // The links exist before the email asks for them; a Telegram failure here is
    // retried by the email job itself.
    try {
      const record = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);
      if (record) await ensureOnlineGroupAccessForPayment(record);
    } catch (error) {
      logSafeError("Failed to create invitation links", error);
    }
  }

  const emailDelivery = await enqueueInvitationEmail({
    deduplicationKey: inviteEmailKey(purchaseId, "1"),
    payload: { purchaseId, template: "invite" },
    recipient: email,
  });

  return { status: "issued", purchaseId, email: emailDelivery };
}

/** «Отправить письмо ещё раз»: the same invitation email, built afresh. */
export async function resendAccessInvitation(
  purchaseId: string,
  now = new Date(),
): Promise<InvitationEmailDelivery | "not_found" | "revoked"> {
  const invitation = await readAccessInvitation(purchaseId);
  if (!invitation || !invitation.customerEmailSnapshot) return "not_found";
  if (invitation.outcome !== "succeeded") return "revoked";

  return enqueueInvitationEmail({
    deduplicationKey: inviteEmailKey(purchaseId, now.getTime().toString(36)),
    payload: { purchaseId, template: "invite" },
    recipient: invitation.customerEmailSnapshot,
  });
}

export type InvitationLinksResult =
  | { status: "sent" | "queued"; lines: InvitationAccessLine[] }
  | { status: "no_links"; lines: InvitationAccessLine[] }
  | { status: "limited" | "needs_telegram" | "not_found" | "revoked" };

/**
 * «Отправить ссылки ещё раз» (admin) and «Прислать новую ссылку» («Мой доступ», the
 * invitation page): fresh personal links in place of used or expired ones, by the
 * links email. A renewal gives none before its Telegram check. Limited by the emails
 * actually sent, so a failure never locks the person out.
 */
export async function sendInvitationLinks(
  purchaseId: string,
  { checkLimit = true, now = new Date() }: { checkLimit?: boolean; now?: Date } = {},
): Promise<InvitationLinksResult> {
  const invitation = await readAccessInvitation(purchaseId);
  if (!invitation || !invitation.customerEmailSnapshot) return { status: "not_found" };
  if (invitation.outcome !== "succeeded") return { status: "revoked" };
  if (invitation.invitationKind === "renewal" && !invitation.telegramUserId) {
    return { status: "needs_telegram" };
  }

  if (checkLimit) {
    for (const window of LINKS_RESEND_WINDOWS) {
      const sent = await countRecentInvitationLinkEmails({
        purchaseId,
        since: new Date(now.getTime() - window.ms),
      });
      if (sent >= window.limit) return { status: "limited" };
    }
  }

  const lines = await collectInvitationAccessLines(
    invitation,
    invitation.telegramUserId,
    {
      reissue: true,
    },
  );
  const linkKeys = lines.flatMap((line) =>
    line.state === "link" ? [line.accessKey] : [],
  );
  if (linkKeys.length === 0) return { status: "no_links", lines };

  const status = await enqueueInvitationEmail({
    deduplicationKey: linksEmailKey(purchaseId, now.getTime().toString(36)),
    payload: { purchaseId, template: "links", accessKeys: linkKeys },
    recipient: invitation.customerEmailSnapshot,
  });
  return { status, lines };
}

export type InvitationMembershipCheck =
  | {
      status: "checked";
      chats: { accessKey: AccessKey; membership: Membership }[];
    }
  | { status: "needs_telegram" | "not_found" | "revoked" };

/**
 * «Проверить в Telegram»: asks Telegram whether the invitation's account sits in each
 * of its chats now and records the answer the way the bot records a join or a leave.
 */
export async function recheckInvitationMembership(
  purchaseId: string,
): Promise<InvitationMembershipCheck> {
  const invitation = await readAccessInvitation(purchaseId);
  if (!invitation) return { status: "not_found" };
  if (invitation.outcome !== "succeeded") return { status: "revoked" };
  const telegramUserId = invitation.telegramUserId?.trim();
  if (!telegramUserId) return { status: "needs_telegram" };

  const record = await findPaymentRecordByIntentIdFromDatabase(
    invitation.paymentIntentId,
  );
  if (!record) return { status: "not_found" };

  const chats = await chatsOfInvitation(
    invitation,
    record.telegram_channel_chat_id.trim(),
  );
  const results = [];
  for (const chat of chats) {
    const membership = await checkMembership(chat.chatId, telegramUserId);
    if (membership === "member") {
      await recordOnlineGroupMemberPresent({
        accessKey: chat.accessKey,
        paymentRecord: record,
        telegramUserId,
      });
    } else if (membership === "absent") {
      // Marks this account's bindings in the chat as left, as the bot does on a leave.
      await syncOnlineGroupMembership({
        chatId: chat.chatId,
        membershipStatus: "left",
        telegramUserId,
      });
    }
    results.push({ accessKey: chat.accessKey, membership });
  }

  return { status: "checked", chats: results };
}

/**
 * «Отозвать»: the Telegram links stop first, then the invitation is marked; nobody
 * may have used it. A Telegram failure leaves everything as it was.
 */
export async function revokeAccessInvitation(
  purchaseId: string,
): Promise<
  "revoked" | "not_found" | "already_revoked" | "already_used" | "telegram_failed"
> {
  const check = await checkInvitationRevocation(purchaseId);
  if (!check.revocable) return check.reason;

  try {
    for (const invite of check.issuedInvites) {
      await revokeTelegramChatInviteLink(invite);
    }
  } catch (error) {
    logSafeError("Failed to revoke invitation links", error);
    return "telegram_failed";
  }

  return markInvitationRevokedInDatabase({ purchaseId });
}

/* ---------- What a person has: email, page ---------- */

type AccessKey = "inspiration-hub" | "main-group";

/**
 * One access as the person sees it: a link, already in, a Hub already running or
 * opening later, a link that has expired, or none because creating it failed.
 */
export type InvitationAccessLine =
  | { accessKey: AccessKey; state: "link"; url: string }
  | { accessKey: AccessKey; state: "member" }
  | { accessKey: "inspiration-hub"; state: "extended"; until: string | null }
  | { accessKey: "inspiration-hub"; state: "scheduled"; startsAt: string | null }
  | { accessKey: AccessKey; state: "expired" }
  | { accessKey: AccessKey; state: "unavailable" };

const chatsOfInvitation = async (
  invitation: AccessInvitationRecord,
  mainChatId: string,
): Promise<{ accessKey: "inspiration-hub" | "main-group"; chatId: string }[]> => {
  if (isInspirationHubOfferId(invitation.offerExternalId ?? "")) {
    const hubChatId = await findInspirationHubChatId(getDatabase());
    return hubChatId ? [{ accessKey: "inspiration-hub", chatId: hubChatId }] : [];
  }

  return [
    ...(mainChatId ? [{ accessKey: "main-group" as const, chatId: mainChatId }] : []),
    ...(isOnlineGroupLibraryOfferId(invitation.offerExternalId ?? "") &&
    invitation.inspirationChatIdSnapshot
      ? [
          {
            accessKey: "inspiration-hub" as const,
            chatId: invitation.inspirationChatIdSnapshot,
          },
        ]
      : []),
  ];
};

type Membership = "member" | "absent" | "unknown";

/** Whether the account sits in the chat now, by Telegram itself. */
const checkMembership = async (
  chatId: string,
  telegramUserId: string,
): Promise<Membership> => {
  try {
    return isActiveTelegramMember(
      await getTelegramChatMember({ chatId, userId: telegramUserId }),
    )
      ? "member"
      : "absent";
  } catch (error) {
    // Telegram's answer for an account it does not find in this chat (2026-11-20).
    if (error instanceof Error && error.message.includes("PARTICIPANT_ID_INVALID")) {
      return "absent";
    }
    // A failed check is not an answer: the link is shown.
    logSafeError("Failed to check invitation chat membership", error);
    return "unknown";
  }
};

/**
 * One line per access of the invitation, from the access service itself: a link, a
 * Hub already running («extended»), a Hub that opens later, or nothing to give. With
 * a confirmed account, a chat it already sits in shows that instead of a link and is
 * recorded the way a join is. A failure of the service leaves its trace on the
 * rights (`link_failed`), which the admin journal shows. `reissue` replaces a used or
 * expired link (the «send the links again» actions).
 */
export async function collectInvitationAccessLines(
  invitation: AccessInvitationRecord,
  telegramUserId: string | null = invitation.telegramUserId,
  { reissue = false }: { reissue?: boolean } = {},
): Promise<InvitationAccessLine[]> {
  const record = await findPaymentRecordByIntentIdFromDatabase(
    invitation.paymentIntentId,
  );
  if (!record) return [];

  const chats = await chatsOfInvitation(
    invitation,
    record.telegram_channel_chat_id.trim(),
  );
  const membership = new Map<AccessKey, Membership>(
    telegramUserId
      ? await Promise.all(
          chats.map(
            async (chat) =>
              [
                chat.accessKey,
                await checkMembership(chat.chatId, telegramUserId),
              ] as const,
          ),
        )
      : [],
  );
  const isMember = (accessKey: AccessKey) => membership.get(accessKey) === "member";

  for (const chat of chats) {
    if (!telegramUserId || !isMember(chat.accessKey)) continue;
    try {
      await recordOnlineGroupMemberPresent({
        accessKey: chat.accessKey,
        paymentRecord: record,
        telegramUserId,
      });
    } catch (error) {
      logSafeError("Failed to record an invitation member already in the chat", error);
    }
  }

  // Only a member of every group chat needs no access service at all; the Hub always
  // asks it, for the dates of the period.
  const onlyMembers =
    chats.length > 0 &&
    chats.every((chat) => chat.accessKey === "main-group" && isMember(chat.accessKey));
  let items: NonNullable<Awaited<ReturnType<typeof ensureOnlineGroupAccessForPayment>>> =
    [];
  if (!onlyMembers) {
    try {
      items = (await ensureOnlineGroupAccessForPayment(record, { reissue })) ?? [];
    } catch (error) {
      logSafeError("Failed to ensure invitation accesses", error);
      await markInvitationAccessFailed({
        purchaseId: invitation.id,
        accessKeys: chats
          .filter((chat) => !isMember(chat.accessKey))
          .map((chat) => chat.accessKey),
      }).catch((markError) =>
        logSafeError("Failed to mark an invitation access as failed", markError),
      );
    }
  }

  return chats.map((chat): InvitationAccessLine => {
    const item = items.find((candidate) => candidate.accessKey === chat.accessKey);

    if (chat.accessKey === "inspiration-hub" && item?.status === "scheduled") {
      return {
        accessKey: "inspiration-hub",
        state: "scheduled",
        startsAt: item.accessStartsAt || null,
      };
    }
    if (
      chat.accessKey === "inspiration-hub" &&
      (item?.status === "active" || isMember(chat.accessKey))
    ) {
      return {
        accessKey: "inspiration-hub",
        state: "extended",
        until: item?.accessExpiresAt || null,
      };
    }
    if (isMember(chat.accessKey) || item?.status === "active") {
      return { accessKey: chat.accessKey, state: "member" };
    }
    if (item?.status === "ready" && item.accessUrl) {
      return { accessKey: chat.accessKey, state: "link", url: item.accessUrl };
    }
    if (item?.status === "expired")
      return { accessKey: chat.accessKey, state: "expired" };
    return { accessKey: chat.accessKey, state: "unavailable" };
  });
}

const toEmailAccesses = (lines: InvitationAccessLine[]): InvitationEmailAccess[] =>
  lines.flatMap((line): InvitationEmailAccess[] => {
    if (line.state === "link")
      return [{ accessKey: line.accessKey, kind: "link", url: line.url }];
    if (line.state === "extended") {
      return [
        {
          accessKey: "inspiration-hub",
          kind: "extended",
          until: line.until ? new Date(line.until) : null,
        },
      ];
    }
    if (line.state === "scheduled") {
      return [
        {
          accessKey: "inspiration-hub",
          kind: "scheduled",
          startsAt: line.startsAt ? new Date(line.startsAt) : null,
        },
      ];
    }
    return [];
  });

export const invitationLocale = (invitation: AccessInvitationRecord): InvitationLocale =>
  invitation.checkoutLocale ?? "ru";

const emailBase = (invitation: AccessInvitationRecord) => {
  const locale = invitationLocale(invitation);
  return {
    cohortTitle: invitation.cohortTitle,
    firstName: getFirstName(invitation.customerFullNameSnapshot) ?? "",
    locale,
    myAccessUrl: buildMyAccessUrl(invitation.customerId, locale),
    product: getInvitationProduct(invitation.offerExternalId ?? ""),
  };
};

/**
 * Builds the email at sending time from the invitation as it is then: a revoked
 * invitation sends nothing; a joining email without its links waits for Telegram.
 */
export async function deliverAccessInvitationEmail(job: ClaimedOutboxJob) {
  const purchaseId =
    typeof job.payload.purchaseId === "string" ? job.payload.purchaseId : "";
  const template = job.payload.template;
  const invitation = purchaseId ? await readAccessInvitation(purchaseId) : null;

  if (!invitation) throw nonRetryable("access_invitation_email_invitation_missing");
  if (invitation.outcome !== "succeeded") return { skipped: true };

  const recipient = invitation.customerEmailSnapshot?.trim().toLowerCase() ?? "";
  if (!recipient || job.recipient?.trim().toLowerCase() !== recipient) {
    throw nonRetryable("access_invitation_email_recipient_mismatch");
  }

  const base = emailBase(invitation);
  let email: { html: string; subject: string; text: string } | null;

  if (template === "links") {
    const keys = Array.isArray(job.payload.accessKeys) ? job.payload.accessKeys : [];
    const lines = (await collectInvitationAccessLines(invitation)).filter(
      (line) => line.state === "link" && keys.includes(line.accessKey),
    );
    email = buildInvitationLinksEmail({ ...base, accesses: toEmailAccesses(lines) });
    if (!email) return { skipped: true };
  } else if (invitation.invitationKind === "renewal") {
    const pageUrl = buildInvitationUrl(invitation.id, base.locale);
    if (!pageUrl) throw nonRetryable("access_invitation_link_not_configured");
    email = buildInvitationRenewalEmail({ ...base, pageUrl });
  } else {
    const lines = await collectInvitationAccessLines(invitation);
    // A joining email without its links is useless: retried until Telegram answers.
    if (lines.length === 0 || lines.some((line) => line.state === "unavailable")) {
      throw new Error("access_invitation_links_unavailable");
    }
    email = buildInvitationJoinEmail({ ...base, accesses: toEmailAccesses(lines) });
  }

  const { emailId } = await sendResendEmail({
    ...email,
    idempotencyKey: job.deduplicationKey,
    sender: "hello",
    to: recipient,
  });

  return { externalMessageId: emailId };
}
