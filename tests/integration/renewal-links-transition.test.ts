import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { saveOnlineGroupCampaignInTransaction } from "@/db/online-group-campaigns";
import * as schema from "@/db/schema";
import { onlineGroupCohorts, renewalCampaigns, telegramChats } from "@/db/schema";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const client = postgres(getRequiredTestDatabaseUrl(), { max: 2, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await client.end();
});

const ROLLBACK = new Error("rollback_renewal_links_transition_fixture");

test("saving the Online Group settings keeps the links into the next cohort", async () => {
  try {
    await db.transaction(async (tx) => {
      const suffix = randomUUID();
      const chat = (name: string) => `renewal_transition_${name}_${suffix}`;
      const [hub, previous, current, next] = ["hub", "previous", "current", "next"].map(
        chat,
      );
      await tx.insert(telegramChats).values(
        [hub, previous, current, next].map((chatId) => ({
          chatId,
          title: chatId,
          type: "supergroup",
        })),
      );
      const [running] = await tx
        .insert(onlineGroupCohorts)
        .values({
          mainChatId: current,
          startsAt: new Date("2026-11-09T17:00:00.000Z"),
          title: "Online Group 3.0",
        })
        .returning();
      await tx.insert(onlineGroupCohorts).values({
        mainChatId: next,
        previousCohortId: running!.id,
        startsAt: new Date("2027-01-18T18:00:00.000Z"),
        title: "Online Group 4.0",
      });
      // Links into the next cohort (made by «Настроить переход»), into the current one,
      // and a stale one into a cohort that is over.
      const links = { intoCurrent: current, intoNext: next, stale: previous };
      await tx.insert(renewalCampaigns).values(
        Object.entries(links).map(([name, targetChatId]) => ({
          offerExternalId: "off_online_group_anna_strok_renewal_discount",
          productExternalId: "prd_L9aK3mT7qP2x",
          slug: `rnw_${name}_${suffix}`.slice(0, 80),
          sourceChatId: previous,
          targetChatId,
          title: name,
        })),
      );

      // «Исправить название или дату»: same chat, new title.
      await saveOnlineGroupCampaignInTransaction({
        existingCampaign: undefined,
        inspirationChatId: hub,
        mainChatId: current,
        startsAt: new Date("2026-11-09T17:00:00.000Z"),
        title: "Online Group 3.0 (renamed)",
        tx,
      });

      const rows = await tx
        .select({ status: renewalCampaigns.status, title: renewalCampaigns.title })
        .from(renewalCampaigns)
        .where(inArray(renewalCampaigns.targetChatId, [previous, current, next]));
      const statusOf = (name: string) => rows.find((row) => row.title === name)?.status;
      assert.equal(statusOf("intoNext"), "active");
      assert.equal(statusOf("intoCurrent"), "active");
      assert.equal(statusOf("stale"), "archived");
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
});
