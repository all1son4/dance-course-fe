import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PurchasesWorkspace } from "@/app/admin/components/purchases-workspace";
import type {
  AdminPurchasesPreviousSummary,
  AdminPurchasesSummary,
} from "@/app/admin/lib/admin.types";
import { getAccountingMonthValue } from "@/lib/accounting-month";

/*
 * Pins the month summary of «Покупки»: what each metric says under its value when the
 * month is compared with the previous one (or cannot be), for a closed month and for
 * the running one, which is compared with the same days of the previous month.
 */

const PAST_MONTH = "2026-01";

const summaryOf = (
  overrides: Partial<AdminPurchasesSummary> = {},
): AdminPurchasesSummary => ({
  eurTotalLabel: "45,00 EUR",
  eurTotalMinor: 4500,
  failedAttempts: 2,
  feeTotalLabel: "30,00 PLN",
  feeTotalMinor: 3000,
  grossTotalLabel: "1 000,00 PLN",
  grossTotalMinor: 100000,
  monthValue: PAST_MONTH,
  netTotalLabel: "970,00 PLN",
  netTotalMinor: 97000,
  plnTotalLabel: "800,00 PLN",
  plnTotalMinor: 80000,
  salesCount: 6,
  settledCount: 6,
  stripeFinancialDataComplete: true,
  unconfirmedSalesCount: 0,
  ...overrides,
});

const previousOf = (
  overrides: Partial<AdminPurchasesPreviousSummary> = {},
): AdminPurchasesPreviousSummary => ({
  eurTotalMinor: 0,
  grossTotalMinor: 80000,
  monthValue: "2025-12",
  netTotalMinor: 77500,
  plnTotalMinor: 80000,
  salesCount: 4,
  stripeFinancialDataComplete: true,
  ...overrides,
});

const noop = () => undefined;

/** The metric cards as [label, value, caption] lines, in order. */
const metricLines = ({
  monthValue = PAST_MONTH,
  previousSummary,
  summary,
}: {
  monthValue?: string;
  previousSummary: AdminPurchasesPreviousSummary | null;
  summary: AdminPurchasesSummary;
}) => {
  const lines = renderToStaticMarkup(
    createElement(PurchasesWorkspace, {
      appliedSearch: "",
      isDownloadingReport: false,
      isLoading: false,
      isSendingReport: false,
      monthValue,
      months: [],
      onClearSearch: noop,
      onDownloadReport: noop,
      onMonthChange: noop,
      onRefresh: noop,
      onResendEmail: noop,
      onSearchInputChange: noop,
      onSendReport: noop,
      onSubmitSearch: noop,
      onTerminalRecordedChange: noop,
      previousSummary,
      products: [],
      purchases: [],
      reportStatus: null,
      resendingPaymentIntentId: "",
      searchInput: "",
      status: null,
      summary,
      updatingTerminalPaymentIntentId: "",
    }),
  )
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const start = lines.indexOf("Оплачено покупателями");
  const end = lines.indexOf("отказ банка или оплату бросили");
  return lines.slice(start, end + 1);
};

test("a closed month is compared with the previous month", () => {
  assert.deepEqual(metricLines({ previousSummary: previousOf(), summary: summaryOf() }), [
    "Оплачено покупателями",
    "1 000,00 PLN",
    "+200 PLN к прошлому месяцу",
    "Комиссия Stripe",
    "30,00 PLN",
    "удержано Stripe",
    "После комиссии",
    "970,00 PLN",
    "+195 PLN к прошлому месяцу",
    "Исходная стоимость",
    "800,00 PLN · 45,00 EUR",
    "в валюте покупателя",
    "Продаж в отчёте",
    "6",
    "+2 к прошлому месяцу",
    "Не прошло оплат",
    "2",
    "отказ банка или оплату бросили",
  ]);
});

test("the running month is compared with the same days, and equal values say so", () => {
  const monthValue = getAccountingMonthValue(new Date());
  const lines = metricLines({
    monthValue,
    previousSummary: previousOf({ grossTotalMinor: 100000, salesCount: 9 }),
    summary: summaryOf({ monthValue, netTotalMinor: 70000 }),
  });

  assert.deepEqual(
    [lines[2], lines[8], lines[14]],
    [
      "как за те же дни прошлого месяца",
      "−75 PLN к тем же дням прошлого месяца",
      "−3 к тем же дням прошлого месяца",
    ],
  );
});

test("equal values in a closed month say «как в прошлом месяце»", () => {
  const lines = metricLines({
    previousSummary: previousOf({
      grossTotalMinor: 100000,
      netTotalMinor: 97000,
      salesCount: 6,
    }),
    summary: summaryOf(),
  });

  assert.deepEqual(
    [lines[2], lines[8], lines[14]],
    ["как в прошлом месяце", "как в прошлом месяце", "как в прошлом месяце"],
  );
});

test("an empty previous month is not compared", () => {
  const lines = metricLines({
    previousSummary: previousOf({
      eurTotalMinor: 0,
      grossTotalMinor: 0,
      netTotalMinor: 0,
      plnTotalMinor: 0,
      salesCount: 0,
    }),
    summary: summaryOf(),
  });

  assert.deepEqual(
    [lines[2], lines[8], lines[14]],
    ["до комиссии Stripe", "на счёт", "подтверждены Stripe"],
  );
  assert.deepEqual(
    metricLines({ previousSummary: null, summary: summaryOf() }).filter((_, index) =>
      [2, 8, 14].includes(index),
    ),
    ["до комиссии Stripe", "на счёт", "подтверждены Stripe"],
  );
});

test("money is not compared while a month lacks Stripe fees, the count still is", () => {
  const incompletePrevious = metricLines({
    previousSummary: previousOf({ stripeFinancialDataComplete: false }),
    summary: summaryOf(),
  });
  assert.deepEqual(
    [incompletePrevious[2], incompletePrevious[8], incompletePrevious[14]],
    ["до комиссии Stripe", "на счёт", "+2 к прошлому месяцу"],
  );

  const incompleteCurrent = metricLines({
    previousSummary: previousOf(),
    summary: summaryOf({
      grossTotalMinor: null,
      netTotalMinor: null,
      settledCount: 4,
      stripeFinancialDataComplete: false,
    }),
  });
  assert.deepEqual(incompleteCurrent.slice(0, 9), [
    "Оплачено покупателями",
    "—",
    "до комиссии Stripe",
    "Комиссия Stripe",
    "—",
    "удержано Stripe",
    "После комиссии",
    "—",
    "на счёт",
  ]);
});

test("unconfirmed sales take the place of the count comparison", () => {
  const lines = metricLines({
    previousSummary: previousOf(),
    summary: summaryOf({ unconfirmedSalesCount: 1 }),
  });

  assert.equal(lines[14], "ещё 1 без подтверждения Stripe");
});

test("a month without sales shows 0 PLN as its original amount", () => {
  const lines = metricLines({
    previousSummary: null,
    summary: summaryOf({ eurTotalMinor: 0, plnTotalMinor: 0, salesCount: 0 }),
  });

  assert.equal(lines[10], "0 PLN");
});
