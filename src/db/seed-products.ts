import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";

import { getRequiredDatabaseUrlFromEnv } from "./env";
import { offerPrices, productOffers, products } from "./schema";

loadEnvConfig(process.cwd());

const toMinorUnits = (amountMajor: number) => Math.round(amountMajor * 100);

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
          .values({
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
          })
          .onConflictDoUpdate({
            set: {
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
            },
            target: products.externalProductId,
          })
          .returning({ id: products.id });

        productCount += 1;

        for (const [sortIndex, offer] of product.offers.entries()) {
          const [savedOffer] = await tx
            .insert(productOffers)
            .values({
              accessWorkflow: offer.accessWorkflow ?? null,
              code: offer.code,
              deliveryChannel: offer.deliveryChannel ?? null,
              externalOfferId: offer.id,
              isActive: true,
              label: offer.label,
              labelKey: offer.labelKey,
              productId: savedProduct.id,
              sortOrder: sortIndex,
              telegramAccessDurationDays: offer.telegramAccessDurationDays,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              set: {
                accessWorkflow: offer.accessWorkflow ?? null,
                code: offer.code,
                deliveryChannel: offer.deliveryChannel ?? null,
                isActive: true,
                label: offer.label,
                labelKey: offer.labelKey,
                productId: savedProduct.id,
                sortOrder: sortIndex,
                telegramAccessDurationDays: offer.telegramAccessDurationDays,
                updatedAt: new Date(),
              },
              target: productOffers.externalOfferId,
            })
            .returning({ id: productOffers.id });

          offerCount += 1;

          for (const [currency, amountMajor] of Object.entries(offer.prices)) {
            await tx
              .insert(offerPrices)
              .values({
                amountMinor: toMinorUnits(amountMajor),
                currency: currency as "pln" | "eur",
                isActive: true,
                offerId: savedOffer.id,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                set: {
                  amountMinor: toMinorUnits(amountMajor),
                  isActive: true,
                  updatedAt: new Date(),
                },
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
