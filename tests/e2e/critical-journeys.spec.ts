import { expect, test } from "@playwright/test";

import {
  SELLABLE_PRODUCTS,
  SELLABLE_PRODUCTS_LIST,
} from "../../src/constants/sellable-products";

test("First Touch entry remains a lead dialog instead of direct checkout", async ({
  page,
}) => {
  await page.goto("/online/first-touch");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: 'Course "First Touch"',
    }),
  ).toBeVisible();
  await expect(page.locator('a[href*="/payment?"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(
    page.getByRole("dialog", { name: "Reserve a place in First Touch" }),
  ).toBeVisible();
});

test("Online Group entry keeps both internal Standard and Plus checkout links", async ({
  page,
}) => {
  const product = SELLABLE_PRODUCTS["online-group-anna-strok"];
  const expectedOfferIds = product.offers
    .filter((offer) => offer.code === "standard" || offer.code === "library-access")
    .map((offer) => offer.id)
    .sort();

  await page.goto("/online/group");

  const purchaseLinks = page.getByRole("link", { name: "Buy", exact: true });
  await expect(purchaseLinks).toHaveCount(2);

  const checkoutContexts = await purchaseLinks.evaluateAll((links) =>
    links.map((link) => {
      const url = new URL((link as HTMLAnchorElement).href);

      return {
        offerId: url.searchParams.get("offer"),
        productId: url.searchParams.get("product"),
      };
    }),
  );

  assertCheckoutContexts(checkoutContexts, product.id, expectedOfferIds);
});

test("ordinary checkout has four fresh agreements and no Telegram verification", async ({
  page,
}) => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = product.offers[0];

  await page.route("**/api/catalog/sellable-products", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        products: SELLABLE_PRODUCTS_LIST,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto(`/payment?product=${product.id}&offer=${offer.id}`);

  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Telegram" })).toHaveCount(0);

  const agreements = page.locator('form input[type="checkbox"]');
  await expect(agreements).toHaveCount(4);

  const agreementState = await agreements.evaluateAll((inputs) =>
    inputs.map((input) => {
      const checkbox = input as HTMLInputElement;

      return {
        checked: checkbox.checked,
        disabled: checkbox.disabled,
        name: checkbox.name,
      };
    }),
  );

  expect(agreementState).toEqual([
    {
      checked: false,
      disabled: false,
      name: "immediate_access_consent",
    },
    {
      checked: false,
      disabled: false,
      name: "withdrawal_notice_acknowledgement",
    },
    {
      checked: false,
      disabled: false,
      name: "privacy_policy_acknowledgement",
    },
    {
      checked: false,
      disabled: false,
      name: "digital_content_agreement",
    },
  ]);
});

test("checkout sends all four accepted agreements with the existing customer fields", async ({
  page,
}) => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = product.offers[0];
  let resolvePaymentIntentBody!: (body: Record<string, unknown>) => void;
  const paymentIntentBody = new Promise<Record<string, unknown>>((resolve) => {
    resolvePaymentIntentBody = resolve;
  });
  let hasCapturedPaymentIntent = false;

  await page.route("**/api/catalog/sellable-products", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        products: SELLABLE_PRODUCTS_LIST,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/stripe/payment-intent", async (route) => {
    if (!hasCapturedPaymentIntent) {
      hasCapturedPaymentIntent = true;
      resolvePaymentIntentBody(route.request().postDataJSON() as Record<string, unknown>);
    }

    await route.fulfill({
      body: JSON.stringify({
        errorCode: "consent_evidence_failed",
      }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.goto(`/payment?product=${product.id}&offer=${offer.id}`);
  await page.getByRole("button", { name: "Reject" }).click();

  await page.getByRole("textbox", { name: "Full name" }).fill("Anna Test");
  await page.getByRole("textbox", { name: "Email" }).fill("buyer@example.com");
  await page.getByRole("textbox", { name: "Telegram username" }).fill("@anna_test");
  await page.getByRole("textbox", { name: "Address" }).fill("Main Street 1");
  await page.getByRole("textbox", { name: "City" }).fill("Warsaw");
  await page.getByRole("textbox", { name: "Postal code" }).fill("00-001");
  await page.getByRole("combobox", { name: "Country" }).selectOption("PL");

  const agreementNames = [
    "immediate_access_consent",
    "withdrawal_notice_acknowledgement",
    "privacy_policy_acknowledgement",
    "digital_content_agreement",
  ];

  for (const agreementName of agreementNames) {
    const agreement = page.locator(`input[name="${agreementName}"]`);

    await page.locator(`label[for="${agreementName}"] > div`).click();
    await expect(agreement).toBeChecked();
  }

  const requestBody = await paymentIntentBody;

  expect(requestBody.agreements).toEqual({
    digitalContentAgreement: true,
    immediateAccessConsent: true,
    privacyPolicyAcknowledgement: true,
    withdrawalNoticeAcknowledgement: true,
  });
  await expect(
    page.getByText(
      "We couldn't save the required consent confirmation. Please try again.",
    ),
  ).toBeVisible();
});

test("checkout fails closed with an explicit message when catalog is unavailable", async ({
  page,
}) => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = product.offers[0];

  await page.route("**/api/catalog/sellable-products", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        errorCode: "catalog_unavailable",
      }),
      contentType: "application/json",
      status: 503,
    });
  });
  await page.goto(`/payment?product=${product.id}&offer=${offer.id}`);

  await expect(
    page.getByText("Sales are temporarily unavailable. Please try again later."),
  ).toBeVisible();
  await expect(page.locator("#payment-element")).toHaveCount(0);
});

const assertCheckoutContexts = (
  contexts: Array<{ offerId: string | null; productId: string | null }>,
  productId: string,
  expectedOfferIds: string[],
) => {
  expect(contexts.map((context) => context.productId)).toEqual([productId, productId]);
  expect(
    contexts
      .map((context) => context.offerId)
      .filter((offerId): offerId is string => Boolean(offerId))
      .sort(),
  ).toEqual(expectedOfferIds);
};
