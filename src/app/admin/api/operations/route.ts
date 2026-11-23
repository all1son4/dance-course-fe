import {
  listOutboxDeadLetters,
  listProblemAccessEntitlements,
  listStripeInboxDeadLetters,
} from "@/db/admin-operations";
import { listOperationalEventGroups } from "@/db/operational-events";
import { readOperationalDatabaseStatus } from "@/db/operational-status";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { titleOfEvent } from "@/lib/error-log/event-titles";
import { explainErrorCode } from "@/lib/error-log/explanations";
import { jsonErrorNoStore, jsonNoStore } from "@/lib/http-security";
import { logSafeError } from "@/lib/safe-error-log";
import { DAY_MS } from "@/lib/time";

export const runtime = "nodejs";

/** The event journal of «Система» shows the last 30 days. */
const EVENTS_WINDOW_MS = 30 * DAY_MS;

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  try {
    const [status, inboxDeadLetters, outboxDeadLetters, problemEntitlements, events] =
      await Promise.all([
        readOperationalDatabaseStatus(),
        listStripeInboxDeadLetters(),
        listOutboxDeadLetters(),
        listProblemAccessEntitlements(),
        listOperationalEventGroups({ since: new Date(Date.now() - EVENTS_WINDOW_MS) }),
      ]);

    return jsonNoStore({
      ...status,
      // A stored safe code reads in Russian; older rows keep the message they had.
      inboxDeadLetters: inboxDeadLetters.map((entry) => ({
        ...entry,
        errorMessage:
          entry.errorMessage === entry.errorCode
            ? explainErrorCode(entry.errorCode)
            : entry.errorMessage,
      })),
      outboxDeadLetters: outboxDeadLetters.map((entry) => ({
        ...entry,
        lastErrorMessage:
          entry.lastErrorMessage === entry.lastErrorCode
            ? explainErrorCode(entry.lastErrorCode)
            : entry.lastErrorMessage,
      })),
      problemEntitlements,
      events: events.map((group) => ({
        ...group,
        firstSeenAt: group.firstSeenAt.toISOString(),
        lastSeenAt: group.lastSeenAt.toISOString(),
        title: titleOfEvent(group.event),
        explanation: explainErrorCode(group.code),
      })),
    });
  } catch (error) {
    logSafeError("Failed to load admin operations snapshot", error);
    return jsonErrorNoStore("operations_snapshot_failed", { status: 500 });
  }
}
