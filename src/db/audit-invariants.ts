import { getDatabaseClient } from "./client";
import { getDatabaseEnvSelection } from "./env";
import { loadDatabaseEnvConfig } from "./load-env";

loadDatabaseEnvConfig();

type InvariantAuditRow = {
  invariant: string;
  violationCount: number;
};

const auditDatabaseInvariants = async (): Promise<InvariantAuditRow[]> => {
  const client = getDatabaseClient();

  const rows = await client<{ invariant: string; violation_count: number }[]>`
    SELECT invariant, violation_count
    FROM (
      SELECT
        'products.type' AS invariant,
        count(*)::int AS violation_count
      FROM products
      WHERE type NOT IN ('course', 'choreo')

      UNION ALL

      SELECT 'product_offers.code', count(*)::int
      FROM product_offers
      WHERE code NOT IN (
        'standard',
        'library-access',
        'without-mentor',
        'with-mentor',
        'renewal-discount',
        'renewal-library-access'
      )

      UNION ALL

      SELECT 'product_offers.ranges', count(*)::int
      FROM product_offers
      WHERE sort_order < 0
        OR telegram_access_duration_days < 0

      UNION ALL

      SELECT 'renewal_campaigns.status', count(*)::int
      FROM renewal_campaigns
      WHERE status NOT IN ('active', 'archived')

      UNION ALL

      SELECT 'renewal_campaigns.offer_product', count(*)::int
      FROM renewal_campaigns campaign
      INNER JOIN product_offers offer ON offer.id = campaign.offer_id
      WHERE campaign.product_id IS NOT NULL
        AND offer.product_id <> campaign.product_id

      UNION ALL

      SELECT 'online_group_campaigns.status', count(*)::int
      FROM online_group_campaigns
      WHERE status NOT IN ('active', 'archived')

      UNION ALL

      SELECT 'telegram_renewal_verifications.status', count(*)::int
      FROM telegram_renewal_verifications
      WHERE status NOT IN ('verified', 'not_member', 'failed')

      UNION ALL

      SELECT 'offer_prices.currency', count(*)::int
      FROM offer_prices
      WHERE currency NOT IN ('pln', 'eur')

      UNION ALL

      SELECT 'offer_prices.amount_minor', count(*)::int
      FROM offer_prices
      WHERE amount_minor <= 0

      UNION ALL

      SELECT 'purchases.amount_minor', count(*)::int
      FROM purchases
      WHERE amount_minor < 0

      UNION ALL

      SELECT 'purchases.currency', count(*)::int
      FROM purchases
      WHERE currency NOT IN ('pln', 'eur')
        OR (checkout_currency IS NOT NULL AND checkout_currency NOT IN ('pln', 'eur'))
        OR (settlement_currency IS NOT NULL AND length(btrim(settlement_currency)) <> 3)

      UNION ALL

      SELECT 'purchases.money_ranges', count(*)::int
      FROM purchases
      WHERE settlement_amount_minor < 0
        OR stripe_fee_amount_minor < 0

      UNION ALL

      SELECT 'purchases.locale_language', count(*)::int
      FROM purchases
      WHERE (checkout_locale IS NOT NULL AND checkout_locale NOT IN ('ru', 'en', 'pl'))
        OR (lesson_language IS NOT NULL AND lesson_language NOT IN ('ru', 'en'))

      UNION ALL

      SELECT 'purchases.outcome', count(*)::int
      FROM purchases
      WHERE outcome NOT IN (
        'succeeded',
        'processing',
        'requires_action',
        'failed',
        'canceled'
      )

      UNION ALL

      SELECT 'purchases.source', count(*)::int
      FROM purchases
      WHERE source NOT IN ('stripe', 'admin_offer_link')

      UNION ALL

      SELECT 'purchases.offer_product', count(*)::int
      FROM purchases purchase
      INNER JOIN product_offers offer ON offer.id = purchase.offer_id
      WHERE purchase.product_id IS NOT NULL
        AND offer.product_id <> purchase.product_id

      UNION ALL

      SELECT 'purchase_side_effects.attempt_count', count(*)::int
      FROM purchase_side_effects
      WHERE attempt_count < 0

      UNION ALL

      SELECT 'purchase_side_effects.lifecycle', count(*)::int
      FROM purchase_side_effects
      WHERE btrim(deduplication_key) = ''
        OR jsonb_typeof(payload) <> 'object'
        OR status NOT IN (
          'pending',
          'sending',
          'sent',
          'skipped',
          'failed',
          'dead_letter'
        )
        OR (status = 'dead_letter' AND dead_lettered_at IS NULL)

      UNION ALL

      SELECT 'stripe_events.evidence', count(*)::int
      FROM stripe_events
      WHERE btrim(stripe_event_id) = ''
        OR btrim(event_type) = ''
        OR jsonb_typeof(payload) <> 'object'

      UNION ALL

      SELECT 'stripe_events.lifecycle', count(*)::int
      FROM stripe_events
      WHERE processing_status NOT IN (
          'pending',
          'processing',
          'processed',
          'skipped',
          'failed',
          'dead_letter'
        )
        OR (
          processing_status IN ('processed', 'skipped')
          AND processed_at IS NULL
        )

      UNION ALL

      SELECT 'invoices.ranges', count(*)::int
      FROM invoices
      WHERE sequence_year < 2000
        OR sequence_year > 9999
        OR sequence_month NOT BETWEEN 1 AND 12
        OR sequence_number <= 0
        OR amount_minor < 0
        OR currency NOT IN ('pln', 'eur')

      UNION ALL

      SELECT 'invoice_sequences.ranges', count(*)::int
      FROM invoice_sequences
      WHERE sequence_year < 2000
        OR sequence_year > 9999
        OR sequence_month NOT BETWEEN 1 AND 12
        OR last_sequence <= 0

      UNION ALL

      SELECT 'invoice_sequences.behind_invoices', count(*)::int
      FROM (
        SELECT
          sequence.sequence_year,
          sequence.sequence_month
        FROM invoice_sequences sequence
        INNER JOIN invoices invoice
          ON invoice.sequence_year = sequence.sequence_year
          AND invoice.sequence_month = sequence.sequence_month
        GROUP BY
          sequence.sequence_year,
          sequence.sequence_month,
          sequence.last_sequence
        HAVING sequence.last_sequence < max(invoice.sequence_number)
      ) stale_invoice_sequence

      UNION ALL

      SELECT 'access_entitlements.status', count(*)::int
      FROM access_entitlements
      WHERE status NOT IN (
        'pending',
        'not_required',
        'token_issued',
        'activated',
        'expired',
        'revoked',
        'left_channel',
        'link_failed',
        'manual_pending',
        'manual_done'
      )

      UNION ALL

      SELECT 'access_entitlements.external_target_type', count(*)::int
      FROM access_entitlements
      WHERE external_target_type IS NOT NULL
        AND external_target_type NOT IN ('telegram_chat', 'telegram_bot', 'manual')

      UNION ALL

      SELECT 'access_entitlements.offer_product', count(*)::int
      FROM access_entitlements entitlement
      INNER JOIN product_offers offer ON offer.id = entitlement.offer_id
      WHERE entitlement.product_id IS NOT NULL
        AND offer.product_id <> entitlement.product_id

      UNION ALL

      SELECT 'telegram_access_tokens.kind_status', count(*)::int
      FROM telegram_access_tokens
      WHERE link_kind NOT IN ('channel_invite', 'start_token')
        OR status NOT IN ('issued', 'used', 'expired', 'revoked')

      UNION ALL

      SELECT 'telegram_access_tokens.entitlement_purchase', count(*)::int
      FROM telegram_access_tokens token
      INNER JOIN access_entitlements entitlement ON entitlement.id = token.entitlement_id
      WHERE entitlement.purchase_id <> token.purchase_id

      UNION ALL

      SELECT 'telegram_user_bindings.status', count(*)::int
      FROM telegram_user_bindings
      WHERE status NOT IN ('active', 'left', 'revoked')

      UNION ALL

      SELECT 'telegram_user_bindings.entitlement_purchase', count(*)::int
      FROM telegram_user_bindings binding
      INNER JOIN access_entitlements entitlement
        ON entitlement.id = binding.entitlement_id
      WHERE entitlement.purchase_id <> binding.purchase_id

      UNION ALL

      SELECT 'monthly_report_runs.status_range', count(*)::int
      FROM monthly_report_runs
      WHERE delivery_status NOT IN ('sent', 'skipped', 'failed')
        OR row_count < 0
        OR period_end_utc <= period_start_utc

      UNION ALL

      SELECT 'email_campaign_leads.status_attempts', count(*)::int
      FROM email_campaign_leads
      WHERE email_send_status NOT IN ('blocked', 'excluded', 'failed', 'pending', 'sent')
        OR email_send_attempts < 0
    ) audit
    ORDER BY invariant
  `;

  return rows.map((row) => ({
    invariant: row.invariant,
    violationCount: row.violation_count,
  }));
};

const main = async () => {
  const results = await auditDatabaseInvariants();
  const violations = results.filter((result) => result.violationCount > 0);

  console.warn(
    JSON.stringify(
      {
        database: getDatabaseEnvSelection(),
        passed: violations.length === 0,
        results,
      },
      null,
      2,
    ),
  );

  if (violations.length > 0) {
    process.exitCode = 1;
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabaseClient().end();
  });
