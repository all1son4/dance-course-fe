UPDATE "offer_prices"
SET
	"amount_minor" = CASE
		WHEN "currency" = 'pln' THEN 22000
		WHEN "currency" = 'eur' THEN 5000
		ELSE "amount_minor"
	END,
	"updated_at" = now()
WHERE "offer_id" = (
	SELECT "id"
	FROM "product_offers"
	WHERE "external_offer_id" = 'off_R6vN2cH9sW4y'
	LIMIT 1
)
AND "currency" IN ('pln', 'eur');
