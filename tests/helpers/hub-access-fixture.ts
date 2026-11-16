import { randomUUID } from "node:crypto";

import type postgres from "postgres";

type HubAccessFixture = {
  cohortId: string;
  hubChatId: string;
  mainChatId: string;
  purchaseId: string;
  tx: postgres.TransactionSql;
};

// Creates an unclassified purchase; the test decides which provenance to assign.
// Every write rolls back, including when the test callback fails.
export const withHubAccessFixture = async (
  client: postgres.Sql,
  run: (fixture: HubAccessFixture) => Promise<void>,
): Promise<void> => {
  const rollback = new Error("rollback_hub_access_fixture");

  try {
    await client.begin(async (tx) => {
      const suffix = randomUUID();
      const mainChatId = `hub_source_main_${suffix}`;
      const hubChatId = `hub_source_hub_${suffix}`;

      await tx`
        INSERT INTO telegram_chats (chat_id, title, type)
        VALUES
          (${mainChatId}, 'Hub source main group', 'supergroup'),
          (${hubChatId}, 'Hub source shared Hub', 'supergroup')
      `;

      const [cohort] = await tx<{ id: string }[]>`
        INSERT INTO online_group_cohorts (title, main_chat_id, starts_at)
        VALUES ('Hub source cohort', ${mainChatId}, '2026-10-01T08:00:00.000Z')
        RETURNING id
      `;
      const [purchase] = await tx<{ id: string }[]>`
        INSERT INTO purchases (
          payment_intent_id, amount_minor, currency, stripe_status, outcome
        )
        VALUES (${`pi_hub_source_${suffix}`}, 4000, 'eur', 'succeeded', 'succeeded')
        RETURNING id
      `;

      await run({
        cohortId: cohort.id,
        hubChatId,
        mainChatId,
        purchaseId: purchase.id,
        tx,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
};
