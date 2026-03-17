import { jsonNoStore } from "@/lib/http-security";
import { revokeExpiredTelegramChannelAccess } from "@/lib/telegram/access";

export const runtime = "nodejs";
const DEFAULT_REVOKE_CRON_INTERVAL_MINUTES = 24 * 60;

const getRevokeCronIntervalMinutes = () => {
  // TELEGRAM_REVOKE_CRON_INTERVAL_MINUTES controls how often revoke job should run.
  // Example: 1440 -> once per day (production), 5 -> every 5 minutes (testing).
  const parsedMinutes = Number.parseInt(
    process.env.TELEGRAM_REVOKE_CRON_INTERVAL_MINUTES?.trim() ?? "",
    10,
  );

  if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
    return DEFAULT_REVOKE_CRON_INTERVAL_MINUTES;
  }

  return parsedMinutes;
};

const shouldRunRevokeNow = (intervalMinutes: number) => {
  const minuteTick = Math.floor(Date.now() / 60_000);

  return minuteTick % intervalMinutes === 0;
};

const isAuthorizedCronRequest = (request: Request) => {
  const configuredSecret = process.env.CRON_SECRET?.trim() ?? "";
  const isProduction = process.env.NODE_ENV === "production";

  if (!configuredSecret) {
    return !isProduction;
  }

  const receivedAuthorization = request.headers.get("authorization")?.trim() ?? "";

  return receivedAuthorization === `Bearer ${configuredSecret}`;
};

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return jsonNoStore(
      {
        errorCode: "unauthorized",
      },
      { status: 401 },
    );
  }

  const intervalMinutes = getRevokeCronIntervalMinutes();

  if (!shouldRunRevokeNow(intervalMinutes)) {
    return jsonNoStore({
      intervalMinutes,
      ok: true,
      reason: "interval_not_reached",
      skipped: true,
    });
  }

  try {
    const summary = await revokeExpiredTelegramChannelAccess();

    return jsonNoStore({
      ...summary,
      ok: true,
    });
  } catch (error) {
    console.error("Failed to revoke expired Telegram access", error);

    return jsonNoStore(
      {
        errorCode: "revoke_expired_access_failed",
      },
      { status: 500 },
    );
  }
}
