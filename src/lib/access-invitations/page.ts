/**
 * The invitation page: what it shows for a renewal invitation link, the Telegram
 * check that takes the account as the owner, and «Попробовать ещё раз».
 */
import {
  type AccessInvitationRecord,
  confirmInvitationTelegramInDatabase,
  type InvitationLocale,
  readAccessInvitation,
} from "@/db/access-invitations";
import { getFirstName } from "@/lib/my-access/greeting";
import { buildMyAccessPath } from "@/lib/my-access/link";
import { logSafeError } from "@/lib/safe-error-log";
import {
  createTelegramLoginNonce,
  getTelegramLoginClientId,
  getTelegramUserIdFromClaims,
  isTelegramLoginConfigured,
  verifyTelegramLoginIdToken,
  verifyTelegramLoginNonce,
} from "@/lib/telegram/login";

import { invitationNonceScope, verifyInvitationToken } from "./link";
import {
  collectInvitationAccessLines,
  enqueueInvitationEmail,
  getInvitationProduct,
  type InvitationAccessLine,
  invitationLocale,
  type InvitationProduct,
  linksEmailKey,
  sendInvitationLinks,
} from "./service";

export type InvitationSummary = {
  firstName: string;
  product: InvitationProduct;
  cohortTitle: string | null;
  locale: InvitationLocale;
};

export type InvitationPageState =
  | { status: "invalid" | "expired" | "revoked" | "unavailable" }
  | {
      status: "ready";
      summary: InvitationSummary;
      clientId: string;
      nonce: string;
    }
  | {
      status: "verified";
      summary: InvitationSummary;
      lines: InvitationAccessLine[];
      myAccessPath: string | null;
    };

const summarize = (invitation: AccessInvitationRecord): InvitationSummary => ({
  firstName: getFirstName(invitation.customerFullNameSnapshot) ?? "",
  product: getInvitationProduct(invitation.offerExternalId ?? ""),
  cohortTitle: invitation.cohortTitle,
  locale: invitationLocale(invitation),
});

const myAccessPathOf = (invitation: AccessInvitationRecord) =>
  buildMyAccessPath(invitation.customerId);

const loadRenewalInvitation = async (
  token: string | null | undefined,
): Promise<
  { invitation: AccessInvitationRecord } | { status: "invalid" | "expired" | "revoked" }
> => {
  const check = verifyInvitationToken(token);
  if (check.status !== "valid") return { status: check.status };

  const invitation = await readAccessInvitation(check.purchaseId);
  if (!invitation || invitation.invitationKind !== "renewal")
    return { status: "invalid" };
  if (invitation.outcome !== "succeeded") return { status: "revoked" };
  return { invitation };
};

/** What the page shows: the welcome with the Telegram button, or the result again. */
export async function readInvitationPage(
  token: string | null | undefined,
): Promise<InvitationPageState> {
  if (!isTelegramLoginConfigured()) return { status: "unavailable" };

  const loaded = await loadRenewalInvitation(token);
  if (!("invitation" in loaded)) return loaded;

  const { invitation } = loaded;
  if (invitation.telegramUserId) {
    return {
      status: "verified",
      summary: summarize(invitation),
      lines: await collectInvitationAccessLines(invitation),
      myAccessPath: myAccessPathOf(invitation),
    };
  }

  return {
    status: "ready",
    summary: summarize(invitation),
    clientId: getTelegramLoginClientId(),
    nonce: createTelegramLoginNonce(invitationNonceScope(invitation.id)),
  };
}

export type InvitationConfirmResult =
  | {
      status: "verified";
      lines: InvitationAccessLine[];
      myAccessPath: string | null;
      emailed: boolean;
    }
  | {
      status: "error";
      errorCode:
        | "invalid"
        | "expired"
        | "revoked"
        | "other_account"
        | "invalid_telegram_login_nonce"
        | "telegram_login_failed";
    };

/**
 * The renewal check: the Telegram login proves the account, the invitation takes it
 * as its owner, and the links are made (or «already in the chat» shown). A repeat
 * returns the same links and sends no second email.
 */
export async function confirmAccessInvitation({
  idToken,
  nonce,
  token,
}: {
  idToken: string;
  nonce: string;
  token: string;
}): Promise<InvitationConfirmResult> {
  const loaded = await loadRenewalInvitation(token);
  if (!("invitation" in loaded)) return { status: "error", errorCode: loaded.status };

  const { invitation } = loaded;
  if (
    !nonce ||
    !verifyTelegramLoginNonce({ ...invitationNonceScope(invitation.id), nonce })
  ) {
    return { status: "error", errorCode: "invalid_telegram_login_nonce" };
  }

  let telegramUserId: string;
  try {
    telegramUserId = getTelegramUserIdFromClaims(
      await verifyTelegramLoginIdToken(idToken, nonce),
    );
  } catch (error) {
    logSafeError("Failed to verify an invitation Telegram login", error);
    return { status: "error", errorCode: "telegram_login_failed" };
  }
  if (!telegramUserId) return { status: "error", errorCode: "telegram_login_failed" };

  const ownerWrite = await confirmInvitationTelegramInDatabase({
    purchaseId: invitation.id,
    telegramUserId,
  });
  if (ownerWrite === "mismatch") return { status: "error", errorCode: "other_account" };

  const confirmed = (await readAccessInvitation(invitation.id)) ?? invitation;
  const lines = await collectInvitationAccessLines(confirmed, telegramUserId);
  const linkKeys = lines.flatMap((line) =>
    line.state === "link" ? [line.accessKey] : [],
  );

  if (linkKeys.length > 0 && confirmed.customerEmailSnapshot) {
    await enqueueInvitationEmail({
      deduplicationKey: linksEmailKey(invitation.id),
      payload: { purchaseId: invitation.id, template: "links", accessKeys: linkKeys },
      recipient: confirmed.customerEmailSnapshot,
    });
  }

  return {
    status: "verified",
    lines,
    myAccessPath: myAccessPathOf(confirmed),
    emailed: linkKeys.length > 0 && Boolean(confirmed.customerEmailSnapshot),
  };
}

export type InvitationRetryResult =
  | {
      status: "verified";
      lines: InvitationAccessLine[];
      myAccessPath: string | null;
      emailed: boolean;
      limited: boolean;
    }
  | { status: "error"; errorCode: "invalid" | "expired" | "revoked" | "needs_telegram" };

/**
 * «Попробовать ещё раз» on the invitation page after a failed or expired link: the
 * page link is the proof (it already shows the links); the new links come by email
 * too. Over the limit the page shows the current state again.
 */
export async function retryInvitationLinks(
  token: string | null | undefined,
): Promise<InvitationRetryResult> {
  const loaded = await loadRenewalInvitation(token);
  if (!("invitation" in loaded)) return { status: "error", errorCode: loaded.status };

  const { invitation } = loaded;
  const result = await sendInvitationLinks(invitation.id);
  if (result.status === "needs_telegram") {
    return { status: "error", errorCode: "needs_telegram" };
  }
  if (result.status === "not_found") return { status: "error", errorCode: "invalid" };
  if (result.status === "revoked") return { status: "error", errorCode: "revoked" };

  return {
    status: "verified",
    lines:
      "lines" in result ? result.lines : await collectInvitationAccessLines(invitation),
    myAccessPath: myAccessPathOf(invitation),
    emailed: result.status === "sent" || result.status === "queued",
    limited: result.status === "limited",
  };
}
