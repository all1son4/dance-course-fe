import {
  INSPIRATION_HUB_DISCOUNT_SLUG,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import {
  createEmailCampaignLeadInDatabase,
  findEmailCampaignLeadByLeadIdInDatabase,
  getCampaignEmailDeliveryDeduplicationKey,
  holdEmailCampaignAddressInDatabase,
} from "@/db/business-operation-jobs";
import {
  type CohortInviteAudienceRow,
  type CohortInviteCohort,
  type CohortRenewalSlugs,
  countCampaignSent,
  countResendEmailsSentSince,
  findCohortOnSale,
  findCohortRenewalSlugs,
  findResendEmailSentAt,
  listCampaignAddressStates,
  listCohortInviteAudience,
} from "@/db/cohort-invite-broadcast";
import {
  enqueueCampaignEmailDelivery,
  processBusinessOperationOutboxJob,
} from "@/lib/business-operation-outbox";
import {
  buildCohortInviteEmail,
  type CohortInviteLocale,
} from "@/lib/email/cohort-invite";
import { isResendQuotaError, sendResendEmail } from "@/lib/email/resend";
import {
  buildUnsubscribeUrl,
  isUnsubscribeLinkConfigured,
} from "@/lib/email/unsubscribe-link";
import {
  createLeadId,
  isValidEmailCampaignEmail,
  normalizeEmailCampaignEmail,
} from "@/lib/email-campaigns";
import { buildMyAccessUrl } from "@/lib/my-access/link";
import { getProductSaleState, type ProductSaleState } from "@/lib/sales-availability";
import { normalizedSiteUrl } from "@/lib/seo";

/*
 * «Приглашение в поток»: one email to every past buyer about the cohort on sale.
 * There is no stored list: the audience is computed from purchases each time the
 * tab opens and again right before a batch, so whoever paid in between drops out.
 * A campaign row appears only when a batch sends to that address.
 */

/*
 * The daily ceiling. Resend's limit (100 a day, owner 2026-11-18): 60 of them go
 * to the broadcasts, the other 40 stay for purchase emails, «Мой доступ» links
 * and test sends, which this counter does not see.
 */
export const RESEND_DAILY_LIMIT = 100;
export const PURCHASE_EMAIL_RESERVE = 40;
export const DEFAULT_BATCH_SIZE = 15;
/** Between two sends: stays under Resend's per-second rate limit. */
const SEND_PAUSE_MS = 600;
const DAY_MS = 24 * 60 * 60 * 1000;

export const COHORT_INVITE_CAMPAIGN_PREFIX = "cohort_invite:";
/** Rows of this key only carry the global block of an unsubscribed address. */
export const EMAIL_UNSUBSCRIBE_CAMPAIGN_KEY = "unsubscribed";

export const getCohortInviteCampaignKey = (cohortId: string) =>
  `${COHORT_INVITE_CAMPAIGN_PREFIX}${cohortId}`;

/** The language of the latest purchase; anything else (or nothing) reads English. */
export const resolveCohortInviteLocale = (locale: string | null): CohortInviteLocale => {
  const normalized = (locale ?? "").trim().toLowerCase();
  return normalized === "ru" || normalized === "pl" ? normalized : "en";
};

/* ---------- Who gets the email ---------- */

export type CohortInviteRecipient = CohortInviteAudienceRow & {
  locale: CohortInviteLocale;
};

export type CohortInviteCounts = {
  /** Paid for the cohort on sale, or holds a running Hub bought on its own. */
  alreadyBought: number;
  /** Unsubscribed, blocked everywhere or excluded from this campaign. */
  excluded: number;
  failed: number;
  inProgress: number;
  remaining: number;
  sent: number;
};

/**
 * The owner's rules, in order: a sent or sending row is done; buyers of the cohort
 * on sale and of a running standalone Hub are left out (a Hub left over from Plus
 * is not); blocked and excluded addresses are left out; a failed row is retried.
 * Previous-cohort members go first (their special prices end soonest), then by address.
 */
export const classifyCohortInviteAudience = (
  rows: readonly CohortInviteAudienceRow[],
) => {
  const counts: CohortInviteCounts = {
    alreadyBought: 0,
    excluded: 0,
    failed: 0,
    inProgress: 0,
    remaining: 0,
    sent: 0,
  };
  const recipients: CohortInviteRecipient[] = [];

  for (const row of rows) {
    if (row.campaignStatus === "sent") counts.sent += 1;
    else if (row.campaignStatus === "sending") counts.inProgress += 1;
    else if (row.paidCurrentCohort || row.standaloneHubActive) counts.alreadyBought += 1;
    else if (
      row.blocked ||
      row.campaignStatus === "excluded" ||
      row.campaignStatus === "blocked"
    ) {
      counts.excluded += 1;
    } else {
      if (row.campaignStatus === "failed") counts.failed += 1;
      recipients.push({ ...row, locale: resolveCohortInviteLocale(row.locale) });
    }
  }

  recipients.sort(
    (left, right) =>
      Number(right.paidPreviousCohort) - Number(left.paidPreviousCohort) ||
      left.email.localeCompare(right.email),
  );
  counts.remaining = recipients.length;

  return { counts, recipients };
};

/* ---------- Which links ---------- */

export type CohortInviteLinks = {
  hub: string | null;
  /** What the admin table says: the renewal prices or the product pages. */
  kind: "pages" | "renewal";
  hubSpecialPrice: boolean;
  myAccess: string;
  plus: string;
  standard: string;
};

const withAttribution = (
  path: string,
  campaignKey: string,
  content: "hub_only" | "my_access" | "plus" | "standard",
) => {
  const url = new URL(path, normalizedSiteUrl);
  url.searchParams.set("utm_source", "broadcast");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", campaignKey);
  url.searchParams.set("utm_content", content);
  return url.toString();
};

/**
 * A previous-cohort member who has not paid the new one gets the renewal of each
 * tariff (when its campaign is active) and the Hub's special price while her Hub
 * still runs; everyone else gets the product pages. No Hub block while its sales
 * are closed.
 */
export const chooseCohortInviteLinks = ({
  campaignKey,
  hubOnSale,
  myAccessUrl = null,
  recipient,
  renewal,
}: {
  campaignKey: string;
  hubOnSale: boolean;
  myAccessUrl?: string | null;
  recipient: Pick<CohortInviteRecipient, "hubActive" | "locale" | "paidPreviousCohort">;
  renewal: CohortRenewalSlugs;
}): CohortInviteLinks => {
  const base = `/${recipient.locale}`;
  const groupPage = `${base}/online/group`;
  const renewalPath = (slug: string | null) =>
    recipient.paidPreviousCohort && slug ? `${base}/payment?renewal=${slug}` : groupPage;
  const hubSpecialPrice =
    hubOnSale && recipient.paidPreviousCohort && recipient.hubActive;
  const standard = renewalPath(renewal.standard);
  const plus = renewalPath(renewal.plus);

  return {
    hub: hubOnSale
      ? withAttribution(
          hubSpecialPrice
            ? `${base}/payment?renewal=${INSPIRATION_HUB_DISCOUNT_SLUG}`
            : `${base}/online/inspiration-hub`,
          campaignKey,
          "hub_only",
        )
      : null,
    hubSpecialPrice,
    kind: standard !== groupPage || plus !== groupPage ? "renewal" : "pages",
    // Without a personal link (no customer row, or a test send) the page asks for one by email.
    myAccess: withAttribution(myAccessUrl ?? `${base}/access`, campaignKey, "my_access"),
    plus: withAttribution(plus, campaignKey, "plus"),
    standard: withAttribution(standard, campaignKey, "standard"),
  };
};

/* ---------- The daily ceiling ---------- */

export const getRemainingToday = (sentLast24h: number) =>
  Math.max(0, RESEND_DAILY_LIMIT - PURCHASE_EMAIL_RESERVE - sentLast24h);

export type BatchSizeCheck =
  | { ok: true; size: number }
  | {
      error:
        "batch_size_invalid" | "daily_limit_reached" | "no_recipients" | "over_limit";
      ok: false;
    };

/** A batch is a whole number of emails, at most what is left today and in the list. */
export const checkBatchSize = ({
  recipients,
  remainingToday,
  size,
}: {
  recipients: number;
  remainingToday: number;
  size: unknown;
}): BatchSizeCheck => {
  if (typeof size !== "number" || !Number.isInteger(size) || size < 1) {
    return { error: "batch_size_invalid", ok: false };
  }
  if (recipients === 0) return { error: "no_recipients", ok: false };
  if (remainingToday === 0) return { error: "daily_limit_reached", ok: false };
  if (size > Math.min(remainingToday, recipients))
    return { error: "over_limit", ok: false };
  return { ok: true, size };
};

/* ---------- Reading the state ---------- */

type CohortInviteContext = {
  campaignKey: string;
  cohort: CohortInviteCohort;
  counts: CohortInviteCounts;
  groupSaleState: ProductSaleState;
  hubSaleState: ProductSaleState;
  recipients: CohortInviteRecipient[];
  renewal: CohortRenewalSlugs;
  rows: CohortInviteAudienceRow[];
  sentLast24h: number;
};

const loadContext = async (now: Date): Promise<CohortInviteContext | null> => {
  const cohort = await findCohortOnSale();
  if (!cohort) return null;

  const campaignKey = getCohortInviteCampaignKey(cohort.id);
  const [rows, renewal, sentLast24h, groupSaleState, hubSaleState, sent] =
    await Promise.all([
      listCohortInviteAudience({
        campaignKey,
        cohortId: cohort.id,
        now,
        previousCohortId: cohort.previousCohortId,
      }),
      findCohortRenewalSlugs({
        mainChatId: cohort.mainChatId,
        now,
        previousMainChatId: cohort.previousMainChatId,
      }),
      countResendEmailsSentSince(new Date(now.getTime() - DAY_MS)),
      getProductSaleState(SELLABLE_PRODUCTS["online-group-anna-strok"].id),
      getProductSaleState(SELLABLE_PRODUCTS["inspiration-hub"].id),
      countCampaignSent(campaignKey),
    ]);
  const { counts, recipients } = classifyCohortInviteAudience(rows);

  return {
    campaignKey,
    cohort,
    // Buyers and typed addresses alike: the audience alone sees only buyers.
    counts: { ...counts, sent },
    groupSaleState,
    hubSaleState,
    recipients,
    renewal,
    rows,
    sentLast24h,
  };
};

export type CohortInviteAdminRecipient = {
  email: string;
  fullName: string;
  hubSpecialPrice: boolean;
  links: CohortInviteLinks["kind"];
  locale: CohortInviteLocale;
  retry: boolean;
};

export type CohortInviteAdminSnapshot =
  | { cohort: null }
  | {
      campaignKey: string;
      cohort: { durationWeeks: number; startsAt: string; title: string };
      counts: CohortInviteCounts;
      defaultBatchSize: number;
      hubOnSale: boolean;
      quota: {
        dailyLimit: number;
        /** Only while today's share is spent: when a default batch fits again. */
        nextBatch: { at: string; size: number } | null;
        remainingToday: number;
        reserve: number;
        sentLast24h: number;
      };
      recipients: CohortInviteAdminRecipient[];
      renewal: { plus: boolean; standard: boolean };
      salesOpen: boolean;
      unsubscribeConfigured: boolean;
    };

const toSnapshot = (
  context: CohortInviteContext | null,
  nextBatch: { at: string; size: number } | null = null,
): CohortInviteAdminSnapshot => {
  if (!context) return { cohort: null };

  const hubOnSale = context.hubSaleState === "open";

  return {
    campaignKey: context.campaignKey,
    cohort: {
      durationWeeks: context.cohort.durationWeeks,
      startsAt: context.cohort.startsAt.toISOString(),
      title: context.cohort.title,
    },
    counts: context.counts,
    defaultBatchSize: DEFAULT_BATCH_SIZE,
    hubOnSale,
    quota: {
      dailyLimit: RESEND_DAILY_LIMIT,
      nextBatch,
      remainingToday: getRemainingToday(context.sentLast24h),
      reserve: PURCHASE_EMAIL_RESERVE,
      sentLast24h: context.sentLast24h,
    },
    recipients: context.recipients.map((recipient) => {
      const links = chooseCohortInviteLinks({
        campaignKey: context.campaignKey,
        hubOnSale,
        recipient,
        renewal: context.renewal,
      });
      return {
        email: recipient.email,
        fullName: recipient.fullName,
        hubSpecialPrice: links.hubSpecialPrice,
        links: links.kind,
        locale: recipient.locale,
        retry: recipient.campaignStatus === "failed",
      };
    }),
    renewal: {
      plus: Boolean(context.renewal.plus),
      standard: Boolean(context.renewal.standard),
    },
    salesOpen: context.groupSaleState === "open",
    unsubscribeConfigured: isUnsubscribeLinkConfigured(),
  };
};

/**
 * How many of the oldest emails in the 24-hour window must leave it before
 * `size` more fit under today's share; null when nothing has to wait.
 */
export const getEmailsToWaitFor = ({
  sentLast24h,
  size,
}: {
  sentLast24h: number;
  size: number;
}) => {
  const waitFor = sentLast24h - (RESEND_DAILY_LIMIT - PURCHASE_EMAIL_RESERVE) + size;
  return size > 0 && waitFor > 0 && waitFor <= sentLast24h ? waitFor : null;
};

/**
 * When today's share is spent, one extra read says when the next default batch
 * fits: the moment the email that has to leave the window last turns 24 hours old.
 */
const findNextBatch = async (context: CohortInviteContext, now: Date) => {
  if (getRemainingToday(context.sentLast24h) > 0) return null;
  const size = Math.min(DEFAULT_BATCH_SIZE, context.recipients.length);
  const waitFor = getEmailsToWaitFor({ sentLast24h: context.sentLast24h, size });
  if (waitFor === null) return null;

  const sentAt = await findResendEmailSentAt({
    offset: waitFor - 1,
    since: new Date(now.getTime() - DAY_MS),
  });
  return sentAt ? { at: new Date(sentAt.getTime() + DAY_MS).toISOString(), size } : null;
};

export const getCohortInviteAdminSnapshot = async (now = new Date()) => {
  const context = await loadContext(now);
  return toSnapshot(context, context ? await findNextBatch(context, now) : null);
};

/* ---------- Sending ---------- */

const buildRecipientEmail = ({
  campaignKey,
  cohort,
  hubOnSale,
  leadId,
  recipient,
  renewal,
}: {
  campaignKey: string;
  cohort: Pick<CohortInviteCohort, "durationWeeks" | "startsAt" | "title">;
  hubOnSale: boolean;
  leadId: string;
  recipient: Pick<
    CohortInviteRecipient,
    "customerId" | "hubActive" | "locale" | "paidPreviousCohort"
  >;
  renewal: CohortRenewalSlugs;
}) => {
  const links = chooseCohortInviteLinks({
    campaignKey,
    hubOnSale,
    myAccessUrl: buildMyAccessUrl(recipient.customerId, recipient.locale),
    recipient,
    renewal,
  });
  const unsubscribeUrl = buildUnsubscribeUrl(leadId, recipient.locale);

  return {
    ...buildCohortInviteEmail({
      cohort,
      links,
      locale: recipient.locale,
      myAccessUrl: links.myAccess,
      unsubscribeUrl,
    }),
    unsubscribeUrl,
  };
};

export type CohortInviteDeliveryResult = {
  attempted: number;
  failed: number;
  sent: number;
  skipped: number;
  stoppedByQuota: boolean;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends to these recipients one by one through the campaign queue. The unique
 * (campaign, address) row, the job's deduplication key and Resend's idempotency key
 * keep a double click or a parallel request from sending twice. A quota refusal
 * ends the batch: the address goes back to the list unmarked, the rest are untouched.
 */
export const deliverCohortInvite = async ({
  campaignKey,
  cohort,
  hubOnSale,
  now = new Date(),
  pauseMs = SEND_PAUSE_MS,
  recipients,
  renewal,
}: {
  campaignKey: string;
  cohort: Pick<CohortInviteCohort, "durationWeeks" | "startsAt" | "title">;
  hubOnSale: boolean;
  now?: Date;
  pauseMs?: number;
  recipients: readonly CohortInviteRecipient[];
  renewal: CohortRenewalSlugs;
}): Promise<CohortInviteDeliveryResult> => {
  const result: CohortInviteDeliveryResult = {
    attempted: 0,
    failed: 0,
    sent: 0,
    skipped: 0,
    stoppedByQuota: false,
  };

  for (const recipient of recipients) {
    const { lead } = await createEmailCampaignLeadInDatabase({
      campaignKey,
      createdAt: now,
      email: recipient.email,
      fullName: recipient.fullName,
      leadId: createLeadId({ campaignKey, email: recipient.email }),
      locale: recipient.locale,
      socialContact: "",
    });

    if (lead.emailSendStatus !== "pending" && lead.emailSendStatus !== "failed") {
      result.skipped += 1;
      continue;
    }

    if (result.attempted > 0 && pauseMs > 0) await wait(pauseMs);

    const email = buildRecipientEmail({
      campaignKey,
      cohort,
      hubOnSale,
      leadId: lead.leadId,
      recipient,
      renewal,
    });
    const deduplicationKey = getCampaignEmailDeliveryDeduplicationKey({
      campaignKey,
      leadId: lead.leadId,
    });

    await enqueueCampaignEmailDelivery({
      campaignKey,
      deduplicationKey,
      email: {
        headers: email.unsubscribeUrl
          ? {
              "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
        html: email.html,
        subject: email.subject,
        text: email.text,
        to: lead.normalizedEmail,
      },
      leadId: lead.leadId,
    });
    result.attempted += 1;

    const outcome = await processBusinessOperationOutboxJob(deduplicationKey);

    if (outcome.status === "sent") {
      result.sent += 1;
    } else if (outcome.status === "retry" || outcome.status === "dead_letter") {
      if (isResendQuotaError(outcome.error)) {
        result.attempted -= 1;
        result.stoppedByQuota = true;
        break;
      }
      result.failed += 1;
    } else {
      result.skipped += 1;
    }
  }

  return result;
};

export type CohortInviteBatchError =
  | Extract<BatchSizeCheck, { ok: false }>["error"]
  | "batch_in_progress"
  | "no_cohort_on_sale"
  | "sales_closed"
  | "sales_state_unavailable"
  | "unsubscribe_not_configured";

export type CohortInviteBatchResult =
  | { error: CohortInviteBatchError; ok: false }
  | { ok: true; result: CohortInviteDeliveryResult; snapshot: CohortInviteAdminSnapshot };

let pendingBatch: Promise<unknown> | null = null;

/** One send (batch or list) at a time per server. */
const runExclusive = <T>(task: () => Promise<T>, busy: T): Promise<T> => {
  if (pendingBatch) return Promise.resolve(busy);

  const running = task().finally(() => {
    pendingBatch = null;
  });
  pendingBatch = running;

  return running;
};

/** Why nothing may be sent right now, or null. */
const getSendingRefusal = (
  context: CohortInviteContext | null,
): CohortInviteBatchError | null => {
  if (!context) return "no_cohort_on_sale";
  if (
    context.groupSaleState === "unavailable" ||
    context.hubSaleState === "unavailable"
  ) {
    return "sales_state_unavailable";
  }
  if (context.groupSaleState !== "open") return "sales_closed";
  if (!isUnsubscribeLinkConfigured()) return "unsubscribe_not_configured";
  return null;
};

const deliverInContext = (
  context: CohortInviteContext,
  recipients: readonly CohortInviteRecipient[],
  now: Date,
) =>
  deliverCohortInvite({
    campaignKey: context.campaignKey,
    cohort: context.cohort,
    hubOnSale: context.hubSaleState === "open",
    now,
    recipients,
    renewal: context.renewal,
  });

/** «Отправить партию»: the first N of the audience read again right now. */
export const sendCohortInviteBatch = (size: unknown): Promise<CohortInviteBatchResult> =>
  runExclusive<CohortInviteBatchResult>(
    async () => {
      const now = new Date();
      // The audience is read again here, not taken from the screen the admin saw.
      const context = await loadContext(now);
      const refusal = getSendingRefusal(context);

      if (refusal || !context)
        return { error: refusal ?? "no_cohort_on_sale", ok: false };

      const check = checkBatchSize({
        recipients: context.recipients.length,
        remainingToday: getRemainingToday(context.sentLast24h),
        size,
      });

      if (!check.ok) return check;

      const result = await deliverInContext(
        context,
        context.recipients.slice(0, check.size),
        now,
      );

      return { ok: true, result, snapshot: await getCohortInviteAdminSnapshot() };
    },
    { error: "batch_in_progress", ok: false },
  );

/* ---------- Sending to a typed list ---------- */

export const MAX_LISTED_ADDRESSES = 50;

export type CohortInviteAddressStatus =
  /** Will be sent: a past buyer by the usual rules. */
  | "ready"
  /** Will be sent: no purchase under this address, so English and the product pages. */
  | "ready_new"
  | "already_sent"
  | "in_progress"
  | "bought"
  | "excluded"
  | "invalid";

export type CohortInviteAddressCheck = {
  email: string;
  links: CohortInviteLinks["kind"] | null;
  locale: CohortInviteLocale | null;
  status: CohortInviteAddressStatus;
};

/** Commas, semicolons, spaces or new lines; duplicates once; at most 50. */
export const parseAddressList = (input: string) => [
  ...new Set(
    input
      .split(/[\s,;]+/u)
      .map((value) => normalizeEmailCampaignEmail(value))
      .filter(Boolean),
  ),
];

/**
 * The same rules as the audience, for a typed list: an address this campaign
 * already reached (or is reaching) is flagged and skipped, as are buyers of the
 * cohort on sale or of a running Hub and blocked addresses. An address with no
 * purchase is allowed: English, the product pages.
 */
export const checkCohortInviteAddresses = ({
  addresses,
  rows,
  states = [],
}: {
  addresses: readonly string[];
  rows: readonly CohortInviteAudienceRow[];
  /** Campaign rows of the typed addresses, which may have no purchase. */
  states?: readonly Pick<
    CohortInviteAudienceRow,
    "blocked" | "campaignStatus" | "email"
  >[];
}) => {
  const byEmail = new Map(rows.map((row) => [row.email, row]));
  const stateByEmail = new Map(states.map((state) => [state.email, state]));
  const recipients: CohortInviteRecipient[] = [];
  const checks = addresses.map<CohortInviteAddressCheck>((email) => {
    if (!isValidEmailCampaignEmail(email)) {
      return { email, links: null, locale: null, status: "invalid" };
    }

    const row: CohortInviteAudienceRow = byEmail.get(email) ?? {
      blocked: false,
      campaignStatus: null,
      customerId: null,
      email,
      fullName: "",
      hubActive: false,
      locale: null,
      paidCurrentCohort: false,
      paidPreviousCohort: false,
      standaloneHubActive: false,
      ...stateByEmail.get(email),
    };
    const { recipients: ready } = classifyCohortInviteAudience([row]);
    const status: CohortInviteAddressStatus =
      row.campaignStatus === "sent"
        ? "already_sent"
        : row.campaignStatus === "sending"
          ? "in_progress"
          : row.paidCurrentCohort || row.standaloneHubActive
            ? "bought"
            : ready.length === 0
              ? "excluded"
              : byEmail.has(email)
                ? "ready"
                : "ready_new";

    recipients.push(...ready);

    return { email, links: null, locale: ready[0]?.locale ?? null, status };
  });

  return { checks, recipients };
};

export type CohortInviteListResult =
  | { error: CohortInviteBatchError | "too_many_addresses"; ok: false }
  | {
      checks: CohortInviteAddressCheck[];
      ok: true;
      remainingToday: number;
      result: CohortInviteDeliveryResult | null;
      snapshot: CohortInviteAdminSnapshot | null;
    };

const checkListInContext = async (context: CohortInviteContext, addresses: string[]) => {
  const { checks, recipients } = checkCohortInviteAddresses({
    addresses,
    rows: context.rows,
    states: await listCampaignAddressStates({
      campaignKey: context.campaignKey,
      emails: addresses,
    }),
  });
  const hubOnSale = context.hubSaleState === "open";

  return {
    checks: checks.map((check) => {
      const recipient = recipients.find((candidate) => candidate.email === check.email);
      return recipient
        ? {
            ...check,
            links: chooseCohortInviteLinks({
              campaignKey: context.campaignKey,
              hubOnSale,
              recipient,
              renewal: context.renewal,
            }).kind,
          }
        : check;
    }),
    recipients,
  };
};

/** «Проверить»: what each typed address would get; sends nothing. */
export const checkCohortInviteList = async (
  input: string,
): Promise<CohortInviteListResult> => {
  const addresses = parseAddressList(input);
  if (addresses.length > MAX_LISTED_ADDRESSES) {
    return { error: "too_many_addresses", ok: false };
  }

  const context = await loadContext(new Date());
  if (!context) return { error: "no_cohort_on_sale", ok: false };

  return {
    checks: (await checkListInContext(context, addresses)).checks,
    ok: true,
    remainingToday: getRemainingToday(context.sentLast24h),
    result: null,
    snapshot: null,
  };
};

/** «Отправить тем, кто ещё не получал»: checks the list again and sends to the rest. */
export const sendCohortInviteList = (input: string): Promise<CohortInviteListResult> =>
  runExclusive<CohortInviteListResult>(
    async () => {
      const addresses = parseAddressList(input);
      if (addresses.length > MAX_LISTED_ADDRESSES) {
        return { error: "too_many_addresses", ok: false };
      }

      const now = new Date();
      const context = await loadContext(now);
      const refusal = getSendingRefusal(context);

      if (refusal || !context)
        return { error: refusal ?? "no_cohort_on_sale", ok: false };

      const { recipients } = await checkListInContext(context, addresses);
      const check = checkBatchSize({
        recipients: recipients.length,
        remainingToday: getRemainingToday(context.sentLast24h),
        size: recipients.length || 1,
      });

      if (!check.ok) return check;

      const result = await deliverInContext(context, recipients, now);
      const later = new Date();
      const after = await loadContext(later);

      return {
        checks: after ? (await checkListInContext(after, addresses)).checks : [],
        ok: true,
        remainingToday: after ? getRemainingToday(after.sentLast24h) : 0,
        result,
        snapshot: toSnapshot(after, after ? await findNextBatch(after, later) : null),
      };
    },
    { error: "batch_in_progress", ok: false },
  );

/**
 * «Отправить тест себе»: the real email in one language, straight to Resend and
 * outside the campaign (no row, so its unsubscribe link does nothing). It is not
 * in the 24-hour counter either: the reserve covers it.
 */
export const sendCohortInviteTest = async ({
  email,
  links,
  locale,
}: {
  email: string;
  links: "pages" | "renewal";
  locale: CohortInviteLocale;
}) => {
  const now = new Date();
  const context = await loadContext(now);

  if (!context) return { error: "no_cohort_on_sale" as const, ok: false as const };
  if (getRemainingToday(context.sentLast24h) === 0) {
    return { error: "daily_limit_reached" as const, ok: false as const };
  }

  const to = normalizeEmailCampaignEmail(email);
  const message = buildRecipientEmail({
    campaignKey: context.campaignKey,
    cohort: context.cohort,
    hubOnSale: context.hubSaleState === "open",
    leadId: createLeadId({ campaignKey: `${context.campaignKey}:test`, email: to }),
    recipient: {
      customerId: null,
      hubActive: links === "renewal",
      locale,
      paidPreviousCohort: links === "renewal",
    },
    renewal: context.renewal,
  });

  await sendResendEmail({
    html: message.html,
    subject: `[Тест] ${message.subject}`,
    text: message.text,
    to,
  });

  return { ok: true as const };
};

/** Manual exclusion from the admin: this campaign only, or every campaign. */
export const excludeCohortInviteAddress = async ({
  email,
  scope,
}: {
  email: string;
  scope: "campaign" | "global";
}) => {
  if (pendingBatch) return { status: "batch_in_progress" as const };

  const cohort = await findCohortOnSale();
  if (!cohort) return { status: "no_cohort_on_sale" as const };

  const campaignKey = getCohortInviteCampaignKey(cohort.id);
  const normalizedEmail = normalizeEmailCampaignEmail(email);
  const result = await holdEmailCampaignAddressInDatabase({
    campaignKey,
    email: normalizedEmail,
    leadId: createLeadId({ campaignKey, email: normalizedEmail }),
    status: scope === "global" ? "blocked" : "excluded",
  });

  return { status: result.status };
};

/**
 * The unsubscribe click: blocks the address of this row in every campaign. Its
 * own row under a dedicated key keeps the sent history of the campaign intact;
 * a second click finds it blocked and changes nothing.
 */
export const unsubscribeEmailCampaignLead = async (leadId: string) => {
  const lead = await findEmailCampaignLeadByLeadIdInDatabase(leadId);
  if (!lead) return { status: "not_found" as const };

  const result = await holdEmailCampaignAddressInDatabase({
    campaignKey: EMAIL_UNSUBSCRIBE_CAMPAIGN_KEY,
    email: lead.normalizedEmail,
    leadId: createLeadId({
      campaignKey: EMAIL_UNSUBSCRIBE_CAMPAIGN_KEY,
      email: lead.normalizedEmail,
    }),
    locale: lead.locale,
    status: "blocked",
  });

  return { status: result.status === "held" ? ("unsubscribed" as const) : result.status };
};
