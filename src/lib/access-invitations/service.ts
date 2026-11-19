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
  confirmInvitationTelegramInDatabase,
  createAccessInvitationInDatabase,
  findInvitationDuplicates,
  type InvitationDuplicate,
  invitationEmailKeyPrefix,
  type InvitationKind,
  type InvitationLocale,
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
  processOutboxJobByDeduplicationKey,
} from "@/db/transactional-outbox";
import {
  buildInvitationJoinEmail,
  buildInvitationLinksEmail,
  buildInvitationRenewalEmail,
  type InvitationEmailAccess,
  type InvitationEmailProduct,
} from "@/lib/email/access-invitation";
import { sendResendEmail } from "@/lib/email/resend";
import { getFirstName } from "@/lib/my-access/greeting";
import { buildMyAccessPath, buildMyAccessUrl } from "@/lib/my-access/link";
import { logSafeError } from "@/lib/safe-error-log";
import {
  getTelegramChatMember,
  revokeTelegramChatInviteLink,
} from "@/lib/telegram/bot-api";
import { isActiveTelegramMember } from "@/lib/telegram/chat-membership";
import {
  createTelegramLoginNonce,
  getTelegramLoginClientId,
  getTelegramUserIdFromClaims,
  isTelegramLoginConfigured,
  verifyTelegramLoginIdToken,
  verifyTelegramLoginNonce,
} from "@/lib/telegram/login";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

import { buildInvitationUrl, invitationNonceScope, verifyInvitationToken } from "./link";

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const NAME_MAX = 80;
const NOTE_MAX = 500;

const isProduction = () =>
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");

const nonRetryable = (message: string) =>
  Object.assign(new Error(message), { retryable: false });

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
const linksEmailKey = (purchaseId: string) =>
  `${invitationEmailKeyPrefix(purchaseId)}links`;

const enqueueInvitationEmail = async ({
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
    livemode: isProduction(),
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

export type InvitationAccessLine =
  | { accessKey: "inspiration-hub" | "main-group"; state: "link"; url: string }
  | { accessKey: "inspiration-hub" | "main-group"; state: "member" }
  | { accessKey: "inspiration-hub"; state: "extended"; until: string | null }
  | { accessKey: "inspiration-hub"; state: "scheduled"; startsAt: string | null }
  | { accessKey: "inspiration-hub" | "main-group"; state: "unavailable" };

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

const isMemberOf = async (chatId: string, telegramUserId: string) => {
  try {
    return isActiveTelegramMember(
      await getTelegramChatMember({ chatId, userId: telegramUserId }),
    );
  } catch (error) {
    // A failed check is not an answer: the link is shown.
    logSafeError("Failed to check invitation chat membership", error);
    return false;
  }
};

/**
 * One line per access of the invitation, from the access service itself: a link, a
 * Hub already running («extended»), a Hub that opens later, or nothing to give. With
 * a confirmed account, a chat it already sits in shows that instead of a link.
 */
export async function collectInvitationAccessLines(
  invitation: AccessInvitationRecord,
  telegramUserId: string | null = invitation.telegramUserId,
): Promise<InvitationAccessLine[]> {
  const record = await findPaymentRecordByIntentIdFromDatabase(
    invitation.paymentIntentId,
  );
  if (!record) return [];

  const chats = await chatsOfInvitation(
    invitation,
    record.telegram_channel_chat_id.trim(),
  );
  const membership = new Map(
    telegramUserId
      ? await Promise.all(
          chats.map(
            async (chat) =>
              [chat.accessKey, await isMemberOf(chat.chatId, telegramUserId)] as const,
          ),
        )
      : [],
  );
  // Only a member of every group chat needs no access service at all; the Hub always
  // asks it, for the dates of the period.
  const onlyMembers =
    chats.length > 0 &&
    chats.every(
      (chat) => chat.accessKey === "main-group" && membership.get(chat.accessKey),
    );
  let items: NonNullable<Awaited<ReturnType<typeof ensureOnlineGroupAccessForPayment>>> =
    [];
  if (!onlyMembers) {
    try {
      items = (await ensureOnlineGroupAccessForPayment(record)) ?? [];
    } catch (error) {
      // Telegram down: the page and the email say «no link yet» instead of failing.
      logSafeError("Failed to ensure invitation accesses", error);
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
      (item?.status === "active" || membership.get(chat.accessKey))
    ) {
      return {
        accessKey: "inspiration-hub",
        state: "extended",
        until: item?.accessExpiresAt || null,
      };
    }
    if (membership.get(chat.accessKey) || item?.status === "active") {
      return { accessKey: chat.accessKey, state: "member" };
    }
    if (item?.status === "ready" && item.accessUrl) {
      return { accessKey: chat.accessKey, state: "link", url: item.accessUrl };
    }
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

const invitationLocale = (invitation: AccessInvitationRecord): InvitationLocale =>
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

/* ---------- The invitation page ---------- */

export type InvitationSummary = {
  firstName: string;
  product: InvitationProduct;
  cohortTitle: string | null;
  locale: InvitationLocale;
};

export type InvitationPageState =
  | { status: "invalid" | "expired" | "revoked" | "unavailable" }
  | {
      status: "ready";
      summary: InvitationSummary;
      clientId: string;
      nonce: string;
    }
  | {
      status: "verified";
      summary: InvitationSummary;
      lines: InvitationAccessLine[];
      myAccessPath: string | null;
    };

const summarize = (invitation: AccessInvitationRecord): InvitationSummary => ({
  firstName: getFirstName(invitation.customerFullNameSnapshot) ?? "",
  product: getInvitationProduct(invitation.offerExternalId ?? ""),
  cohortTitle: invitation.cohortTitle,
  locale: invitationLocale(invitation),
});

const myAccessPathOf = (invitation: AccessInvitationRecord) =>
  buildMyAccessPath(invitation.customerId);

const loadRenewalInvitation = async (
  token: string | null | undefined,
): Promise<
  { invitation: AccessInvitationRecord } | { status: "invalid" | "expired" | "revoked" }
> => {
  const check = verifyInvitationToken(token);
  if (check.status !== "valid") return { status: check.status };

  const invitation = await readAccessInvitation(check.purchaseId);
  if (!invitation || invitation.invitationKind !== "renewal")
    return { status: "invalid" };
  if (invitation.outcome !== "succeeded") return { status: "revoked" };
  return { invitation };
};

/** What the page shows: the welcome with the Telegram button, or the result again. */
export async function readInvitationPage(
  token: string | null | undefined,
): Promise<InvitationPageState> {
  if (!isTelegramLoginConfigured()) return { status: "unavailable" };

  const loaded = await loadRenewalInvitation(token);
  if (!("invitation" in loaded)) return loaded;

  const { invitation } = loaded;
  if (invitation.telegramUserId) {
    return {
      status: "verified",
      summary: summarize(invitation),
      lines: await collectInvitationAccessLines(invitation),
      myAccessPath: myAccessPathOf(invitation),
    };
  }

  return {
    status: "ready",
    summary: summarize(invitation),
    clientId: getTelegramLoginClientId(),
    nonce: createTelegramLoginNonce(invitationNonceScope(invitation.id)),
  };
}

export type InvitationConfirmResult =
  | {
      status: "verified";
      lines: InvitationAccessLine[];
      myAccessPath: string | null;
      emailed: boolean;
    }
  | {
      status: "error";
      errorCode:
        | "invalid"
        | "expired"
        | "revoked"
        | "other_account"
        | "invalid_telegram_login_nonce"
        | "telegram_login_failed";
    };

/**
 * The renewal check: the Telegram login proves the account, the invitation takes it
 * as its owner, and the links are made (or «already in the chat» shown). A repeat
 * returns the same links and sends no second email.
 */
export async function confirmAccessInvitation({
  idToken,
  nonce,
  token,
}: {
  idToken: string;
  nonce: string;
  token: string;
}): Promise<InvitationConfirmResult> {
  const loaded = await loadRenewalInvitation(token);
  if (!("invitation" in loaded)) return { status: "error", errorCode: loaded.status };

  const { invitation } = loaded;
  if (
    !nonce ||
    !verifyTelegramLoginNonce({ ...invitationNonceScope(invitation.id), nonce })
  ) {
    return { status: "error", errorCode: "invalid_telegram_login_nonce" };
  }

  let telegramUserId: string;
  try {
    telegramUserId = getTelegramUserIdFromClaims(
      await verifyTelegramLoginIdToken(idToken, nonce),
    );
  } catch (error) {
    logSafeError("Failed to verify an invitation Telegram login", error);
    return { status: "error", errorCode: "telegram_login_failed" };
  }
  if (!telegramUserId) return { status: "error", errorCode: "telegram_login_failed" };

  const ownerWrite = await confirmInvitationTelegramInDatabase({
    purchaseId: invitation.id,
    telegramUserId,
  });
  if (ownerWrite === "mismatch") return { status: "error", errorCode: "other_account" };

  const confirmed = (await readAccessInvitation(invitation.id)) ?? invitation;
  const lines = await collectInvitationAccessLines(confirmed, telegramUserId);
  const linkKeys = lines.flatMap((line) =>
    line.state === "link" ? [line.accessKey] : [],
  );

  if (linkKeys.length > 0 && confirmed.customerEmailSnapshot) {
    await enqueueInvitationEmail({
      deduplicationKey: linksEmailKey(invitation.id),
      payload: { purchaseId: invitation.id, template: "links", accessKeys: linkKeys },
      recipient: confirmed.customerEmailSnapshot,
    });
  }

  return {
    status: "verified",
    lines,
    myAccessPath: myAccessPathOf(confirmed),
    emailed: linkKeys.length > 0 && Boolean(confirmed.customerEmailSnapshot),
  };
}
