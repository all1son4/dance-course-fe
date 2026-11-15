import assert from "node:assert/strict";
import test from "node:test";

import { buildPurchaseSuccessEmail } from "@/app/api/stripe/webhook/_lib/purchase-success-email";

const plusEmail = (myAccessUrl?: string) =>
  buildPurchaseSuccessEmail({
    accessKind: "telegram-online-group",
    amountMinor: "38000",
    checkoutCurrency: "pln",
    checkoutLocale: "ru",
    myAccessUrl,
    offerLabel: "Plus",
    productTitle: "Онлайн-группа",
    receiptLink: null,
    telegramAccessLinks: [
      { accessKey: "main-group", accessUrl: "https://t.me/+group", status: "ready" },
      {
        accessKey: "inspiration-hub",
        accessStartsAt: "2026-11-23T17:00:00.000Z",
        accessUrl: "",
        status: "scheduled",
      },
    ],
  });

test("HUB-D43: a Plus email gives the group invite and says when the Hub opens", () => {
  const email = plusEmail();

  assert.match(email.html, /https:\/\/t\.me\/\+group/u);
  assert.match(
    email.text,
    /Inspiration Hub откроется со стартом потока, 23 ноября 2026/u,
  );
  // The scheduled Hub is a settled answer: no "being prepared, contact support" copy.
  assert.doesNotMatch(email.text, /готовится/u);
});

test("the «Мой доступ» button appears only with a link", () => {
  assert.doesNotMatch(plusEmail().text, /Мой доступ/u);

  const withLink = plusEmail("https://example.test/ru/access?k=abc");
  assert.match(withLink.text, /Мой доступ: https:\/\/example\.test\/ru\/access\?k=abc/u);
  assert.match(withLink.html, /access\?k=abc/u);
});
