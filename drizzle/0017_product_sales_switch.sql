-- migration-phase: expand
ALTER TABLE "products"
  ADD COLUMN "sales_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- Seed the switch with what the storefront actually offers today: the Online
-- Group and the regular choreography breakdowns have no live purchase path, so
-- deploying this migration must not reopen them. First Touch (sold through the
-- email campaign) and the Birthday Drop stay open.
UPDATE "products"
  SET "sales_enabled" = false
  WHERE "external_product_id" IN (
    'prd_L9aK3mT7qP2x',
    'prd_2QfH8nW5cK3y',
    'prd_9MwT3aF7rD6n',
    'prd_choreo_bundle_duo'
  );
