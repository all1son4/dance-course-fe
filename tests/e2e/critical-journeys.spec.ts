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
