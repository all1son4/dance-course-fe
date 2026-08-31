import postgres from "postgres";

import { ACCOUNTING_TIME_ZONE } from "@/lib/accounting-month";

import { getRequiredDatabaseUrlFromEnv } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";

loadDatabaseEnvConfig();

type CountRow = {
  count: number;
};

type SourceCountRow = {
  count: number;
  source: string;
};

type MonthCountRow = {
  month: string;
  sale_count: number;
};

type DuplicateSaleEventRow = {
  event_count: number;
  payment_intent_id: string;
};

type SampleRow = {
  customer_email_snapshot: string | null;
  outcome: string;
  payment_intent_id: string;
  source: string;
  stripe_created_at: string | null;
  succeeded_at: string | null;
};

const client = postgres(
  getRequiredDatabaseUrlFromEnv({
    kind: "pooled",
    purpose: "monthly sales report audit",
  }),
  {
    max: 1,
    prepare: false,
  },
);

// A single Promise.all keeps every metric on the same best-effort database
// snapshot while the tuple order preserves its mapping to the audit payload.
const loadMonthlySalesReportAuditRows = () =>
  Promise.all([
    client<CountRow[]>`select count(*)::int as count from purchases`,
    client<CountRow[]>`
      select count(*)::int as count
      from purchases
      where outcome = 'succeeded'
    `,
    client<CountRow[]>`
      select count(*)::int as count
      from purchases
      where outcome = 'succeeded'
        and payment_intent_id like 'pi_%'
    `,
    client<CountRow[]>`
      select count(*)::int as count
      from purchases
      where outcome = 'succeeded'
        and payment_intent_id not like 'pi_%'
    `,
    client<CountRow[]>`
      select count(*)::int as count
      from purchases
      where outcome = 'succeeded'
        and source <> 'admin_offer_link'
        and payment_intent_id like 'pi_%'
    `,
    client<CountRow[]>`
      select count(*)::int as count
      from purchases p
      inner join stripe_events se
        on se.payment_intent_id = p.payment_intent_id
        and se.event_type = 'payment_intent.succeeded'
      where p.outcome = 'succeeded'
        and p.source <> 'admin_offer_link'
        and se.processing_status = 'processed'
        and se.outcome_snapshot = 'succeeded'
        and se.stripe_created_at is not null
        and se.stripe_created_at < now()
    `,
    client<CountRow[]>`
      select count(distinct p.payment_intent_id)::int as count
      from purchases p
      inner join stripe_events se
        on se.payment_intent_id = p.payment_intent_id
        and se.event_type = 'payment_intent.succeeded'
      where p.outcome = 'succeeded'
        and p.source <> 'admin_offer_link'
        and se.processing_status = 'processed'
        and se.outcome_snapshot = 'succeeded'
        and se.stripe_created_at is not null
        and se.stripe_created_at < now()
    `,
    client<DuplicateSaleEventRow[]>`
      select
        p.payment_intent_id,
        count(*)::int as event_count
      from purchases p
      inner join stripe_events se
        on se.payment_intent_id = p.payment_intent_id
        and se.event_type = 'payment_intent.succeeded'
      where p.outcome = 'succeeded'
        and p.source <> 'admin_offer_link'
        and se.processing_status = 'processed'
        and se.outcome_snapshot = 'succeeded'
        and se.stripe_created_at is not null
        and se.stripe_created_at < now()
      group by p.payment_intent_id
      having count(*) > 1
      order by event_count desc, p.payment_intent_id asc
      limit 20
    `,
    client<CountRow[]>`
      select count(*)::int as count
      from stripe_events
      where event_type = 'payment_intent.succeeded'
        and processing_status = 'processed'
        and outcome_snapshot = 'succeeded'
        and stripe_created_at is not null
    `,
    client<SourceCountRow[]>`
      select source, count(*)::int as count
      from purchases
      where outcome = 'succeeded'
      group by source
      order by count desc, source asc
    `,
    client<MonthCountRow[]>`
      select
        to_char(se.stripe_created_at at time zone ${ACCOUNTING_TIME_ZONE}, 'YYYY-MM') as month,
        count(distinct p.payment_intent_id)::int as sale_count
      from purchases p
      inner join stripe_events se
        on se.payment_intent_id = p.payment_intent_id
        and se.event_type = 'payment_intent.succeeded'
      where p.outcome = 'succeeded'
        and p.source <> 'admin_offer_link'
        and se.processing_status = 'processed'
        and se.outcome_snapshot = 'succeeded'
        and se.stripe_created_at is not null
        and se.stripe_created_at < now()
      group by month
      order by month desc
    `,
    client<SampleRow[]>`
      select
        p.payment_intent_id,
        p.customer_email_snapshot,
        p.source,
        p.outcome,
        p.succeeded_at::text as succeeded_at,
        se.stripe_created_at::text as stripe_created_at
      from purchases p
      left join stripe_events se
        on se.payment_intent_id = p.payment_intent_id
        and se.event_type = 'payment_intent.succeeded'
        and se.processing_status = 'processed'
        and se.outcome_snapshot = 'succeeded'
      where p.outcome = 'succeeded'
      order by coalesce(se.stripe_created_at, p.succeeded_at, p.updated_at) desc
      limit 20
    `,
  ]);

const getCount = (rows: CountRow[]) => rows[0]?.count ?? 0;

const buildMonthlySalesReportAudit = ({
  duplicateSaleEventRows,
  reportEligiblePurchases,
  reportJoinRows,
  reportMonths,
  reportSamples,
  reportUniqueRows,
  sourceCounts,
  succeededNonStripePurchases,
  succeededPurchases,
  succeededStripeEvents,
  succeededStripePurchases,
  totalPurchases,
}: {
  duplicateSaleEventRows: DuplicateSaleEventRow[];
  reportEligiblePurchases: number;
  reportJoinRows: number;
  reportMonths: MonthCountRow[];
  reportSamples: SampleRow[];
  reportUniqueRows: number;
  sourceCounts: SourceCountRow[];
  succeededNonStripePurchases: number;
  succeededPurchases: number;
  succeededStripeEvents: number;
  succeededStripePurchases: number;
  totalPurchases: number;
}) => ({
  report: {
    duplicateSaleEvents: duplicateSaleEventRows,
    months: reportMonths,
    rawJoinRowCount: reportJoinRows,
    uniqueSaleCount: reportUniqueRows,
  },
  samples: reportSamples,
  stripeEvents: {
    processedSucceededPaymentIntentEvents: succeededStripeEvents,
  },
  summary: {
    reportEligiblePurchases,
    succeededNonStripePurchases,
    succeededPurchases,
    succeededStripePurchases,
    totalPurchases,
  },
  succeededPurchaseSources: sourceCounts,
});

const main = async () => {
  const [
    totalPurchaseRows,
    succeededPurchaseRows,
    succeededStripePurchaseRows,
    succeededNonStripePurchaseRows,
    reportEligiblePurchaseRows,
    reportJoinCountRows,
    reportUniqueCountRows,
    duplicateSaleEventRows,
    succeededStripeEventRows,
    sourceCounts,
    reportMonths,
    reportSamples,
  ] = await loadMonthlySalesReportAuditRows();

  console.warn(
    JSON.stringify(
      buildMonthlySalesReportAudit({
        duplicateSaleEventRows,
        reportEligiblePurchases: getCount(reportEligiblePurchaseRows),
        reportJoinRows: getCount(reportJoinCountRows),
        reportMonths,
        reportSamples,
        reportUniqueRows: getCount(reportUniqueCountRows),
        sourceCounts,
        succeededNonStripePurchases: getCount(succeededNonStripePurchaseRows),
        succeededPurchases: getCount(succeededPurchaseRows),
        succeededStripeEvents: getCount(succeededStripeEventRows),
        succeededStripePurchases: getCount(succeededStripePurchaseRows),
        totalPurchases: getCount(totalPurchaseRows),
      }),
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
