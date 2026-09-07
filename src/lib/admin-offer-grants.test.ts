import assert from "node:assert/strict";
import test from "node:test";

import type { CreateAdminOfferGrantCommand } from "@/db/admin-offer-grants";

import { createAdminOfferGrant } from "./admin-offer-grants";

test("delegates the unchanged grant command to PostgreSQL without an export option", async () => {
  let capturedCommand: CreateAdminOfferGrantCommand | undefined;
  const marker = { payment_intent_id: "adm_offer_pi_test" };
  const createInDatabase = (async (command: CreateAdminOfferGrantCommand) => {
    capturedCommand = command;
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
    },
  );

  assert.equal(result, marker);
  assert.ok(capturedCommand);
  assert.equal(capturedCommand.paymentIntentId, "adm_offer_pi_test");
  assert.equal("enqueueSuccessfulCustomerExport" in capturedCommand, false);
});
