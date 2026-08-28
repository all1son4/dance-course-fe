import { type ReactNode, Suspense } from "react";

import { isProductSaleOpen } from "@/lib/sales-availability";

type SaleGateProps = {
  productId: string;
  children: (isSaleOpen: boolean) => ReactNode;
};

async function SaleGateResolver({
  productId,
  children,
}: Omit<SaleGateProps, "fallback">) {
  const isSaleOpen = await isProductSaleOpen(productId);

  return <>{children(isSaleOpen)}</>;
}

/**
 * Streams the parts of a product page that depend on the admin sales switch.
 *
 * Awaiting the catalogue at the top of a page held back the whole document -
 * including the hero image preload in <head> - for the length of a database
 * round trip. Behind a Suspense boundary the shell goes out immediately and
 * the buy buttons arrive a moment later (with the catalogue cache warm they
 * are resolved in the same flush and nothing is visible at all).
 *
 * The fallback is deliberately empty: styled-components emits a component's
 * CSS where that component is first rendered, and a fallback is removed from
 * the DOM when the real content arrives - taking any <style> emitted inside it
 * along. Styled fallbacks therefore leave the resolved content unstyled.
 */
export default function SaleGate(props: SaleGateProps) {
  return (
    <Suspense fallback={null}>
      <SaleGateResolver {...props} />
    </Suspense>
  );
}
