import { getLocale } from "next-intl/server";

import {
  getDefaultCheckoutCurrencyByLocale,
  getResolvedCheckoutCurrency,
  type SellableProduct,
} from "@/constants/sellable-products";
import { getSellableProductsWithDatabaseCommercialData } from "@/db/sellable-products";

import PaymentRouteClient from "./payment-page-client";

type PaymentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const firstSearchParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const serializeSearchParams = (
  searchParams: Record<string, string | string[] | undefined>,
) => {
  const result = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => result.append(key, item));
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }

  const serialized = result.toString();

  return serialized ? `?${serialized}` : "";
};

// Checkout must arrive with an authoritative product, price and sales state in
// its first HTML. A client-side catalogue fetch made the form visibly change
// after hydration and briefly exposed stale static catalogue data.
export const dynamic = "force-dynamic";

export default async function PaymentPage({ searchParams }: PaymentPageProps) {
  const [locale, resolvedSearchParams] = await Promise.all([getLocale(), searchParams]);
  let sellableProducts: SellableProduct[] | null = null;

  try {
    const products = await getSellableProductsWithDatabaseCommercialData();

    if (products.length > 0) {
      sellableProducts = products;
    } else {
      console.error("Authoritative sellable product catalog is empty in checkout");
    }
  } catch (error) {
    console.error("Failed to load authoritative checkout catalog", { error });
  }

  const currencyParam = firstSearchParam(resolvedSearchParams.currency);
  const currency = currencyParam
    ? getResolvedCheckoutCurrency(currencyParam)
    : getDefaultCheckoutCurrencyByLocale(locale);

  return (
    <PaymentRouteClient
      initialSearchKey={serializeSearchParams(resolvedSearchParams)}
      paymentInitialization={{
        currency,
        offerId: firstSearchParam(resolvedSearchParams.offer),
        productId: firstSearchParam(resolvedSearchParams.product),
        renewalCampaignSlug: firstSearchParam(resolvedSearchParams.renewal),
        sellableProducts,
      }}
    />
  );
}
