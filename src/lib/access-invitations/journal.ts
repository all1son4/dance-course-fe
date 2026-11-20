import type {
  InvitationJournalAccess,
  InvitationJournalEntry,
} from "@/db/access-invitations";

/*
 * What the admin journal says about one invitation, from what the invitation gives:
 * for the group, «в чате» is the cohort chat; the Hub of a Plus is its own line with
 * its own words. A pure reading of the stored state, so the tests check it directly.
 */

export type JournalTone = "success" | "neutral" | "warning" | "danger";

export type JournalAccessView = {
  accessKey: InvitationJournalAccess["accessKey"];
  /** The chat by its Telegram title, or its role when the title is unknown. */
  chatTitle: string;
  label: string;
  tone: JournalTone;
  /** The date that goes with the label: the link's end, the access end, the opening. */
  date: { kind: "linkUntil" | "accessUntil" | "opens"; at: string } | null;
  /** The link to copy while it can still let the person in. */
  accessUrl: string;
};

export type JournalView = {
  accesses: JournalAccessView[];
  /** What is left and for whom; null when nothing is (all received, or all over). */
  next: { label: string; tone: JournalTone } | null;
  /** The chats the person sits in now, by name; none after a leave or a removal. */
  inChats: string[];
  /** Something only Anna can fix (a failed link or email, an expired link). */
  needsAnna: boolean;
  /** «Отправить ссылки ещё раз»: someone with an account to send links for. */
  canResendLinks: boolean;
  /** «Отправить письмо ещё раз»: the page email, while Telegram waits for its check. */
  canResendInvite: boolean;
  /** «Проверить в Telegram»: the account is known. */
  canRecheck: boolean;
};

type Entry = Pick<
  InvitationJournalEntry,
  "kind" | "revoked" | "telegramConfirmed" | "accesses"
> & { inviteEmailStatus: string | null };

const iso = (date: Date | null) => date?.toISOString() ?? null;

const chatName = (access: InvitationJournalAccess) =>
  access.chatTitle.trim() ||
  (access.accessKey === "inspiration-hub" ? "Inspiration Hub" : "Чат потока");

const describeAccess = (
  access: InvitationJournalAccess,
  waitsForTelegram: boolean,
  now: Date,
): Omit<JournalAccessView, "accessKey" | "chatTitle" | "accessUrl"> => {
  const isHub = access.accessKey === "inspiration-hub";
  const accessUntil = iso(access.expiresAt);
  const until = accessUntil ? { kind: "accessUntil" as const, at: accessUntil } : null;

  switch (access.state) {
    case "member":
      return isHub && !access.joinedByLink
        ? { label: "Уже в Hub, доступ продлён", tone: "success", date: until }
        : { label: isHub ? "В Hub" : "В чате", tone: "success", date: until };
    case "issued":
      return {
        label: "Ссылка выдана, ещё не использована",
        tone: "neutral",
        date: access.tokenExpiresAt
          ? { kind: "linkUntil", at: access.tokenExpiresAt.toISOString() }
          : null,
      };
    case "left":
      return {
        label: isHub ? "Вышли из Hub" : "Вышли из чата",
        tone: "neutral",
        date: null,
      };
    case "expired":
      return access.expiresAt && access.expiresAt <= now
        ? { label: "Доступ закончился", tone: "neutral", date: until }
        : { label: "Ссылка истекла, не использована", tone: "warning", date: null };
    case "failed":
      return { label: "Не удалось создать ссылку", tone: "danger", date: null };
    case "revoked":
      return { label: "Отозван", tone: "neutral", date: null };
    case "pending":
      if (waitsForTelegram) {
        return { label: "Ждёт проверки Telegram", tone: "neutral", date: null };
      }
      if (access.startsAt && access.startsAt > now) {
        return {
          label: "Откроется позже, ссылка придёт в день начала",
          tone: "neutral",
          date: { kind: "opens", at: access.startsAt.toISOString() },
        };
      }
      return { label: "Ссылки пока нет", tone: "neutral", date: null };
  }
};

export const describeInvitationJournalEntry = (
  entry: Entry,
  now = new Date(),
): JournalView => {
  const waitsForTelegram = entry.kind === "renewal" && !entry.telegramConfirmed;
  const accesses = entry.accesses.map((access) => ({
    accessKey: access.accessKey,
    chatTitle: chatName(access),
    accessUrl: !entry.revoked && access.state === "issued" ? access.accessUrl : "",
    ...describeAccess(access, waitsForTelegram, now),
  }));
  const isLegacy = entry.kind === null;
  const base = {
    accesses,
    canRecheck: !entry.revoked && !isLegacy && entry.telegramConfirmed,
    canResendInvite: !entry.revoked && waitsForTelegram,
  };

  if (entry.revoked) {
    return {
      ...base,
      canResendLinks: false,
      inChats: [],
      needsAnna: false,
      next: { label: "Отозвано", tone: "neutral" },
    };
  }

  const inChats = entry.accesses
    .filter((access) => access.state === "member")
    .map(chatName);
  // What the invitation gives: the cohort chat for the group (its Hub is extra), the
  // Hub itself for a Hub invitation.
  const main =
    entry.accesses.find((access) => access.accessKey === "main-group") ??
    entry.accesses.find((access) => access.accessKey === "inspiration-hub") ??
    null;
  const open = entry.accesses.filter(
    (access) => access.state !== "member" && access.state !== "revoked",
  );
  const failed = entry.accesses.some((access) => access.state === "failed");
  const emailFailed =
    entry.inviteEmailStatus === "failed" || entry.inviteEmailStatus === "dead_letter";
  const expiredLink = open.some(
    (access) =>
      access.state === "expired" && !(access.expiresAt && access.expiresAt <= now),
  );
  // A confirmed renewal (or a joining) with no link at all: nothing reached the person.
  const nothingGiven =
    !waitsForTelegram &&
    !isLegacy &&
    main !== null &&
    main.state === "pending" &&
    !(main.startsAt && main.startsAt > now) &&
    entry.kind === "renewal";
  const needsAnna = failed || emailFailed || expiredLink || nothingGiven;
  // Links for an access still running that the person is not in, except a Hub period
  // that has not begun (its link comes on its first day).
  const canResendLinks =
    !isLegacy &&
    !waitsForTelegram &&
    open.some(
      (access) =>
        !(access.expiresAt && access.expiresAt <= now) &&
        !(access.state === "pending" && access.startsAt && access.startsAt > now),
    );

  const next = ((): JournalView["next"] => {
    if (failed) return { label: "Нужна помощь: ссылка не создалась", tone: "danger" };
    if (emailFailed) return { label: "Нужна помощь: письмо не ушло", tone: "danger" };
    if (nothingGiven) return { label: "Нужна помощь: ссылки нет", tone: "danger" };
    if (expiredLink) return { label: "Ссылка истекла — отправь новую", tone: "warning" };
    if (waitsForTelegram) return { label: "Ждёт проверки Telegram", tone: "neutral" };
    if (!main) return null;
    if (main.state === "issued") {
      return {
        label:
          main.accessKey === "main-group"
            ? "Ждёт входа в чат потока"
            : "Ждёт входа в Inspiration Hub",
        tone: "neutral",
      };
    }
    const hubWaits = entry.accesses.find(
      (access) => access.accessKey === "inspiration-hub" && access.state === "issued",
    );
    if (main.state === "member" && hubWaits) {
      return { label: "Ждёт входа в Inspiration Hub", tone: "neutral" };
    }
    if (main.state === "pending") {
      return main.startsAt && main.startsAt > now
        ? { label: "Откроется позже", tone: "neutral" }
        : { label: "Готовится ссылка", tone: "neutral" };
    }
    // In the chat, or out of every chat (left, removed, ended): the chat badges say it.
    return null;
  })();

  return { ...base, canResendLinks, inChats, needsAnna, next };
};
