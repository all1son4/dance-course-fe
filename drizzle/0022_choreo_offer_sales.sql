-- migration-phase: expand
ALTER TABLE "product_offers" ADD COLUMN "sales_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- The mentor offer stays active for historical purchases and fulfilment.
UPDATE "product_offers"
SET "sales_enabled" = false, "updated_at" = now()
WHERE "external_offer_id" = 'off_6ZrN1kL5wT8d';
--> statement-breakpoint
-- Preserve all historical products, prices, and lifetime entitlements.
UPDATE "products"
SET "sales_enabled" = false, "updated_at" = now()
WHERE "external_product_id" IN (
  'prd_choreo_birthday_drop', 'prd_2QfH8nW5cK3y', 'prd_choreo_bundle_duo'
);
--> statement-breakpoint
UPDATE "offer_prices"
SET "amount_minor" = CASE "currency" WHEN 'pln' THEN 6500 ELSE 1500 END,
    "updated_at" = now()
WHERE "offer_id" IN (
  SELECT "id" FROM "product_offers" WHERE "external_offer_id" = 'off_3HbC8xP2mV6q'
) AND "currency" IN ('pln', 'eur');
--> statement-breakpoint
-- This is a new timed-access product, separate from the lifetime Birthday Drop.
-- Keep sales closed until its own RU/EN Telegram channels are configured.
INSERT INTO "products" (
  "external_product_id", "code", "slug", "type", "title", "title_key",
  "description", "description_keys", "access_note", "access_note_key",
  "default_offer_external_id", "is_active", "sales_enabled"
) VALUES (
  'prd_choreo_love_me_in_the_morning',
  'choreo-love-me-in-the-morning',
  'love-me-in-the-morning',
  'choreo',
  'Видео-разбор хореографии "Love me in the morning"',
  'choreoLoveMeInTheMorning.title',
  '["Онлайн-разбор хореографии Love me in the morning с подробными объяснениями движений и переходов.", "Только разбор хореографии: изучай материал, пересматривай и повторяй в удобном темпе.", "Самостоятельное прохождение без куратора и обратной связи."]'::jsonb,
  '["choreoLoveMeInTheMorning.description.1", "choreoLoveMeInTheMorning.description.2", "choreoLoveMeInTheMorning.description.3"]'::jsonb,
  'Доступ к материалам — 60 дней с момента вступления в приватный Telegram-канал.',
  'choreoLoveMeInTheMorning.accessNote',
  'off_choreo_love_me_in_the_morning_without_mentor',
  true, false
) ON CONFLICT ("external_product_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "product_offers" (
  "external_offer_id", "product_id", "code", "label", "label_key",
  "telegram_access_duration_days", "is_active", "sales_enabled", "sort_order"
)
SELECT
  'off_choreo_love_me_in_the_morning_without_mentor', "id", 'without-mentor',
  'Без куратора', 'choreoLoveMeInTheMorning.offers.withoutMentor', 60, true, true, 0
FROM "products"
WHERE "external_product_id" = 'prd_choreo_love_me_in_the_morning'
ON CONFLICT ("external_offer_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "offer_prices" ("offer_id", "currency", "amount_minor", "is_active")
SELECT offer."id", price."currency", price."amount_minor", true
FROM "product_offers" offer
CROSS JOIN (VALUES ('pln', 6500), ('eur', 1500)) AS price("currency", "amount_minor")
WHERE offer."external_offer_id" = 'off_choreo_love_me_in_the_morning_without_mentor'
ON CONFLICT ("offer_id", "currency") DO NOTHING;
