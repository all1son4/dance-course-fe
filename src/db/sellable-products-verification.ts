import type { SellableProduct } from "@/constants/sellable-products";

type CommercialCatalogEntry = {
  accessWorkflow: string | null;
  defaultOfferId: string;
  deliveryChannel: string | null;
  eur: number;
  offerCode: string;
  offerId: string;
  pln: number;
  productCode: string;
  productId: string;
  productType: SellableProduct["type"];
  telegramAccessDurationDays: number;
};

type CommercialCatalogField = keyof CommercialCatalogEntry;
type CommercialCatalogValues = Partial<
  Record<CommercialCatalogField, string | number | null>
>;

export type CommercialCatalogDrift = {
  actual?: CommercialCatalogValues;
  expected?: CommercialCatalogValues;
  fields?: CommercialCatalogField[];
  key: string;
  kind: "mismatch" | "missing" | "unexpected";
};

const COMMERCIAL_CATALOG_FIELDS = [
  "accessWorkflow",
  "defaultOfferId",
  "deliveryChannel",
  "eur",
  "offerCode",
  "offerId",
  "pln",
  "productCode",
  "productId",
  "productType",
  "telegramAccessDurationDays",
] as const satisfies readonly CommercialCatalogField[];

const getEntryKey = ({ offerId, productId }: CommercialCatalogEntry) =>
  `${productId}:${offerId}`;

const getCommercialCatalogSnapshot = (
  products: readonly SellableProduct[],
): CommercialCatalogEntry[] =>
  products
    .flatMap((product) =>
      product.offers.map((offer) => ({
        accessWorkflow: offer.accessWorkflow ?? null,
        defaultOfferId: product.defaultOfferId,
        deliveryChannel: offer.deliveryChannel ?? null,
        eur: offer.prices.eur,
        offerCode: offer.code,
        offerId: offer.id,
        pln: offer.prices.pln,
        productCode: product.code,
        productId: product.id,
        productType: product.type,
        telegramAccessDurationDays: offer.telegramAccessDurationDays,
      })),
    )
    .sort((left, right) => getEntryKey(left).localeCompare(getEntryKey(right)));

/**
 * Compares only deploy-owned commercial configuration. `salesEnabled` is
 * deliberately ignored because it is operator-owned runtime state in the DB.
 */
export const getCommercialCatalogDrift = ({
  actualProducts,
  expectedProducts,
}: {
  actualProducts: readonly SellableProduct[];
  expectedProducts: readonly SellableProduct[];
}): CommercialCatalogDrift[] => {
  const expectedEntries = getCommercialCatalogSnapshot(expectedProducts);
  const actualEntries = getCommercialCatalogSnapshot(actualProducts);
  const expectedByKey = new Map(
    expectedEntries.map((entry) => [getEntryKey(entry), entry] as const),
  );
  const actualByKey = new Map(
    actualEntries.map((entry) => [getEntryKey(entry), entry] as const),
  );
  const drift: CommercialCatalogDrift[] = [];

  for (const [key, expectedEntry] of expectedByKey) {
    const actualEntry = actualByKey.get(key);

    if (!actualEntry) {
      drift.push({ key, kind: "missing" });
      continue;
    }

    const fields = COMMERCIAL_CATALOG_FIELDS.filter(
      (field) => expectedEntry[field] !== actualEntry[field],
    );

    if (fields.length > 0) {
      drift.push({
        actual: Object.fromEntries(
          fields.map((field) => [field, actualEntry[field]] as const),
        ),
        expected: Object.fromEntries(
          fields.map((field) => [field, expectedEntry[field]] as const),
        ),
        fields,
        key,
        kind: "mismatch",
      });
    }
  }

  for (const key of actualByKey.keys()) {
    if (!expectedByKey.has(key)) {
      drift.push({ key, kind: "unexpected" });
    }
  }

  return drift.sort((left, right) => left.key.localeCompare(right.key));
};
