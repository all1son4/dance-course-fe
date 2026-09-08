import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  INITIAL_AGREEMENTS,
  PAYMENT_CHECKBOXES,
} from "@/app/[locale]/payment/payment.constants";
import {
  buildCheckoutHref,
  getDefaultCheckoutCurrencyByLocale,
  SELLABLE_PRODUCTS_LIST,
} from "@/constants/sellable-products";

test("[BEH-TG-02] keeps the accepted product, offer, price, and access-duration matrix", () => {
  const actualMatrix = SELLABLE_PRODUCTS_LIST.flatMap((product) =>
    product.offers.map((offer) => ({
      durationDays: offer.telegramAccessDurationDays,
      eur: offer.prices.eur,
      offer: offer.code,
      pln: offer.prices.pln,
      product: product.code,
    })),
  );

  assert.deepEqual(actualMatrix, [
    {
      durationDays: 120,
      eur: 50,
      offer: "standard",
      pln: 250,
      product: "first-touch",
    },
    {
      durationDays: 60,
      eur: 15,
      offer: "without-mentor",
      pln: 60,
      product: "choreo-still-alive",
    },
    {
      durationDays: 60,
      eur: 25,
      offer: "with-mentor",
      pln: 100,
      product: "choreo-still-alive",
    },
    {
      durationDays: 60,
      eur: 15,
      offer: "without-mentor",
      pln: 60,
      product: "choreo-her-lies",
    },
    {
      durationDays: 60,
      eur: 25,
      offer: "with-mentor",
      pln: 100,
      product: "choreo-her-lies",
    },
    {
      durationDays: 60,
      eur: 20,
      offer: "without-mentor",
      pln: 85,
      product: "choreo-bundle",
    },
    {
      durationDays: 60,
      eur: 40,
      offer: "with-mentor",
      pln: 170,
      product: "choreo-bundle",
    },
    {
      durationDays: 0,
      eur: 15,
      offer: "standard",
      pln: 65,
      product: "choreo-birthday-drop",
    },
    {
      durationDays: 0,
      eur: 50,
      offer: "standard",
      pln: 220,
      product: "online-group-anna-strok",
    },
    {
      durationDays: 0,
      eur: 65,
      offer: "library-access",
      pln: 280,
      product: "online-group-anna-strok",
    },
    {
      durationDays: 0,
      eur: 40,
      offer: "renewal-discount",
      pln: 175,
      product: "online-group-anna-strok",
    },
    {
      durationDays: 0,
      eur: 50,
      offer: "renewal-library-access",
      pln: 220,
      product: "online-group-anna-strok",
    },
  ]);
});

test("keeps all four agreements explicit and unchecked for every new checkout", () => {
  assert.deepEqual(
    PAYMENT_CHECKBOXES.map(({ name }) => name),
    [
      "immediateAccessConsent",
      "withdrawalNoticeAcknowledgement",
      "privacyPolicyAcknowledgement",
      "digitalContentAgreement",
    ],
  );
  assert.deepEqual(Object.values(INITIAL_AGREEMENTS), [false, false, false, false]);
});

test("keeps locale currency defaults and internal checkout context", () => {
  assert.equal(getDefaultCheckoutCurrencyByLocale("en"), "eur");
  assert.equal(getDefaultCheckoutCurrencyByLocale("en-GB"), "eur");
  assert.equal(getDefaultCheckoutCurrencyByLocale("pl"), "pln");
  assert.equal(getDefaultCheckoutCurrencyByLocale("ru"), "pln");
  assert.equal(
    buildCheckoutHref({
      offerId: "off_fixture",
      productId: "prd_fixture",
    }),
    "/payment?product=prd_fixture&offer=off_fixture",
  );
});

const CONTRACT_PATH = join(process.cwd(), "docs/refactoring/behavior-contract.md");

const testFilesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testFilesUnder(path);
    return /\.(?:test|spec)\.tsx?$/u.test(path) ? [path] : [];
  });

// Each case of the behavior contract must be claimed by a test title, so deleting
// or renaming that test is a failure here instead of a silent loss of coverage.
test("every behavior-contract case names the test that protects it", () => {
  const contractIds = new Set(
    readFileSync(CONTRACT_PATH, "utf8").match(/BEH-[A-Z]+-\d+/gu) ?? [],
  );

  assert.ok(contractIds.size > 0, "The behavior contract lists no case identifiers.");

  const claimed = new Map<string, string[]>();

  for (const file of [
    ...testFilesUnder(join(process.cwd(), "src")),
    ...testFilesUnder(join(process.cwd(), "tests")),
  ]) {
    const source = readFileSync(file, "utf8");

    for (const [, id] of source.matchAll(/^\s*test\(\s*"\[([^\]]+)\]/gmu)) {
      claimed.set(id, [...(claimed.get(id) ?? []), file]);
    }
  }

  assert.deepEqual(
    [...contractIds].filter((id) => !claimed.has(id)).sort(),
    [],
    "These behavior-contract cases have no test claiming them.",
  );
  assert.deepEqual(
    [...claimed.keys()].filter((id) => !contractIds.has(id)).sort(),
    [],
    "These test titles claim a case the behavior contract does not define.",
  );
});
