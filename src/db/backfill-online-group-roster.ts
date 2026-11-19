import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

import { inArray, sql } from "drizzle-orm";

import { buildMyAccessCards } from "@/lib/my-access/cards";

import { getDatabase, getDatabaseClient } from "./client";
import { loadDatabaseEnvConfig } from "./load-env";
import { readMyAccessSnapshot } from "./my-access";
import {
  backfillOnlineGroupRoster,
  type RosterDecisions,
} from "./online-group-roster-backfill";
import { normalizeEmail } from "./record-values";
import { customers, onlineGroupCohorts } from "./schema";
import type { DatabaseTransaction } from "./transaction";

/*
 * Applies the owner's roster decisions (see online-group-roster-backfill.ts). The
 * decisions file holds names and emails, so it and the report live outside the
 * repository. A dry run by default: everything runs in one transaction, the report
 * shows «Мой доступ» of every person before and after, then it rolls back; only
 * `--apply` commits.
 *   npm run db:backfill:roster:prod -- --decisions=/abs/decisions.json \
 *     --report=/abs/report.json [--apply]
 */

loadDatabaseEnvConfig();

const argument = (name: string) => {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
};

const outsideRepository = (path: string | null, name: string) => {
  if (!path) throw new Error(`--${name} is required`);
  const absolute = resolve(path);
  const repository = realpathSync(process.cwd());
  const folder = realpathSync(dirname(absolute));
  if (folder === repository || folder.startsWith(`${repository}${sep}`)) {
    throw new Error(`--${name} must be outside the repository: it holds personal data`);
  }
  return absolute;
};

/** What «Мой доступ» shows each email's customer: cycles behind and the cards. */
async function readAccessViews(tx: DatabaseTransaction, emails: string[]) {
  const rows = emails.length
    ? await tx
        .select({ email: customers.normalizedEmail, id: customers.id })
        .from(customers)
        .where(inArray(customers.normalizedEmail, emails))
    : [];
  const cohorts = await tx
    .select({ id: onlineGroupCohorts.id, title: onlineGroupCohorts.title })
    .from(onlineGroupCohorts);
  const titleOf = new Map(cohorts.map((cohort) => [cohort.id, cohort.title]));
  const now = new Date();
  const views: Record<string, { cycles: string[]; cards: string[] }[]> = {};
  for (const row of rows) {
    const snapshot = await readMyAccessSnapshot(tx, row.id);
    if (!snapshot) continue;
    const cards = buildMyAccessCards(snapshot, now, {
      hubPurchase: false,
      hubRenewal: false,
    });
    (views[row.email!] ??= []).push({
      cards: cards.map((card) => `${card.id.split(":")[0]}:${card.status.key}`),
      cycles: (snapshot.completedCohortIds ?? []).map((id) => titleOf.get(id) ?? id),
    });
  }
  return views;
}

/** Counts that must not move except where the run writes, and Stripe totals. */
async function readTotals(tx: DatabaseTransaction) {
  const [row] = await tx.execute<Record<string, number | string>>(sql`
    SELECT
      (SELECT count(*)::int FROM customers) AS customers,
      (SELECT count(*)::int FROM purchases) AS purchases,
      (SELECT count(*)::int FROM purchases WHERE source = 'admin_offer_link') AS admin_purchases,
      (SELECT count(*)::int FROM access_entitlements) AS entitlements,
      (SELECT count(*)::int FROM purchase_side_effects) AS outbox,
      (SELECT count(*)::int FROM email_campaign_leads) AS campaign_leads,
      (SELECT count(*)::int FROM telegram_access_tokens) AS telegram_tokens,
      (SELECT coalesce(sum(amount_minor), 0)::text FROM purchases
        WHERE source = 'stripe' AND outcome = 'succeeded' AND currency = 'eur') AS stripe_eur_minor,
      (SELECT coalesce(sum(amount_minor), 0)::text FROM purchases
        WHERE source = 'stripe' AND outcome = 'succeeded' AND currency = 'pln') AS stripe_pln_minor
  `);
  return row!;
}

class DryRun extends Error {}

async function main() {
  if (
    process.env.DATABASE_ENV !== "development" &&
    process.env.DATABASE_ENV !== "production"
  ) {
    throw new Error("DATABASE_ENV must be development or production");
  }
  const apply = process.argv.includes("--apply");
  const decisionsPath = outsideRepository(argument("decisions"), "decisions");
  const reportPath = outsideRepository(argument("report"), "report");
  const decisions = JSON.parse(readFileSync(decisionsPath, "utf8")) as RosterDecisions;
  const emails = [
    ...new Set(
      [...decisions.links, ...decisions.participations].map((item) =>
        normalizeEmail(item.email),
      ),
    ),
  ];

  let report: Record<string, unknown> = {};
  try {
    await getDatabase().transaction(async (tx) => {
      const before = {
        access: await readAccessViews(tx, emails),
        totals: await readTotals(tx),
      };
      const result = await backfillOnlineGroupRoster(tx, decisions);
      const after = {
        access: await readAccessViews(tx, emails),
        totals: await readTotals(tx),
      };
      report = {
        after,
        applied: apply,
        before,
        database: process.env.DATABASE_ENV,
        result,
      };
      if (!apply) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const result = report.result as Awaited<ReturnType<typeof backfillOnlineGroupRoster>>;
  const tally = (items: { outcome: string }[]) =>
    items.reduce<Record<string, number>>((counts, item) => {
      counts[item.outcome] = (counts[item.outcome] ?? 0) + 1;
      return counts;
    }, {});
  process.stdout.write(
    `${JSON.stringify(
      {
        applied: apply,
        database: process.env.DATABASE_ENV,
        links: tally(result.links),
        newCustomers: result.createdCustomerIds.length,
        participations: tally(result.participations),
        report: reportPath,
        totals: {
          after: (report.after as { totals: unknown }).totals,
          before: (report.before as { totals: unknown }).totals,
        },
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getDatabaseClient().end());
