import assert from "node:assert/strict";
import test from "node:test";

import type { CreateAdminOfferGrantCommand } from "@/db/admin-offer-grants";

import {
  createAdminOfferGrant,
  shouldExportAdminOfferGrantToSheets,
} from "./admin-offer-grants";

test("keeps the transitional export unless Sheets are explicitly retired", () => {
  assert.equal(shouldExportAdminOfferGrantToSheets({}), true);
  assert.equal(
    shouldExportAdminOfferGrantToSheets({ DB_SHEETS_EXPORT_MODE: "shadow" }),
    true,
  );
  assert.equal(
    shouldExportAdminOfferGrantToSheets({ DB_SHEETS_EXPORT_MODE: "database" }),
    false,
  );
});

test("always delegates admin grants to PostgreSQL and keeps export independent", async () => {
  let capturedExport = true;
  const marker = { payment_intent_id: "adm_offer_pi_test" };
  const createInDatabase = (async (command: CreateAdminOfferGrantCommand) => {
    capturedExport = command.enqueueSuccessfulCustomerExport;
    return marker;
  }) as Parameters<typeof createAdminOfferGrant>[1] extends {
    createInDatabase?: infer T;
  }
    ? T
    : never;
  const result = await createAdminOfferGrant(
    {
      accessWorkflow: "admin-offer-link",
      adminLabel: "Admin",
      checkoutSessionId: "adm_offer_cs_test",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      eventId: "adm_offer_evt_test",
      lessonLanguage: "ru",
      offerExternalId: "offer_test",
      offerLabel: "Offer",
      paymentIntentId: "adm_offer_pi_test",
      productExternalId: "product_test",
      productTitle: "Product",
      purchaseItem: "Product — Offer",
    },
    {
      createInDatabase,
      environment: {
        DB_SHEETS_EXPORT_MODE: "database",
      },
    },
  );

  assert.equal(result, marker);
  assert.equal(capturedExport, false);
});
