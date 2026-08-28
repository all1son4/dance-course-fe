import { revalidateTag } from "next/cache";

import {
  formatCheckoutPrice,
  SELLABLE_PRODUCTS,
  type SellableProduct,
} from "@/constants/sellable-products";
import { getActiveOnlineGroupCampaign } from "@/db/online-group-campaigns";
import {
  getSellableProductsWithDatabaseCommercialData,
  setProductSalesEnabled,
} from "@/db/sellable-products";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import {
  getBrowserJsonRequestErrorResponse,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";
import { CATALOG_CACHE_TAG } from "@/lib/sales-availability";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;

const ONLINE_GROUP_PRODUCT = SELLABLE_PRODUCTS["online-group-anna-strok"];

type ToggleSalesBody = {
  productId?: string;
  salesEnabled?: unknown;
};

// The Online Group is the one product whose sale needs a second, independent
// switch: without an active cycle the checkout would create a PaymentIntent it
// cannot deliver, so selling is refused until a cycle exists.
const requiresActiveCampaign = (productId: string) =>
  productId === ONLINE_GROUP_PRODUCT.id;

const serializeProduct = ({
  hasActiveCampaign,
  product,
}: {
  hasActiveCampaign: boolean;
  product: SellableProduct;
}) => ({
  code: product.code,
  hasActiveCampaign,
  offers: product.offers.map((offer) => ({
    label: offer.label,
    offerId: offer.id,
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
  const [catalogProducts, activeCampaign] = await Promise.all([
    getSellableProductsWithDatabaseCommercialData(),
    getActiveOnlineGroupCampaign(),
  ]);

  return {
    activeCampaignTitle: activeCampaign?.title ?? "",
    products: catalogProducts.map((product) =>
      serializeProduct({
        hasActiveCampaign: Boolean(activeCampaign),
        product,
      }),
    ),
  };
};

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  try {
    return jsonNoStore(await loadSalesState());
  } catch (error) {
    console.error("Failed to load product sales state", error);
    return jsonNoStore({ errorCode: "sales_state_unavailable" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
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
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonNoStore(
      { errorCode: "rate_limited" },
      {
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  try {
    const body = await parseJsonBody<ToggleSalesBody>(request);

    if (!body || typeof body.salesEnabled !== "boolean") {
      return jsonNoStore({ errorCode: "invalid_request_body" }, { status: 400 });
    }

    const productId = (body.productId ?? "").trim();
    const salesEnabled = body.salesEnabled;
    // The serialized state already answers both questions the guard asks, so it
    // is read once instead of querying the catalogue and the campaign again.
    const product = (await loadSalesState()).products.find(
      (candidate) => candidate.productId === productId,
    );

    if (!product) {
      return jsonNoStore({ errorCode: "product_not_found" }, { status: 404 });
    }

    if (salesEnabled && product.requiresActiveCampaign && !product.hasActiveCampaign) {
      return jsonNoStore(
        { errorCode: "online_group_campaign_required" },
        { status: 409 },
      );
    }

    const updatedRow = await setProductSalesEnabled({ productId, salesEnabled });

    if (!updatedRow) {
      return jsonNoStore({ errorCode: "product_not_found" }, { status: 404 });
    }

    // The storefront reads the switch through a cached copy; expire it now so
    // the next page view already reflects the change (`expire: 0` is the
    // documented form for route handlers that need immediate effect).
    revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });

    console.warn("Product sales switch changed", {
      productId,
      salesEnabled,
    });

    return jsonNoStore(await loadSalesState());
  } catch (error) {
    console.error("Failed to change product sales switch", error);
    return jsonNoStore({ errorCode: "sales_switch_failed" }, { status: 500 });
  }
}
