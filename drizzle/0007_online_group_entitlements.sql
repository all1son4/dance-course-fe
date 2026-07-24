DROP TABLE IF EXISTS "online_group_payment_links";--> statement-breakpoint
ALTER TABLE "online_group_campaigns" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "online_group_campaigns" ADD COLUMN "ends_at" timestamp with time zone;--> statement-breakpoint
UPDATE "online_group_campaigns"
SET
  "starts_at" = COALESCE("starts_at", "created_at"),
  "ends_at" = COALESCE("ends_at", "created_at" + interval '6 weeks');--> statement-breakpoint
UPDATE "product_offers"
SET
  "telegram_access_duration_days" = 120,
  "updated_at" = now()
WHERE "external_offer_id" = 'off_4BcM9pR6tH1x';--> statement-breakpoint
ALTER TABLE "online_group_campaigns" ALTER COLUMN "starts_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "online_group_campaigns" ALTER COLUMN "ends_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "inspiration_chat_id_snapshot" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "inspiration_access_expires_at_snapshot" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_entitlements" ADD COLUMN "access_key" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "access_entitlements_purchase_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "access_entitlements_purchase_key_idx" ON "access_entitlements" USING btree ("purchase_id", "access_key");--> statement-breakpoint
INSERT INTO "product_offers" (
  "external_offer_id",
  "product_id",
  "code",
  "label",
  "label_key",
  "delivery_channel",
  "access_workflow",
  "telegram_access_duration_days",
  "is_active",
  "sort_order",
  "updated_at"
)
SELECT
  offer."external_offer_id",
  product."id",
  offer."code",
  offer."label",
  offer."label_key",
  'telegram',
  offer."access_workflow",
  0,
  true,
  offer."sort_order",
  now()
FROM "products" product
CROSS JOIN (
  VALUES
    ('off_R6vN2cH9sW4y', 'standard', 'Standard', 'onlineGroupAnnaStrok.offers.standard', 'telegram-online-group', 0),
    ('off_online_group_anna_strok_library_access', 'library-access', 'Plus', 'onlineGroupAnnaStrok.offers.libraryAccess', 'telegram-online-group', 1),
    ('off_online_group_anna_strok_renewal_discount', 'renewal-discount', 'Standard renewal', 'onlineGroupAnnaStrok.offers.renewalDiscount', 'telegram-renewal', 2),
    ('off_online_group_anna_strok_renewal_library_access', 'renewal-library-access', 'Plus renewal', 'onlineGroupAnnaStrok.offers.renewalLibraryAccess', 'telegram-renewal', 3)
) AS offer(
  "external_offer_id",
  "code",
  "label",
  "label_key",
  "access_workflow",
  "sort_order"
)
WHERE product."external_product_id" = 'prd_L9aK3mT7qP2x'
ON CONFLICT ("external_offer_id") DO UPDATE SET
  "product_id" = EXCLUDED."product_id",
  "code" = EXCLUDED."code",
  "label" = EXCLUDED."label",
  "label_key" = EXCLUDED."label_key",
  "delivery_channel" = EXCLUDED."delivery_channel",
  "access_workflow" = EXCLUDED."access_workflow",
  "telegram_access_duration_days" = EXCLUDED."telegram_access_duration_days",
  "is_active" = EXCLUDED."is_active",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();--> statement-breakpoint
INSERT INTO "offer_prices" (
  "offer_id",
  "currency",
  "amount_minor",
  "is_active",
  "updated_at"
)
SELECT
  offer."id",
  price."currency",
  price."amount_minor",
  true,
  now()
FROM (
  VALUES
    ('off_R6vN2cH9sW4y', 'pln', 22000),
    ('off_R6vN2cH9sW4y', 'eur', 5000),
    ('off_online_group_anna_strok_library_access', 'pln', 28000),
    ('off_online_group_anna_strok_library_access', 'eur', 6500),
    ('off_online_group_anna_strok_renewal_discount', 'pln', 17500),
    ('off_online_group_anna_strok_renewal_discount', 'eur', 4000),
    ('off_online_group_anna_strok_renewal_library_access', 'pln', 22000),
    ('off_online_group_anna_strok_renewal_library_access', 'eur', 5000)
) AS price("external_offer_id", "currency", "amount_minor")
INNER JOIN "product_offers" offer
  ON offer."external_offer_id" = price."external_offer_id"
ON CONFLICT ("offer_id", "currency") DO UPDATE SET
  "amount_minor" = EXCLUDED."amount_minor",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = now();
