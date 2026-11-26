import { sql } from "drizzle-orm";

import { getDatabase } from "./client";

type SqlExecutor = Pick<ReturnType<typeof getDatabase>, "execute">;

/*
 * Who a buyer is for the owner: the name and the Instagram handle from any of their
 * purchases. A renewal or a Hub removal only knows the Telegram account, so the
 * person is found through it as well as through the customer record.
 */

type BuyerContact = { fullName: string | null; instagram: string | null };

/** Purchases of one person: the same customer record, or bound to the same Telegram account. */
const samePersonPurchases = (customerId: unknown, telegramUserId: unknown) => sql`
  (
    (${customerId}::uuid IS NOT NULL AND p.customer_id = ${customerId}::uuid)
    OR (
      ${telegramUserId}::text IS NOT NULL
      AND (
        p.telegram_user_id = ${telegramUserId}::text
        OR p.id IN (
          SELECT b.purchase_id FROM telegram_user_bindings b
          WHERE b.telegram_user_id = ${telegramUserId}::text
        )
      )
    )
  )`;

const newestInstagram = (customerId: unknown, telegramUserId: unknown) => sql`(
  SELECT COALESCE(p.customer_instagram_username_snapshot, c.instagram_username)
  FROM purchases p
  LEFT JOIN customers c ON c.id = p.customer_id
  WHERE ${samePersonPurchases(customerId, telegramUserId)}
    AND COALESCE(p.customer_instagram_username_snapshot, c.instagram_username) IS NOT NULL
  ORDER BY p.created_at DESC
  LIMIT 1
)`;

/** The newest Instagram handle of the person behind a purchase, or null when none is known. */
export async function findBuyerInstagramByPurchaseId(
  database: SqlExecutor,
  purchaseId: string,
): Promise<string | null> {
  const rows = await database.execute<{ instagram: string | null }>(sql`
    SELECT ${newestInstagram(sql`own.customer_id`, sql`own.telegram_user_id`)} AS instagram
    FROM purchases own
    WHERE own.id = ${purchaseId}::uuid
  `);

  return rows[0]?.instagram ?? null;
}

/** Name and Instagram handle per Telegram account, for lists that only know the account. */
export async function findBuyerContactsByTelegramUserIds(
  database: SqlExecutor,
  telegramUserIds: string[],
): Promise<Map<string, BuyerContact>> {
  const ids = [...new Set(telegramUserIds.filter(Boolean))];

  if (ids.length === 0) {
    return new Map();
  }

  const rows = await database.execute<{
    full_name: string | null;
    instagram: string | null;
    telegram_user_id: string;
  }>(sql`
    SELECT
      ids.id AS telegram_user_id,
      (
        SELECT NULLIF(BTRIM(p.customer_full_name_snapshot), '')
        FROM purchases p
        WHERE ${samePersonPurchases(sql`NULL`, sql`ids.id`)}
          AND NULLIF(BTRIM(p.customer_full_name_snapshot), '') IS NOT NULL
        ORDER BY p.created_at DESC
        LIMIT 1
      ) AS full_name,
      ${newestInstagram(sql`NULL`, sql`ids.id`)} AS instagram
    FROM unnest(ARRAY[${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )}]::text[]) AS ids(id)
  `);

  return new Map(
    rows.map((row) => [
      row.telegram_user_id,
      { fullName: row.full_name, instagram: row.instagram },
    ]),
  );
}
