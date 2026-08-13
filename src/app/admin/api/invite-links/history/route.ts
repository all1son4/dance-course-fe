import {
  getAdminInviteLinkHistoryProviderErrorDetails,
  isAdminInviteLinkHistoryRateLimitError,
  listAdminInviteLinkHistoryRecords,
} from "@/lib/admin-invite-link-history-read-runtime";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { jsonNoStore } from "@/lib/http-security";
import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";
import { ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW } from "@/lib/telegram/admin-offer-access";

export const runtime = "nodejs";
const HISTORY_CACHE_TTL_MS = 30_000;
const STALE_HISTORY_CACHE_TTL_MS = 5 * 60_000;

type LinkState = "active" | "used";

type HistoryEntry = {
  accessUrl: string;
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

const buildSelectionLabel = ({
  language,
  offerLabel,
  productTitle,
}: {
  language: string;
  offerLabel: string;
  productTitle: string;
}) => {
  const normalizedProductTitle = productTitle.trim();
  const normalizedOfferLabel = offerLabel.trim();
  const normalizedLanguage = normalizeLanguageLabel(language);

  return [normalizedProductTitle, normalizedLanguage, normalizedOfferLabel]
    .filter(Boolean)
    .join(" • ");
};

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

    return {
      accessUrl: row.accessUrl,
      adminLabel,
      createdAtIso: row.createdAt,
      linkState: row.tokenUsedAt.trim() ? "used" : "active",
      selectionLabel: buildSelectionLabel({
        language: row.lessonLanguage,
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
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
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

    return jsonNoStore(
      {
        errorCode: "rate_limited",
      },
      {
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
        status: 429,
      },
    );
  }

  try {
    const items = await resolveHistoryItems({
      forceRefresh,
    });

    return jsonNoStore({
      items,
    });
  } catch (error) {
    if (isAdminInviteLinkHistoryRateLimitError(error)) {
      if (historyCacheEntry && hasUsableStaleHistoryCache(historyCacheEntry)) {
        return jsonNoStore({
          items: historyCacheEntry.items,
          stale: true,
        });
      }

      return jsonNoStore(
        {
          errorCode: "rate_limited",
        },
        {
          headers: {
            "Retry-After": "20",
          },
          status: 429,
        },
      );
    }

    if (historyCacheEntry && hasUsableStaleHistoryCache(historyCacheEntry)) {
      return jsonNoStore({
        items: historyCacheEntry.items,
        stale: true,
      });
    }

    const providerErrorDetails = getAdminInviteLinkHistoryProviderErrorDetails(error);

    if (providerErrorDetails) {
      console.error(
        "Failed to fetch admin invite-link history from legacy provider",
        providerErrorDetails,
      );
    } else {
      console.error("Failed to fetch admin invite-link history", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    return jsonNoStore(
      {
        errorCode: "admin_invite_link_history_failed",
      },
      { status: 500 },
    );
  }
}
