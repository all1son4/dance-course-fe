import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

import { getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";
import { offerPrices, productOffers, products } from "./schema";

loadDatabaseEnvConfig();

type SellableProductSeed = (typeof SELLABLE_PRODUCTS_LIST)[number];
type SellableProductOfferSeed = SellableProductSeed["offers"][number];

const toMinorUnits = (amountMajor: number) => Math.round(amountMajor * 100);

// Insert and conflict-update values intentionally use separate builders so each
// branch retains its own timestamp and the database receives the original shape.
const buildProductInsertValues = (product: SellableProductSeed) => ({
  accessNote: product.accessNote,
  accessNoteKey: product.accessNoteKey,
  code: product.code,
  defaultOfferExternalId: product.defaultOfferId,
  description: product.description,
  descriptionKeys: product.descriptionKeys,
  externalProductId: product.id,
  isActive: true,
  slug: product.slug,
  title: product.title,
  titleKey: product.titleKey,
  type: product.type,
  updatedAt: new Date(),
});

const buildProductUpdateValues = (product: SellableProductSeed) => ({
  accessNote: product.accessNote,
  accessNoteKey: product.accessNoteKey,
  code: product.code,
  defaultOfferExternalId: product.defaultOfferId,
  description: product.description,
  descriptionKeys: product.descriptionKeys,
  isActive: true,
  slug: product.slug,
  title: product.title,
  titleKey: product.titleKey,
  type: product.type,
  updatedAt: new Date(),
});

const buildOfferInsertValues = ({
  offer,
  productId,
  sortIndex,
}: {
  offer: SellableProductOfferSeed;
  productId: string;
  sortIndex: number;
}) => ({
  accessWorkflow: offer.accessWorkflow ?? null,
  code: offer.code,
  deliveryChannel: offer.deliveryChannel ?? null,
  externalOfferId: offer.id,
  isActive: true,
  label: offer.label,
  labelKey: offer.labelKey,
  productId,
  sortOrder: sortIndex,
  telegramAccessDurationDays: offer.telegramAccessDurationDays,
  updatedAt: new Date(),
});

const buildOfferUpdateValues = ({
  offer,
  productId,
  sortIndex,
}: {
  offer: SellableProductOfferSeed;
  productId: string;
  sortIndex: number;
}) => ({
  accessWorkflow: offer.accessWorkflow ?? null,
  code: offer.code,
  deliveryChannel: offer.deliveryChannel ?? null,
  isActive: true,
  label: offer.label,
  labelKey: offer.labelKey,
  productId,
  sortOrder: sortIndex,
  telegramAccessDurationDays: offer.telegramAccessDurationDays,
  updatedAt: new Date(),
});

const buildPriceInsertValues = ({
  amountMajor,
  currency,
  offerId,
}: {
  amountMajor: number;
  currency: string;
  offerId: string;
}) => ({
  amountMinor: toMinorUnits(amountMajor),
  currency: currency as "pln" | "eur",
  isActive: true,
  offerId,
  updatedAt: new Date(),
});

const buildPriceUpdateValues = (amountMajor: number) => ({
  amountMinor: toMinorUnits(amountMajor),
  isActive: true,
  updatedAt: new Date(),
});

const main = async () => {
  const client = postgres(
    getRequiredDatabaseUrlFromEnv({
      kind: "unpooled",
      purpose: "product seed",
    }),
    {
      max: 1,
      prepare: false,
    },
  );
  const db = drizzle(client);
  let productCount = 0;
  let offerCount = 0;
  let priceCount = 0;

  try {
    await db.transaction(async (tx) => {
      for (const product of SELLABLE_PRODUCTS_LIST) {
        const [savedProduct] = await tx
          .insert(products)
          .values(buildProductInsertValues(product))
          .onConflictDoUpdate({
            set: buildProductUpdateValues(product),
            target: products.externalProductId,
          })
          .returning({ id: products.id });

        productCount += 1;

        for (const [sortIndex, offer] of product.offers.entries()) {
          const [savedOffer] = await tx
            .insert(productOffers)
            .values(
              buildOfferInsertValues({
                offer,
                productId: savedProduct.id,
                sortIndex,
              }),
            )
            .onConflictDoUpdate({
              set: buildOfferUpdateValues({
                offer,
                productId: savedProduct.id,
                sortIndex,
              }),
              target: productOffers.externalOfferId,
            })
            .returning({ id: productOffers.id });

          offerCount += 1;

          for (const [currency, amountMajor] of Object.entries(offer.prices)) {
            await tx
              .insert(offerPrices)
              .values(
                buildPriceInsertValues({
                  amountMajor,
                  currency,
                  offerId: savedOffer.id,
                }),
              )
              .onConflictDoUpdate({
                set: buildPriceUpdateValues(amountMajor),
                target: [offerPrices.offerId, offerPrices.currency],
              });

            priceCount += 1;
          }
        }
      }
    });

    console.warn("Seeded sellable products", {
      offerCount,
      priceCount,
      productCount,
    });
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error("Failed to seed sellable products", error);
  process.exitCode = 1;
});
