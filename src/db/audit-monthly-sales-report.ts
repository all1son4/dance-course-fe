import postgres from "postgres";

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

const main = async () => {
  const [
    totalPurchaseRows,
    succeededPurchaseRows,
    succeededStripePurchaseRows,
    succeededNonStripePurchaseRows,
    reportEligiblePurchaseRows,
    reportJoinCountRows,
    succeededStripeEventRows,
    sourceCounts,
    reportMonths,
    reportSamples,
  ] = await Promise.all([
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
        to_char(se.stripe_created_at at time zone 'UTC', 'YYYY-MM') as month,
        count(*)::int as sale_count
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
  const totalPurchases = totalPurchaseRows[0]?.count ?? 0;
  const succeededPurchases = succeededPurchaseRows[0]?.count ?? 0;
  const succeededStripePurchases = succeededStripePurchaseRows[0]?.count ?? 0;
  const succeededNonStripePurchases = succeededNonStripePurchaseRows[0]?.count ?? 0;
  const reportEligiblePurchases = reportEligiblePurchaseRows[0]?.count ?? 0;
  const reportJoinRows = reportJoinCountRows[0]?.count ?? 0;
  const succeededStripeEvents = succeededStripeEventRows[0]?.count ?? 0;

  console.warn(
    JSON.stringify(
      {
        report: {
          months: reportMonths,
          rowCount: reportJoinRows,
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
      },
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
