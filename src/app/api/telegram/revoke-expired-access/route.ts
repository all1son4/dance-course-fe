import { jsonNoStore } from "@/lib/http-security";
import { revokeExpiredTelegramChannelAccess } from "@/lib/telegram/access";
import { revokeExpiredOnlineGroupHubAccess } from "@/lib/telegram/online-group-access";

export const runtime = "nodejs";

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

  try {
    const [standard, onlineGroup] = await Promise.all([
      revokeExpiredTelegramChannelAccess(),
      revokeExpiredOnlineGroupHubAccess(),
    ]);

    return jsonNoStore({
      ok: true,
      onlineGroup,
      standard,
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
