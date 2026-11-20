import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import type { ErrorArea } from "@/lib/error-log/error-code";

import { getDatabase } from "./client";
import { operationalEvents } from "./schema";

/*
 * The event log behind «Система»: one row per event, code and Warsaw day, its
 * occurrences counted. Writes never throw at the caller; reads group across days.
 */

export const OPERATIONAL_EVENTS_RETENTION_DAYS = 90;

const warsawDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
    year: "numeric",
  }).format(at);

export type OperationalEventInput = {
  area: ErrorArea;
  event: string;
  code: string;
  severity?: "error" | "warning";
  /** A purchase or payment id the event was about; never an email, name or Telegram id. */
  reference?: string | null;
  at?: Date;
};

/** Counts one occurrence; an archived group comes back, since it happened again. */
export async function recordOperationalEvent({
  area,
  at = new Date(),
  code,
  event,
  reference = null,
  severity = "error",
}: OperationalEventInput): Promise<void> {
  await getDatabase()
    .insert(operationalEvents)
    .values({
      area,
      code,
      day: warsawDay(at),
      event: event.slice(0, 200),
      firstSeenAt: at,
      lastReference: reference?.slice(0, 120) || null,
      lastSeenAt: at,
      severity,
    })
    .onConflictDoUpdate({
      target: [
        operationalEvents.day,
        operationalEvents.area,
        operationalEvents.event,
        operationalEvents.code,
      ],
      set: {
        archivedAt: null,
        lastReference: sql`COALESCE(excluded.last_reference, ${operationalEvents.lastReference})`,
        lastSeenAt: sql`GREATEST(${operationalEvents.lastSeenAt}, excluded.last_seen_at)`,
        occurrences: sql`${operationalEvents.occurrences} + 1`,
        severity: sql`CASE WHEN ${operationalEvents.severity} = 'error' THEN 'error' ELSE excluded.severity END`,
      },
    });
}

export type OperationalEventGroup = {
  area: ErrorArea;
  event: string;
  code: string;
  severity: "error" | "warning";
  occurrences: number;
  days: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastReference: string | null;
};

/** The groups of a period, newest first; archived ones stay out until they recur. */
export async function listOperationalEventGroups({
  limit = 100,
  since,
}: {
  limit?: number;
  since: Date;
}): Promise<OperationalEventGroup[]> {
  const rows = await getDatabase()
    .select({
      area: operationalEvents.area,
      event: operationalEvents.event,
      code: operationalEvents.code,
      severity: sql<
        "error" | "warning"
      >`CASE WHEN bool_or(${operationalEvents.severity} = 'error') THEN 'error' ELSE 'warning' END`,
      occurrences: sql<number>`sum(${operationalEvents.occurrences})::int`,
      days: sql<number>`count(*)::int`,
      firstSeenAt: sql<Date>`min(${operationalEvents.firstSeenAt})`,
      lastSeenAt: sql<Date>`max(${operationalEvents.lastSeenAt})`,
      lastReference: sql<
        string | null
      >`(array_agg(${operationalEvents.lastReference} ORDER BY ${operationalEvents.lastSeenAt} DESC) FILTER (WHERE ${operationalEvents.lastReference} IS NOT NULL))[1]`,
    })
    .from(operationalEvents)
    .where(
      and(gte(operationalEvents.lastSeenAt, since), isNull(operationalEvents.archivedAt)),
    )
    .groupBy(operationalEvents.area, operationalEvents.event, operationalEvents.code)
    .orderBy(desc(sql`max(${operationalEvents.lastSeenAt})`))
    .limit(Math.max(1, Math.min(limit, 200)));

  return rows.map((row) => ({
    ...row,
    firstSeenAt: new Date(row.firstSeenAt),
    lastSeenAt: new Date(row.lastSeenAt),
  }));
}

/** «Убрать»: every day of this group, until it happens again. */
export async function archiveOperationalEventGroup(
  { area, code, event }: { area: string; code: string; event: string },
  now = new Date(),
): Promise<number> {
  const archived = await getDatabase()
    .update(operationalEvents)
    .set({ archivedAt: now })
    .where(
      and(
        eq(operationalEvents.area, area as ErrorArea),
        eq(operationalEvents.event, event),
        eq(operationalEvents.code, code),
        isNull(operationalEvents.archivedAt),
      ),
    )
    .returning({ id: operationalEvents.id });

  return archived.length;
}

/** The daily cleanup: groups not seen for the retention period are deleted. */
export async function deleteOldOperationalEvents(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - OPERATIONAL_EVENTS_RETENTION_DAYS * 86_400_000);
  const deleted = await getDatabase()
    .delete(operationalEvents)
    .where(lt(operationalEvents.lastSeenAt, before))
    .returning({ id: operationalEvents.id });

  return deleted.length;
}
