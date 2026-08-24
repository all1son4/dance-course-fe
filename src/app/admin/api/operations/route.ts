import {
  listOutboxDeadLetters,
  listProblemAccessEntitlements,
  listStripeInboxDeadLetters,
} from "@/db/admin-operations";
import { readOperationalDatabaseStatus } from "@/db/operational-status";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { jsonNoStore } from "@/lib/http-security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonNoStore({ errorCode: "unauthorized" }, { status: 401 });
  }

  try {
    const [status, inboxDeadLetters, outboxDeadLetters, problemEntitlements] =
      await Promise.all([
        readOperationalDatabaseStatus(),
        listStripeInboxDeadLetters(),
        listOutboxDeadLetters(),
        listProblemAccessEntitlements(),
      ]);

    return jsonNoStore({
      ...status,
      inboxDeadLetters,
      outboxDeadLetters,
      problemEntitlements,
    });
  } catch (error) {
    console.error("Failed to load admin operations snapshot", error);
    return jsonNoStore({ errorCode: "operations_snapshot_failed" }, { status: 500 });
  }
}
