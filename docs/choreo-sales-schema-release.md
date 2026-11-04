# Choreography sales schema release

This migration must reach each environment before deploying the choreography sales
application PR. It is independent of the unfinished Inspiration Hub work.

`0022_choreo_offer_sales` adds `product_offers.sales_enabled`, changes Her Lies
without mentor to 65 PLN / 15 EUR, disables its mentor offer, closes the retired
choreography products, and inserts the separate 60-day Love me in the morning
product and prices. Love me in the morning starts closed. The existing Her Lies
product switch is preserved. Existing purchases, invoices, and access remain intact.

Development and production were checked read-only on 4 November 2026. Both contain
the complete migration history through `0021_drop05_contract`; neither has the new
offer switch. No shared database was changed during PR preparation.

For development:

1. Review and merge this migration-only PR into `dev`.
2. Run **Database migration** on `dev` with target `development`, phase `expand`,
   and confirmation `migrate-development-expand`.
3. Verify that the workflow succeeded before merging the application PR into `dev`.
4. Test the application on dev before preparing the production PRs.

For production, repeat the same schema-first order through reviewed PRs into
`main`. The production workflow uses target `production`, phase `expand`, and
confirmation `migrate-production-expand`. Do not merge or run production work until
the owner has reviewed development.

Local development needs the same migration only when it uses a persistent local
database. A disposable integration database applies committed migrations during
`test:integration:setup`. Shared dev/prod migrations use the existing GitHub Actions
workflow; application builds never apply them.
