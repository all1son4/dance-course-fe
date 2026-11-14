import { getSystemPulse } from "@/lib/admin/system-pulse";
import { isAdminInviteLinksRequestAuthenticated } from "@/lib/admin-invite-links-auth";
import { jsonErrorNoStore, jsonNoStore } from "@/lib/http-security";
import { logSafeError } from "@/lib/safe-error-log";

export const runtime = "nodejs";

/** Live, read-only signals of payments, the delivery queue and the Telegram bot. */
export async function GET(request: Request) {
  if (!isAdminInviteLinksRequestAuthenticated(request)) {
    return jsonErrorNoStore("unauthorized", { status: 401 });
  }

  try {
    return jsonNoStore(await getSystemPulse());
  } catch (error) {
    logSafeError("Failed to load the system pulse", error);
    return jsonErrorNoStore("system_pulse_unavailable", { status: 500 });
  }
}
