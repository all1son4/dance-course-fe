import { expect, type Page, test } from "@playwright/test";

import {
  buildCheckoutHref,
  SELLABLE_PRODUCTS,
} from "../../src/constants/sellable-products";

/**
 * The checkout receives its catalogue with the server render, so these specs
 * cannot stub a client fetch to pin the sales state anymore. Instead they read
 * the deployment's authoritative state from the catalog API (kept alive for
 * exactly this) and assert the UI that state must produce. A deployment whose
 * database is down fails the read - and the run - which is what a smoke test
 * of a broken deployment should do.
 */
const readAuthoritativeCatalog = async (page: Page) => {
  const catalogResponse = await page.request.get("/api/catalog/sellable-products");

  expect(catalogResponse.ok()).toBe(true);

  const catalog = (await catalogResponse.json()) as {
    products: Array<{ id: string; salesEnabled: boolean }>;
  };

  return catalog.products;
};

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

test("Online Group entry follows the authoritative sales switch", async ({ page }) => {
  const product = SELLABLE_PRODUCTS["online-group-anna-strok"];
  const expectedOfferIds = product.offers
    .filter((offer) => offer.code === "standard" || offer.code === "library-access")
    .map((offer) => offer.id)
    .sort();
  const catalogProducts = await readAuthoritativeCatalog(page);
  const catalogProduct = catalogProducts.find((item) => item.id === product.id);

  expect(catalogProduct).toBeDefined();

  await page.goto("/online/group");

  // Buy buttons carry the tariff in their accessible name ("Buy — Standard"),
  // so screen readers can tell the two apart.
  const purchaseLinks = page.getByRole("link", { name: /^Buy(?: — .+)?$/u });

  if (!catalogProduct?.salesEnabled) {
    // The notice streams in behind the shell; once it is visible the sales
    // state has resolved and the absence of buy links is meaningful.
    await expect(
      page.getByText(
        /Sales are temporarily closed|Sales information is temporarily unavailable/,
      ),
    ).toBeVisible();
    await expect(purchaseLinks).toHaveCount(0);
    await expect(page.locator('a[href*="/payment?"]')).toHaveCount(0);
    return;
  }

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

test("Birthday Drop entry carries the sales switch in its first render", async ({
  page,
}) => {
  const product = SELLABLE_PRODUCTS["choreo-birthday-drop"];
  const catalogProducts = await readAuthoritativeCatalog(page);
  const catalogProduct = catalogProducts.find((item) => item.id === product.id);

  expect(catalogProduct).toBeDefined();

  // The buy button sits in the first viewport, so this page resolves the sales
  // switch before rendering instead of streaming it in: the served HTML must
  // already carry the answer ahead of any streamed chunk. A button that lands
  // late reads as missing and pushes its neighbour aside when it arrives.
  const response = await page.request.get("/online/birthday-drop");

  expect(response.ok()).toBe(true);

  // Scripts carry the RSC payload with every translation in it, so only the
  // markup outside them says what was actually rendered.
  const shell = (await response.text())
    .split('<div hidden id="S:')[0]
    .replace(/<script[\s\S]*?<\/script>/g, "");
  const closedNotice =
    /Sales are temporarily closed|Sales information is temporarily unavailable/;

  await page.goto("/online/birthday-drop");

  await expect(
    page.getByRole("heading", { level: 1, name: /The Birthday Drop/ }),
  ).toBeVisible();

  // The sticky duplicate of this button is inert until the reader scrolls
  // past the hero, so the accessible link is the hero button alone.
  const purchaseLinks = page.getByRole("link", { name: /^Buy for / });

  if (!catalogProduct?.salesEnabled) {
    expect(shell).toMatch(closedNotice);
    await expect(page.getByText(closedNotice)).toBeVisible();
    await expect(purchaseLinks).toHaveCount(0);
    await expect(page.locator('a[href*="/payment?"]')).toHaveCount(0);
    return;
  }

  const checkoutHref = buildCheckoutHref({
    offerId: product.defaultOfferId,
    productId: product.id,
  });

  expect(shell).toContain(checkoutHref.replace("&", "&amp;"));
  await expect(purchaseLinks).toHaveCount(1);
  await expect(purchaseLinks).toHaveAttribute("href", checkoutHref);
});

test("a loading buy button never moves the UI around it", async ({ page }) => {
  const product = SELLABLE_PRODUCTS["choreo-birthday-drop"];
  const catalogProducts = await readAuthoritativeCatalog(page);
  const catalogProduct = catalogProducts.find((item) => item.id === product.id);

  test.skip(
    !catalogProduct?.salesEnabled,
    "Birthday Drop sales are closed on this deployment, so there is no buy button to load",
  );

  await page.goto("/online/birthday-drop");

  // Hold the checkout navigation back so the loading ring stays on screen.
  await page.route("**/payment**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue().catch(() => undefined);
  });

  const buyButton = page.getByRole("link", { name: /^Buy for / });
  const label = buyButton.locator("span > span").first();
  const learnMore = page.getByRole("link", { name: "Learn more" });
  const boxOf = async (locator: typeof buyButton) => {
    const box = await locator.boundingBox();

    return box && [box.x, box.y, box.width, box.height].map(Math.round);
  };
  const before = {
    button: await boxOf(buyButton),
    label: await boxOf(label),
    learnMore: await boxOf(learnMore),
  };

  await buyButton.click({ noWaitAfter: true });

  // The ring opens into the button's own padding: the label glides a few
  // pixels left, while the button and everything around it stay put.
  await expect(buyButton).toHaveAttribute("aria-busy", "true");
  await page.waitForTimeout(600);

  const after = { button: await boxOf(buyButton), label: await boxOf(label) };

  expect(after.button).toEqual(before.button);
  expect(await boxOf(learnMore)).toEqual(before.learnMore);
  expect(after.label?.[1]).toEqual(before.label?.[1]);
  expect(after.label?.[3]).toEqual(before.label?.[3]);
  expect(
    Math.abs((after.label?.[0] ?? 0) - (before.label?.[0] ?? 0)),
  ).toBeLessThanOrEqual(14);
});

test("ordinary checkout has four fresh agreements and no Telegram verification", async ({
  page,
}) => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = product.offers[0];
  const catalogProducts = await readAuthoritativeCatalog(page);
  const authoritativeProduct = catalogProducts.find((item) => item.id === product.id);

  expect(authoritativeProduct).toBeDefined();

  await page.goto(`/payment?product=${product.id}&offer=${offer.id}`);

  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();

  if (!authoritativeProduct?.salesEnabled) {
    // Closed sales must render as an explicit state on the checkout too.
    await expect(page.getByText("Sales are closed")).toBeVisible();
    await expect(page.locator('form input[type="checkbox"]')).toHaveCount(0);
    return;
  }

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

  const concealedStripeControls = page.locator('form [aria-hidden="true"][inert]');

  await expect(concealedStripeControls).toHaveCount(1);
});

test("success result stays pending until Stripe confirms success", async ({ page }) => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = product.offers[0];
  let statusRequestCount = 0;

  await page.route("**/api/stripe/payment-intent/status", async (route) => {
    statusRequestCount += 1;
    await route.fulfill({
      body: JSON.stringify({
        outcome: "processing",
        paymentIntentId: "pi_safe10",
        status: "processing",
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  const searchParams = new URLSearchParams({
    checkout: "checkout_safe10",
    currency: "eur",
    offer: offer.id,
    payment_intent: "pi_safe10",
    product: product.id,
  });

  await page.goto(`/payment/success?${searchParams.toString()}`);

  await expect(page.getByText("Payment successful")).toHaveCount(0);
  await expect(
    page.getByText("Your payment is still processing — please do not pay again", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  expect(statusRequestCount).toBe(4);
});

test("checkout sends all four accepted agreements with the existing customer fields", async ({
  page,
}) => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = product.offers[0];
  const catalogProducts = await readAuthoritativeCatalog(page);
  const authoritativeProduct = catalogProducts.find((item) => item.id === product.id);

  test.skip(
    !authoritativeProduct?.salesEnabled,
    "First Touch sales are closed on this deployment, so its checkout form cannot be exercised",
  );

  let resolvePaymentIntentBody!: (body: Record<string, unknown>) => void;
  const paymentIntentBody = new Promise<Record<string, unknown>>((resolve) => {
    resolvePaymentIntentBody = resolve;
  });
  let hasCapturedPaymentIntent = false;

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

test("checkout never renders a dead end", async ({ page }) => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = product.offers[0];

  await page.goto(`/payment?product=${product.id}&offer=${offer.id}`);

  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();

  // Whatever state the deployment is in - catalogue readable or not, sales
  // open or closed - the visitor must see either the form or an explicit
  // notice, never a blank interactive area.
  const checkoutForm = page.locator("form");
  const blockedNotice = page.getByText(
    /Checkout is temporarily unavailable|Sales are closed|This link is out of date/,
  );

  await expect(checkoutForm.or(blockedNotice).first()).toBeVisible();

  if (!(await checkoutForm.count())) {
    await expect(page.locator("#payment-element")).toHaveCount(0);
  }
});

test("a checkout link to an unknown product shows the stale-link notice", async ({
  page,
}) => {
  await page.goto("/payment?product=product-that-never-existed");

  await expect(page.getByText("This link is out of date")).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse courses" })).toBeVisible();
  await expect(page.locator('form input[type="checkbox"]')).toHaveCount(0);
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
