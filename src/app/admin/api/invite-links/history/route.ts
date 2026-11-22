import { setAdminJournalArchived } from "@/db/access-invitations";
import { listAdminInviteLinkHistoryRecords } from "@/lib/admin-invite-link-history-read-runtime";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { getSafeErrorCategory, logSafeError } from "@/lib/safe-error-log";
import {
  formatPurchaseLine,
  getAdminPurchaseLine,
} from "@/lib/sellable-products-localization";
import { ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW } from "@/lib/telegram/admin-offer-access";
import { DAY_MS } from "@/lib/time";

export const runtime = "nodejs";
const HISTORY_CACHE_TTL_MS = 30_000;
const STALE_HISTORY_CACHE_TTL_MS = 5 * 60_000;

type LinkState = "active" | "expired" | "used";

type HistoryEntry = {
  accessUrl: string;
  /** In «Архив»: removed by hand, or over — used a week ago, expired a month ago. */
  archived: "manual" | "auto" | null;
  purchaseId: string;
  adminLabel: string;
  createdAtIso: string;
  linkState: LinkState;
  selectionLabel: string;
  tokenExpiresAt: string;
};

type HistoryCacheEntry = {
  cachedAt: number;
  items: HistoryEntry[];
};

let historyCacheEntry: HistoryCacheEntry | null = null;
let pendingHistoryFetch: Promise<HistoryEntry[]> | null = null;

const normalizeLanguageLabel = (value: string) => {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "en") {
    return "EN";
  }

  if (normalizedValue === "ru") {
    return "RU";
  }

  return value.trim().toUpperCase();
};

/** The same line as the generator: "Разбор «Her Lies» · Без куратора · RU". */
const buildSelectionLabel = ({
  language,
  offerId,
  offerLabel,
  productTitle,
}: {
  language: string;
  offerId: string;
  offerLabel: string;
  productTitle: string;
}) =>
  [
    (offerId ? getAdminPurchaseLine(offerId) : null) ??
      formatPurchaseLine(productTitle, offerLabel),
    normalizeLanguageLabel(language),
  ]
    .filter(Boolean)
    .join(" · ");

const isFreshHistoryCache = (entry: HistoryCacheEntry) =>
  entry.cachedAt + HISTORY_CACHE_TTL_MS > Date.now();

const hasUsableStaleHistoryCache = (entry: HistoryCacheEntry) =>
  entry.cachedAt + STALE_HISTORY_CACHE_TTL_MS > Date.now();

const fetchHistoryItems = async () => {
  const historySourceRows = await listAdminInviteLinkHistoryRecords({
    accessWorkflow: ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW,
  });

  const items = historySourceRows.map((row) => {
    const adminLabel = row.adminLabel.trim() || row.purchaseItem.trim();

    const linkState: LinkState = row.tokenUsedAt.trim()
      ? "used"
      : row.tokenExpiresAt && Date.parse(row.tokenExpiresAt) <= Date.now()
        ? "expired"
        : "active";
    const since = (iso: string) => (iso ? Date.now() - Date.parse(iso) : 0);

    return {
      accessUrl: row.accessUrl,
      archived: row.archivedAt
        ? "manual"
        : (linkState === "used" && since(row.tokenUsedAt) > 7 * DAY_MS) ||
            (linkState === "expired" && since(row.tokenExpiresAt) > 30 * DAY_MS)
          ? "auto"
          : null,
      purchaseId: row.purchaseId,
      adminLabel,
      createdAtIso: row.createdAt,
      // An unused link past its expiry no longer opens: never offer it as active.
      linkState,
      selectionLabel: buildSelectionLabel({
        language: row.lessonLanguage,
        offerId: row.offerId,
        offerLabel: row.offerLabel,
        productTitle: row.productTitle,
      }),
      tokenExpiresAt: row.tokenExpiresAt,
    } satisfies HistoryEntry;
  });

  historyCacheEntry = {
    cachedAt: Date.now(),
    items,
  };

  return items;
};

const resolveHistoryItems = async ({ forceRefresh }: { forceRefresh: boolean }) => {
  if (!forceRefresh && historyCacheEntry && isFreshHistoryCache(historyCacheEntry)) {
    return historyCacheEntry.items;
  }

  if (pendingHistoryFetch) {
    return pendingHistoryFetch;
  }

  pendingHistoryFetch = fetchHistoryItems().finally(() => {
    pendingHistoryFetch = null;
  });

  return pendingHistoryFetch;
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  if (!forceRefresh && historyCacheEntry && isFreshHistoryCache(historyCacheEntry)) {
    return jsonNoStore({
      items: historyCacheEntry.items,
    });
  }

  const requesterIp = getRequestIp(request);
  const rateLimit = await consumeRateLimit({
    key: `admin:invite-links:history:${requesterIp}`,
    limit: 30,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    if (historyCacheEntry && hasUsableStaleHistoryCache(historyCacheEntry)) {
      return jsonNoStore({
        items: historyCacheEntry.items,
        stale: true,
      });
    }

    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  try {
    const items = await resolveHistoryItems({
      forceRefresh,
    });

    return jsonNoStore({
      items,
    });
  } catch (error) {
    if (historyCacheEntry && hasUsableStaleHistoryCache(historyCacheEntry)) {
      return jsonNoStore({
        items: historyCacheEntry.items,
        stale: true,
      });
    }

    console.error("Failed to fetch admin invite-link history", {
      errorName: getSafeErrorCategory(error),
    });

    return jsonErrorNoStore("admin_invite_link_history_failed", { status: 500 });
  }
}

/** «Убрать из журнала» / «Вернуть в журнал» for one link; the access is untouched. */
export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }
  const requestError = getBrowserJsonRequestErrorResponse(request, 1024);
  if (requestError) return requestError;

  const rateLimit = await consumeRateLimit({
    key: `admin:invite-links:archive:${getRequestIp(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimit.limited) return jsonErrorNoStore("rate_limited", { status: 429 });

  try {
    const { body, errorResponse } = await parseJsonBody<{
      archived?: unknown;
      purchaseId?: unknown;
    }>(request, 1024);
    if (errorResponse) return errorResponse;
    const purchaseId = typeof body?.purchaseId === "string" ? body.purchaseId.trim() : "";
    if (!/^[0-9a-f-]{36}$/u.test(purchaseId) || typeof body?.archived !== "boolean") {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const changed = await setAdminJournalArchived({
      archived: body.archived,
      purchaseId,
    });
    historyCacheEntry = null;
    return jsonNoStore({ status: changed ? "done" : "not_found" });
  } catch (error) {
    logSafeError("Failed to archive an admin invite link", error);
    return jsonErrorNoStore("admin_invite_link_archive_failed", { status: 500 });
  }
}
