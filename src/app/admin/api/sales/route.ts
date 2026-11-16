import { revalidateTag } from "next/cache";

import {
  formatCheckoutPrice,
  SELLABLE_PRODUCTS,
  type SellableProduct,
} from "@/constants/sellable-products";
import {
  getSellableProductsWithDatabaseCommercialData,
  setOfferSalesEnabled,
  setProductSalesEnabled,
} from "@/db/sellable-products";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import {
  getOnlineGroupSale,
  ONLINE_GROUP_SALE_REFUSAL_LABELS,
} from "@/lib/online-group-sale";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { logSafeError } from "@/lib/safe-error-log";
import { CATALOG_CACHE_TAG } from "@/lib/sales-availability";
import { getMissingChoreoLessonLanguages } from "@/lib/telegram/choreo-sales";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;

const ONLINE_GROUP_PRODUCT = SELLABLE_PRODUCTS["online-group-anna-strok"];

type ToggleSalesBody = {
  offerId?: unknown;
  productId?: string;
  salesEnabled?: unknown;
};

// The Online Group is the one product whose sale needs a second, independent
// switch: without an active cycle whose cohort is open (HUB-D13) the checkout
// refuses the payment, so selling is refused until the cycle can be sold.
const requiresActiveCampaign = (productId: string) =>
  productId === ONLINE_GROUP_PRODUCT.id;

const serializeProduct = ({
  campaignIssue,
  hasActiveCampaign,
  product,
}: {
  campaignIssue: string;
  hasActiveCampaign: boolean;
  product: SellableProduct;
}) => ({
  campaignIssue: requiresActiveCampaign(product.id) ? campaignIssue : "",
  code: product.code,
  hasActiveCampaign,
  missingLessonLanguages: getMissingChoreoLessonLanguages(product),
  offers: product.offers.map((offer) => ({
    code: offer.code,
    label: offer.label,
    offerId: offer.id,
    salesEnabled: offer.salesEnabled,
    price: `${formatCheckoutPrice(offer.prices.pln, "pln")} / ${formatCheckoutPrice(
      offer.prices.eur,
      "eur",
    )}`,
  })),
  productId: product.id,
  requiresActiveCampaign: requiresActiveCampaign(product.id),
  salesEnabled: product.salesEnabled,
  title: product.title,
  type: product.type,
});

const loadSalesState = async () => {
  const [catalogProducts, onlineGroupSale] = await Promise.all([
    getSellableProductsWithDatabaseCommercialData(),
    getOnlineGroupSale(),
  ]);

  return {
    activeCampaignTitle: onlineGroupSale.campaign?.title ?? "",
    products: catalogProducts.map((product) =>
      serializeProduct({
        campaignIssue: onlineGroupSale.open
          ? ""
          : ONLINE_GROUP_SALE_REFUSAL_LABELS[onlineGroupSale.reason],
        hasActiveCampaign: onlineGroupSale.open,
        product,
      }),
    ),
  };
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  try {
    return jsonNoStore(await loadSalesState());
  } catch (error) {
    logSafeError("Failed to load product sales state", error);
    return jsonErrorNoStore("sales_state_unavailable", { status: 500 });
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

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "admin:product-sales",
    limit: 30,
    onBackendUnavailable: "deny",
    request,
    windowMs: 60_000,
  });

  if (rateLimit.backendUnavailable) {
    return jsonErrorNoStore("rate_limit_unavailable", { status: 503 });
  }

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      status: 429,
    });
  }

  try {
    const { body, errorResponse: bodyErrorResponse } =
      await parseJsonBody<ToggleSalesBody>(request, MAX_BODY_BYTES);

    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (!body || typeof body.salesEnabled !== "boolean") {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }

    const productId = (body.productId ?? "").trim();
    const salesEnabled = body.salesEnabled;
    if (
      body.offerId !== undefined &&
      (typeof body.offerId !== "string" || !body.offerId.trim())
    ) {
      return jsonErrorNoStore("invalid_request_body", { status: 400 });
    }
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
    // The serialized state already answers both questions the guard asks, so it
    // is read once instead of querying the catalogue and the campaign again.
    const product = (await loadSalesState()).products.find(
      (candidate) => candidate.productId === productId,
    );

    if (!product) {
      return jsonErrorNoStore("product_not_found", { status: 404 });
    }

    if (
      !offerId &&
      salesEnabled &&
      product.requiresActiveCampaign &&
      !product.hasActiveCampaign
    ) {
      return jsonErrorNoStore("online_group_campaign_required", { status: 409 });
    }

    if (!offerId && salesEnabled && product.missingLessonLanguages.length > 0) {
      return jsonErrorNoStore("choreo_channels_required", { status: 409 });
    }

    if (
      offerId &&
      (product.type !== "choreo" ||
        !product.offers.some((offer) => offer.offerId === offerId))
    ) {
      return jsonErrorNoStore("offer_not_found", { status: 404 });
    }

    const updatedRow = offerId
      ? await setOfferSalesEnabled({ productId, offerId, salesEnabled })
      : await setProductSalesEnabled({ productId, salesEnabled });

    if (!updatedRow) {
      return jsonErrorNoStore("product_not_found", { status: 404 });
    }

    // The storefront reads the switch through a cached copy; expire it now so
    // the next page view already reflects the change (`expire: 0` is the
    // documented form for route handlers that need immediate effect).
    revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });

    console.warn("Product sales switch changed", {
      productId,
      ...(offerId ? { offerId } : {}),
      salesEnabled,
    });

    return jsonNoStore(await loadSalesState());
  } catch (error) {
    logSafeError("Failed to change product sales switch", error);
    return jsonErrorNoStore("sales_switch_failed", { status: 500 });
  }
}
