-- migration-phase: expand
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
FROM "product_offers" offer
CROSS JOIN (
  VALUES
    ('pln', 6500),
    ('eur', 1500)
) AS price("currency", "amount_minor")
WHERE offer."external_offer_id" = 'off_choreo_birthday_drop_standard'
ON CONFLICT ("offer_id", "currency") DO UPDATE SET
  "amount_minor" = EXCLUDED."amount_minor",
  "is_active" = EXCLUDED."is_active",
  "updated_at" = now();
