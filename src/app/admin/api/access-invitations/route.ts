import { eq } from "drizzle-orm";

import {
  findInvitationContactHint,
  findInvitationDuplicates,
  type InvitationJournalEntry,
  listAccessInvitations,
  setAdminJournalArchived,
} from "@/db/access-invitations";
import { getDatabase } from "@/db/client";
import { telegramChats } from "@/db/schema";
import { describeInvitationJournalEntry } from "@/lib/access-invitations/journal";
import { buildInvitationUrl } from "@/lib/access-invitations/link";
import {
  getInvitationProduct,
  issueAccessInvitation,
  recheckInvitationMembership,
  resendAccessInvitation,
  resolveInvitationTarget,
  revokeAccessInvitation,
  sendInvitationLinks,
} from "@/lib/access-invitations/service";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;

type Scope = "group" | "hub";
type InvitationBody = {
  action?: string;
  confirmDuplicates?: boolean;
  email?: string;
  firstName?: string;
  kind?: string;
  lastName?: string;
  locale?: string;
  note?: string;
  product?: string;
  purchaseId?: string;
};

const readScope = (value: string | null): Scope => (value === "hub" ? "hub" : "group");

const rateLimited = (retryAfterSeconds: number) =>
  jsonErrorNoStore("rate_limited", {
    headers: { "Retry-After": String(retryAfterSeconds) },
    status: 429,
  });

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** One journal row as the admin shows it; a renewal carries a fresh page link to copy. */
const serializeEntry = (entry: InvitationJournalEntry) => {
  const inviteEmails = entry.emails.filter((email) => email.key.includes(":invite:"));
  const latestInvite = inviteEmails.at(-1) ?? null;
  const linksEmails = entry.emails.filter((email) => email.key.includes(":links"));
  const latestLinks = linksEmails.at(-1) ?? null;
  const view = describeInvitationJournalEntry({
    ...entry,
    inviteEmailStatus: latestInvite?.status ?? null,
  });
  const used = entry.accesses.some(
    (access) => access.state === "member" || access.state === "left",
  );

  return {
    purchaseId: entry.purchaseId,
    kind: entry.kind,
    product: getInvitationProduct(entry.offerExternalId),
    offerLabel: entry.offerLabel,
    fullName: entry.fullName,
    email: entry.email,
    locale: entry.locale,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    cohortTitle: entry.cohortTitle,
    revoked: entry.revoked,
    telegramConfirmed: entry.telegramConfirmed,
    revocable: entry.kind !== null && !entry.revoked && !entry.telegramConfirmed && !used,
    inviteEmail: latestInvite
      ? {
          status: latestInvite.status,
          sentAt: iso(latestInvite.sentAt),
          sends: inviteEmails.filter((email) => email.status === "sent").length,
        }
      : null,
    linksEmail: latestLinks
      ? {
          status: latestLinks.status,
          sentAt: iso(latestLinks.sentAt),
          sends: linksEmails.filter((email) => email.status === "sent").length,
        }
      : null,
    pageUrl:
      entry.kind === "renewal" && !entry.revoked
        ? buildInvitationUrl(entry.purchaseId, entry.locale)
        : null,
    ...view,
  };
};

export type AdminInvitationEntry = ReturnType<typeof serializeEntry>;

const TARGET_REFUSALS = {
  cohort_closed:
    "Текущий поток уже закрыт. Заведи следующий поток и переключи на него Online Group.",
  cohort_missing:
    "У чата текущего потока нет записи потока. Проверь Online Group → Потоки.",
  group_not_configured: "Поток не настроен: нужны активные чаты потока и библиотеки.",
  hub_not_configured: "Не выбран чат Inspiration Hub. Выбери его в настройках Hub.",
} as const;

const describeTarget = async (scope: Scope) => {
  const resolved = await resolveInvitationTarget(scope);
  if ("refusal" in resolved) {
    return { ready: false as const, problem: TARGET_REFUSALS[resolved.refusal] };
  }

  const { target } = resolved;
  const chatId = target.kind === "group" ? target.mainChatId : target.hubChatId;
  const [chat] = await getDatabase()
    .select({ title: telegramChats.title })
    .from(telegramChats)
    .where(eq(telegramChats.chatId, chatId))
    .limit(1);
  const chatTitle = chat?.title ?? chatId;

  return target.kind === "group"
    ? { ready: true as const, cohortTitle: target.cohortTitle, chatTitle }
    : { ready: true as const, cohortTitle: null, chatTitle };
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:access-invitations:read",
    limit: 60,
    request,
    windowMs: 60_000,
  });
  if (rateLimit.limited) return rateLimited(rateLimit.retryAfterSeconds);

  const url = new URL(request.url);
  const scope = readScope(url.searchParams.get("scope"));
  const email = url.searchParams.get("email")?.trim().slice(0, 254) ?? "";

  try {
    if (email) {
      const resolved = await resolveInvitationTarget(scope);
      const cohortId =
        "target" in resolved && resolved.target.kind === "group"
          ? resolved.target.cohortId
          : null;
      const [hint, duplicates] = await Promise.all([
        findInvitationContactHint(email),
        findInvitationDuplicates({ cohortId, email }),
      ]);
      return jsonNoStore({ hint, duplicates });
    }

    const [target, entries] = await Promise.all([
      describeTarget(scope),
      listAccessInvitations({ scope }),
    ]);
    return jsonNoStore({ target, entries: entries.map(serializeEntry) });
  } catch (error) {
    logSafeError("Failed to load admin access invitations", error);
    return jsonErrorNoStore("access_invitations_unavailable", { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_BODY_BYTES,
  );
  if (requestErrorResponse) return requestErrorResponse;

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:access-invitations",
    limit: 30,
    onBackendUnavailable: "deny",
    request,
    windowMs: 60_000,
  });
  if (rateLimit.backendUnavailable) {
    return jsonErrorNoStore("rate_limit_unavailable", { status: 503 });
  }
  if (rateLimit.limited) return rateLimited(rateLimit.retryAfterSeconds);

  try {
    const { body, errorResponse } = await parseJsonBody<InvitationBody>(
      request,
      MAX_BODY_BYTES,
    );
    if (errorResponse) return errorResponse;
    if (!body) return jsonErrorNoStore("invalid_request_body", { status: 400 });

    if (body.action === "issue") {
      const result = await issueAccessInvitation({
        confirmDuplicates: body.confirmDuplicates === true,
        email: body.email ?? "",
        firstName: body.firstName ?? "",
        kind: body.kind ?? "",
        lastName: body.lastName ?? "",
        locale: body.locale ?? "",
        note: body.note ?? "",
        product: body.product ?? "",
      });

      if (result.status === "invalid") {
        return jsonNoStore(
          { errorCode: "invalid_field", field: result.field },
          { status: 400 },
        );
      }
      if (result.status === "refused") {
        return jsonNoStore(
          { errorCode: "target_unavailable", problem: TARGET_REFUSALS[result.refusal] },
          { status: 409 },
        );
      }
      return jsonNoStore(result);
    }

    const purchaseId = body.purchaseId?.trim() ?? "";
    if (!/^[0-9a-f-]{36}$/u.test(purchaseId)) {
      return jsonErrorNoStore("invalid_purchase_id", { status: 400 });
    }

    if (body.action === "resend") {
      return jsonNoStore({ status: await resendAccessInvitation(purchaseId) });
    }
    if (body.action === "resend_links") {
      const result = await sendInvitationLinks(purchaseId, { checkLimit: false });
      return jsonNoStore({ status: result.status });
    }
    if (body.action === "archive" || body.action === "unarchive") {
      const changed = await setAdminJournalArchived({
        archived: body.action === "archive",
        purchaseId,
      });
      return jsonNoStore({ status: changed ? "done" : "not_found" });
    }
    if (body.action === "recheck") {
      return jsonNoStore(await recheckInvitationMembership(purchaseId));
    }
    if (body.action === "revoke") {
      return jsonNoStore({ status: await revokeAccessInvitation(purchaseId) });
    }

    return jsonErrorNoStore("invalid_action", { status: 400 });
  } catch (error) {
    logSafeError("Failed to change an admin access invitation", error);
    return jsonErrorNoStore("access_invitation_failed", { status: 500 });
  }
}
