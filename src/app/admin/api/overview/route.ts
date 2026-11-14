import { getAdminOverview } from "@/lib/admin/overview";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { jsonErrorNoStore, jsonNoStore } from "@/lib/http-security";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

/** The control centre's home: attention list, numbers, events and section badges. */
export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  try {
    return jsonNoStore(await getAdminOverview());
  } catch (error) {
    logSafeError("Failed to load the admin overview", error);
    return jsonErrorNoStore("overview_unavailable", { status: 500 });
  }
}
