import { type ReactNode, Suspense } from "react";

import { getProductSaleState, type ProductSaleState } from "@/lib/sales-availability";

type SaleStateGateProps = {
  productId: string;
  children: (saleState: ProductSaleState) => ReactNode;
};

async function SaleStateGateResolver({ productId, children }: SaleStateGateProps) {
  return <>{children(await getProductSaleState(productId))}</>;
}

/**
 * Streams the parts of a product page that depend on the admin sales switch.
 *
 * Awaiting the catalogue at the top of a page holds back the whole document -
 * including the hero image preload in <head> - for the length of a database
 * round trip. Behind a Suspense boundary the shell goes out immediately and
 * the sale-dependent fragments arrive a moment later (with the catalogue cache
 * warm they resolve in the same flush and nothing is visible at all). Several
 * gates on one page share a single catalogue read: the sales state loader is
 * memoized per request.
 *
 * Children receive the tri-state answer, so "the admin closed sales" and "the
 * catalogue could not be read" render as different notices.
 *
 * The fallback is deliberately empty: styled-components emits a component's
 * CSS where that component is first rendered, and a fallback is removed from
 * the DOM when the real content arrives - taking any <style> emitted inside it
 * along. Styled fallbacks therefore leave the resolved content unstyled.
 */
export default function SaleStateGate(props: SaleStateGateProps) {
  return (
    <Suspense fallback={null}>
      <SaleStateGateResolver {...props} />
    </Suspense>
  );
}
