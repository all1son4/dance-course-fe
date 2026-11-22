import {
  Archive,
  ArchiveRestore,
  Copy,
  Link2,
  Mail,
  RefreshCw,
  ScanSearch,
  Undo2,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";

import { EMAIL_PATTERN } from "@/lib/email-suggestion";

import type { AdminInvitationEntry } from "../api/access-invitations/route";
import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type { StatusMessage } from "../lib/admin.types";
import { formatDateTime } from "../lib/admin.utils";
import { requestAdminJson } from "../lib/admin-request";
import { CopyField, useCopy } from "../ui/copy";
import { ConfirmDialog } from "../ui/feedback";
import { Field, FormActions, Input, SegmentedChoice, StatusLine } from "../ui/forms";
import {
  AdminButton,
  Badge,
  Callout,
  Disclosure,
  EmptyState,
  FieldNote,
  Meta,
  Panel,
  Skeleton,
  Stack,
  TextButton,
} from "../ui/primitives";
import { useShownRows } from "./shown-rows";

/*
 * «Пригласить»: the manual access of the Online Group (Standard/Plus) and of the Hub
 * on its own, as an invitation with the person's name, email and language. Joining
 * sends the chat links at once; a renewal sends the page that confirms Telegram.
 */

type Scope = "group" | "hub";
type Product = "standard" | "plus" | "hub";
type Kind = "join" | "renewal";
type Locale = "ru" | "pl" | "en";
type Target =
  | { ready: true; cohortTitle: string | null; chatTitle: string }
  | { ready: false; problem: string };
type Duplicate = "cohort" | "hub";

const LOCALE_NAMES_PREPOSITIONAL: Record<Locale, string> = {
  ru: "русском",
  pl: "польском",
  en: "английском",
};
const LOCALE_NAMES: Record<Locale, string> = {
  ru: "русский",
  pl: "польский",
  en: "английский",
};
const PRODUCT_LABELS: Record<Product, string> = {
  standard: "Standard",
  plus: "Plus",
  hub: "Hub",
};

const PRODUCT_HINTS: Record<Exclude<Product, "hub">, string> = {
  standard: "Чат потока.",
  plus: "Чат потока и Inspiration Hub на всё время потока.",
};

const KIND_HINTS: Record<Scope, Record<Kind, string>> = {
  group: {
    join: "Письмо сразу придёт с личными ссылками в Telegram.",
    renewal:
      "Письмо придёт со ссылкой на страницу: человек подтвердит Telegram и получит ссылки там же и письмом. Из чата прошлого потока уйдёт по обычному правилу после входа в новый.",
  },
  hub: {
    join: "8 недель с сегодняшнего дня, письмо сразу со ссылкой. Если человек уже в Hub — доступ продлится без новой ссылки.",
    renewal:
      "Письмо придёт со ссылкой на страницу проверки Telegram. 8 недель запишутся в момент проверки и продолжат текущий Hub.",
  },
};

const ISSUE_ERRORS: Record<string, string> = {
  invalid_field: "Проверь поля формы.",
  network_error: "Ошибка сети. Проверь соединение и попробуй ещё раз.",
  rate_limited: "Слишком много попыток. Подожди минуту.",
};

const Form = styled.form`
  display: grid;
  gap: 20px;
`;

const Group = styled.fieldset`
  display: grid;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  > legend {
    margin-bottom: 10px;
    padding: 0;
    color: var(--a-ink-3);
    font-size: var(--a-text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
`;

/* Имя · Фамилия · Почта in one row where there is room; the email gets the widest cell. */
const PeopleGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr);
  gap: 14px 16px;

  @container admin-content (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > :last-child {
      grid-column: 1 / -1;
    }
  }

  @container admin-content (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

/* The switches side by side while they fit, then one under another. */
const ChoiceRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 14px 28px;
`;

const ChoiceField = styled.div`
  display: grid;
  gap: 6px;
  min-width: 0;

  > span {
    color: var(--a-ink);
    font-size: var(--a-text-sm);
    font-weight: 600;
  }

  @container admin-content (max-width: 520px) {
    flex: 1 1 100%;
  }
`;

/* «КОМУ», «ДОСТУПЫ»: the same small caption over each block of an open entry. */
const BlockLabel = styled.p`
  margin: 4px 0 0;
  color: var(--a-ink-3);
  font-size: var(--a-text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

/* «Письмо отправлено → Telegram подтверждён»: plain text; a failed step is red. */
const Chain = styled.ol`
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);

  > li + li::before {
    content: "→ ";
    color: var(--a-ink-3);
  }

  > li[data-failed] {
    color: var(--a-danger);
  }
`;

/* One access: the chat, its state, its date and the link to copy — on one line. */
const AccessRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 8px 12px;
  border-radius: var(--a-radius-sm);
  background: var(--a-surface-sunken);
  font-size: var(--a-text-sm);

  > strong {
    flex: 1 1 200px;
    min-width: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  > [data-end] {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin-left: auto;
    color: var(--a-ink-2);
  }
`;

/* What to do on the left, the tidy-up on the right; they wrap on a phone. */
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;

  > div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
`;

const emailStep = (email: AdminInvitationEntry["inviteEmail"]) => {
  const status = email?.status;
  if (status === "sent") return { label: "Письмо отправлено", failed: false };
  if (status === "failed" || status === "dead_letter") {
    return { label: "Письмо не ушло", failed: true };
  }
  if (status === "skipped") return { label: "Письмо не отправлялось", failed: false };
  return { label: "Письмо отправляется", failed: false };
};

/** The way to the chat: the email, the Telegram check of a renewal, the links email. */
const StatusChain = ({ entry }: { entry: AdminInvitationEntry }) => {
  const steps = [
    emailStep(entry.inviteEmail),
    ...(entry.kind === "renewal"
      ? [
          {
            label: entry.telegramConfirmed
              ? "Telegram подтверждён"
              : "Telegram ещё не подтверждён",
            failed: false,
          },
        ]
      : []),
    ...(entry.linksEmail
      ? [
          entry.linksEmail.status === "sent"
            ? { label: "Ссылки отправлены письмом", failed: false }
            : { ...emailStep(entry.linksEmail), label: "Письмо со ссылками не ушло" },
        ]
      : []),
  ];

  return (
    <Chain aria-label="Ход приглашения">
      {steps.map((step) => (
        <li key={step.label} data-failed={step.failed ? "" : undefined}>
          {step.label}
        </li>
      ))}
    </Chain>
  );
};

const ACCESS_DATE_PREFIX = {
  accessUntil: "доступ до",
  linkUntil: "до",
  opens: "откроется",
} as const;

const AccessLine = ({ access }: { access: AdminInvitationEntry["accesses"][number] }) => {
  const copy = useCopy();

  return (
    <AccessRow>
      <strong>{access.chatTitle}</strong>
      <Badge $tone={access.tone}>{access.label}</Badge>
      <span data-end>
        {access.date && (
          <span>
            {ACCESS_DATE_PREFIX[access.date.kind]} {formatDateTime(access.date.at)}
          </span>
        )}
        {access.accessUrl && (
          <AdminButton
            size="sm"
            variant="ghost"
            icon={<Copy aria-hidden />}
            onClick={() => void copy(access.accessUrl, "Ссылка Telegram")}
          >
            Копировать ссылку
          </AdminButton>
        )}
      </span>
    </AccessRow>
  );
};

const Entry = ({
  busy,
  entry,
  onArchive,
  onRecheck,
  onResend,
  onResendLinks,
  onRevoke,
}: {
  busy: boolean;
  entry: AdminInvitationEntry;
  onArchive: (archived: boolean) => void;
  onRecheck: () => void;
  onResend: () => void;
  onResendLinks: () => void;
  onRevoke: () => void;
}) => {
  const isLegacy = entry.kind === null;
  const states = [
    ...(entry.next ? [{ label: entry.next.label, tone: entry.next.tone }] : []),
    ...entry.inChats.map((chat) => ({
      label: `В чате «${chat}»`,
      tone: "success" as const,
    })),
  ];

  return (
    <Disclosure
      title={entry.fullName}
      hint={`${PRODUCT_LABELS[entry.product]} · ${
        isLegacy ? "ручной доступ" : entry.kind === "join" ? "вступление" : "продление"
      } · ${formatDateTime(entry.createdAt)}`}
      aside={
        states.length > 0
          ? states.map((state) => (
              <Badge $tone={state.tone} key={state.label}>
                {state.label}
              </Badge>
            ))
          : undefined
      }
    >
      <Stack $gap={8}>
        {!isLegacy && (
          <>
            <BlockLabel>Кому</BlockLabel>
            <Meta>
              {[
                entry.email,
                entry.locale
                  ? `письмо на ${LOCALE_NAMES_PREPOSITIONAL[entry.locale as Locale] ?? entry.locale}`
                  : "",
                entry.cohortTitle ?? "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Meta>
            {!entry.revoked && <StatusChain entry={entry} />}
            {entry.note && <Meta>Заметка: {entry.note}</Meta>}
          </>
        )}
        {isLegacy && entry.note && <Meta>Заметка: {entry.note}</Meta>}

        {entry.accesses.length > 0 && <BlockLabel>Доступы</BlockLabel>}
        {entry.accesses.map((access) => (
          <AccessLine access={access} key={access.accessKey} />
        ))}

        {entry.pageUrl && entry.canResendInvite && (
          <CopyField label="Ссылка на страницу проверки" value={entry.pageUrl} />
        )}

        {!isLegacy && (
          <Actions>
            <div>
              {!entry.revoked && entry.canResendLinks && (
                <AdminButton
                  size="sm"
                  icon={<Link2 aria-hidden />}
                  disabled={busy}
                  onClick={onResendLinks}
                >
                  Отправить ссылки ещё раз
                </AdminButton>
              )}
              {!entry.revoked && entry.canResendInvite && (
                <AdminButton
                  size="sm"
                  icon={<Mail aria-hidden />}
                  disabled={busy}
                  onClick={onResend}
                >
                  Отправить письмо ещё раз
                </AdminButton>
              )}
              {!entry.revoked && entry.canRecheck && (
                <AdminButton
                  size="sm"
                  icon={<ScanSearch aria-hidden />}
                  disabled={busy}
                  onClick={onRecheck}
                >
                  Проверить в Telegram
                </AdminButton>
              )}
            </div>
            <div>
              {entry.revocable && (
                <AdminButton
                  size="sm"
                  variant="ghost"
                  icon={<Undo2 aria-hidden />}
                  disabled={busy}
                  onClick={onRevoke}
                >
                  Отозвать
                </AdminButton>
              )}
              {entry.archived !== "auto" && (
                <AdminButton
                  size="sm"
                  variant="ghost"
                  icon={
                    entry.archived ? (
                      <ArchiveRestore aria-hidden />
                    ) : (
                      <Archive aria-hidden />
                    )
                  }
                  disabled={busy}
                  onClick={() => onArchive(!entry.archived)}
                >
                  {entry.archived ? "Вернуть в журнал" : "Убрать из журнала"}
                </AdminButton>
              )}
            </div>
          </Actions>
        )}
      </Stack>
    </Disclosure>
  );
};

const emptyForm = (scope: Scope) => ({
  firstName: "",
  lastName: "",
  email: "",
  locale: "ru" as Locale,
  product: (scope === "hub" ? "hub" : "standard") as Product,
  kind: "join" as Kind,
  note: "",
});

/**
 * The form and the journal of one place: the Online Group tab (Standard/Plus into
 * the current cohort) or the Hub tab (the Hub on its own).
 */
export const AccessInvitations = ({
  onUnauthorized,
  scope,
}: {
  onUnauthorized: () => void;
  scope: Scope;
}) => {
  const [form, setForm] = useState(() => emptyForm(scope));
  const [target, setTarget] = useState<Target | null>(null);
  const [entries, setEntries] = useState<AdminInvitationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [emailHint, setEmailHint] = useState<{ email: string; text: string } | null>(
    null,
  );
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const [revoking, setRevoking] = useState<AdminInvitationEntry | null>(null);
  const [revokeError, setRevokeError] = useState("");
  const localeTouched = useRef(false);
  // What needs Anna comes first, so it is seen without opening every entry; what has
  // nothing left to happen waits in «Архив», folded.
  const current = entries.filter((entry) => !entry.archived);
  const archivedEntries = entries.filter((entry) => entry.archived);
  const ordered = [...current].sort(
    (left, right) => Number(right.needsAnna) - Number(left.needsAnna),
  );
  const needsHelp = current.filter((entry) => entry.needsAnna).length;
  const shown = useShownRows(ordered);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const endpoint = `${ADMIN_API_ENDPOINTS.accessInvitations}?scope=${scope}`;

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await requestAdminJson<{
      target?: Target;
      entries?: AdminInvitationEntry[];
    }>(endpoint);
    setIsLoading(false);
    if (result.unauthorized) return onUnauthorized();
    if (!result.ok) {
      setStatus({
        tone: "error",
        text: "Не получилось загрузить приглашения. Обнови страницу.",
      });
      return;
    }
    setTarget(result.data.target ?? null);
    setEntries(result.data.entries ?? []);
  }, [endpoint, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = <Key extends keyof ReturnType<typeof emptyForm>>(
    key: Key,
    value: ReturnType<typeof emptyForm>[Key],
  ) => setForm((current) => ({ ...current, [key]: value }));

  /** On leaving the email: the language of its last purchase, if the base knows it. */
  const lookUpEmail = async () => {
    const email = form.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || emailHint?.email === email) return;

    const result = await requestAdminJson<{
      hint?: { known: boolean; locale: Locale | null };
      duplicates?: Duplicate[];
    }>(`${endpoint}&email=${encodeURIComponent(email)}`);
    if (!result.ok || !result.data.hint) return;

    const { known, locale } = result.data.hint;
    if (known && locale && !localeTouched.current) update("locale", locale);
    setEmailHint({
      email,
      text: known
        ? `Уже есть в базе${locale ? ` — язык последней покупки: ${LOCALE_NAMES[locale]}` : ""}.`
        : "Новый человек: появится в базе с этой почтой.",
    });
  };

  const send = async (confirmDuplicates: boolean) => {
    setIsSending(true);
    const result = await requestAdminJson<{
      status?: "issued" | "duplicate";
      email?: "sent" | "queued";
      duplicates?: Duplicate[];
      field?: string;
      problem?: string;
    }>(ADMIN_API_ENDPOINTS.accessInvitations, {
      body: { action: "issue", confirmDuplicates, ...form },
      method: "POST",
    });
    setIsSending(false);

    if (result.unauthorized) return onUnauthorized();
    if (result.ok && result.data.status === "duplicate") {
      setDuplicates(result.data.duplicates ?? []);
      return;
    }
    setDuplicates(null);
    if (!result.ok || result.data.status !== "issued") {
      setStatus({
        tone: "error",
        text:
          result.data.problem ??
          ISSUE_ERRORS[result.errorCode] ??
          "Не получилось отправить приглашение. Попробуй ещё раз.",
      });
      return;
    }

    const name = form.firstName.trim();
    setStatus(
      result.data.email === "sent"
        ? { tone: "success", text: `Приглашение для ${name} отправлено.` }
        : {
            tone: "info",
            text: `Приглашение для ${name} создано, но письмо пока не ушло. Повтор будет автоматически — или нажми «Отправить письмо ещё раз».`,
          },
    );
    setForm(emptyForm(scope));
    setEmailHint(null);
    localeTouched.current = false;
    void load();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send(false);
  };

  const resend = async (entry: AdminInvitationEntry) => {
    setBusyId(entry.purchaseId);
    const result = await requestAdminJson<{ status?: string }>(
      ADMIN_API_ENDPOINTS.accessInvitations,
      {
        body: { action: "resend", purchaseId: entry.purchaseId },
        method: "POST",
      },
    );
    setBusyId("");
    if (result.unauthorized) return onUnauthorized();
    setStatus(
      result.ok && result.data.status === "sent"
        ? { tone: "success", text: `Письмо для ${entry.fullName} отправлено ещё раз.` }
        : result.ok && result.data.status === "queued"
          ? {
              tone: "info",
              text: `Письмо для ${entry.fullName} пока не ушло — повтор будет автоматически.`,
            }
          : { tone: "error", text: "Не получилось отправить письмо. Попробуй ещё раз." },
    );
    void load();
  };

  const resendLinks = async (entry: AdminInvitationEntry) => {
    setBusyId(entry.purchaseId);
    const result = await requestAdminJson<{ status?: string }>(
      ADMIN_API_ENDPOINTS.accessInvitations,
      {
        body: { action: "resend_links", purchaseId: entry.purchaseId },
        method: "POST",
      },
    );
    setBusyId("");
    if (result.unauthorized) return onUnauthorized();
    const outcome = result.ok ? result.data.status : "failed";
    setStatus(
      outcome === "sent"
        ? { tone: "success", text: `Ссылки для ${entry.fullName} отправлены письмом.` }
        : outcome === "queued"
          ? {
              tone: "info",
              text: `Ссылки для ${entry.fullName} созданы, письмо пока не ушло — повтор будет автоматически.`,
            }
          : outcome === "no_links"
            ? {
                tone: "error",
                text: `Telegram не выдал ссылку для ${entry.fullName}. Попробуй через минуту или проверь в Telegram.`,
              }
            : outcome === "needs_telegram"
              ? {
                  tone: "info",
                  text: `${entry.fullName} ещё не подтвердили Telegram — сначала страница проверки.`,
                }
              : {
                  tone: "error",
                  text: "Не получилось отправить ссылки. Попробуй ещё раз.",
                },
    );
    void load();
  };

  const archive = async (entry: AdminInvitationEntry, archived: boolean) => {
    setBusyId(entry.purchaseId);
    const result = await requestAdminJson<{ status?: string }>(
      ADMIN_API_ENDPOINTS.accessInvitations,
      {
        body: {
          action: archived ? "archive" : "unarchive",
          purchaseId: entry.purchaseId,
        },
        method: "POST",
      },
    );
    setBusyId("");
    if (result.unauthorized) return onUnauthorized();
    setStatus(
      result.ok && result.data.status === "done"
        ? {
            tone: "success",
            text: archived
              ? `${entry.fullName} — в архиве журнала. Доступы не изменились.`
              : `${entry.fullName} — снова в журнале.`,
          }
        : { tone: "error", text: "Не получилось. Попробуй ещё раз." },
    );
    void load();
  };

  const recheck = async (entry: AdminInvitationEntry) => {
    setBusyId(entry.purchaseId);
    const result = await requestAdminJson<{
      status?: string;
      chats?: { accessKey: string; membership: "member" | "absent" | "unknown" }[];
    }>(ADMIN_API_ENDPOINTS.accessInvitations, {
      body: { action: "recheck", purchaseId: entry.purchaseId },
      method: "POST",
    });
    setBusyId("");
    if (result.unauthorized) return onUnauthorized();
    if (!result.ok || result.data.status !== "checked") {
      setStatus({
        tone: "error",
        text: "Не получилось проверить в Telegram. Попробуй ещё раз.",
      });
      return;
    }
    const titleOf = (accessKey: string) =>
      entry.accesses.find((access) => access.accessKey === accessKey)?.chatTitle ??
      accessKey;
    const parts = (result.data.chats ?? []).map((chat) =>
      chat.membership === "member"
        ? `в чате «${titleOf(chat.accessKey)}»`
        : chat.membership === "absent"
          ? `нет в чате «${titleOf(chat.accessKey)}»`
          : `«${titleOf(chat.accessKey)}» — Telegram не ответил`,
    );
    setStatus({
      tone: "info",
      text: `${entry.fullName}: ${parts.join(", ") || "чатов для проверки нет"}.`,
    });
    void load();
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusyId(revoking.purchaseId);
    setRevokeError("");
    const result = await requestAdminJson<{ status?: string }>(
      ADMIN_API_ENDPOINTS.accessInvitations,
      {
        body: { action: "revoke", purchaseId: revoking.purchaseId },
        method: "POST",
      },
    );
    setBusyId("");
    if (result.unauthorized) return onUnauthorized();

    const outcome = result.ok ? result.data.status : "failed";
    if (outcome === "revoked" || outcome === "already_revoked") {
      setStatus({
        tone: "success",
        text: `Приглашение для ${revoking.fullName} отозвано.`,
      });
      setRevoking(null);
      void load();
      return;
    }
    // Inside the dialog the error stays in the dialog.
    setRevokeError(
      outcome === "already_used"
        ? "Приглашением уже воспользовались — отозвать его нельзя."
        : outcome === "telegram_failed"
          ? "Telegram не ответил, ничего не изменилось. Попробуй ещё раз."
          : "Не получилось отозвать. Попробуй ещё раз.",
    );
  };

  const renderEntry = (entry: AdminInvitationEntry) => (
    <Entry
      key={entry.purchaseId}
      busy={busyId === entry.purchaseId}
      entry={entry}
      onArchive={(archived) => void archive(entry, archived)}
      onRecheck={() => void recheck(entry)}
      onResend={() => void resend(entry)}
      onResendLinks={() => void resendLinks(entry)}
      onRevoke={() => {
        setRevokeError("");
        setRevoking(entry);
      }}
    />
  );

  const isReady = target?.ready === true;
  const canSend =
    isReady &&
    !isSending &&
    form.firstName.trim() !== "" &&
    EMAIL_PATTERN.test(form.email.trim());
  const where =
    target?.ready && scope === "group"
      ? `в текущий поток «${target.cohortTitle}» (чат «${target.chatTitle}»)`
      : target?.ready
        ? `в Inspiration Hub (чат «${target.chatTitle}»)`
        : "";

  return (
    <Stack $gap={16}>
      <Panel
        title={scope === "hub" ? "Пригласить в Inspiration Hub" : "Пригласить в поток"}
        description={
          where
            ? `Доступ без оплаты ${where}. Человек получит письмо; в продажах и отчёте о выручке приглашения нет.`
            : "Доступ без оплаты по приглашению: человек получит письмо со ссылками."
        }
      >
        {target && !target.ready ? (
          <Callout tone="warning">{target.problem}</Callout>
        ) : (
          <Form onSubmit={submit} noValidate>
            <Group>
              <legend>Кому</legend>
              <PeopleGrid>
                <Field label="Имя *" htmlFor={`${scope}-invite-first`}>
                  <Input
                    id={`${scope}-invite-first`}
                    autoComplete="off"
                    maxLength={80}
                    value={form.firstName}
                    onChange={(event) => update("firstName", event.target.value)}
                  />
                </Field>
                <Field label="Фамилия" htmlFor={`${scope}-invite-last`}>
                  <Input
                    id={`${scope}-invite-last`}
                    autoComplete="off"
                    maxLength={80}
                    value={form.lastName}
                    onChange={(event) => update("lastName", event.target.value)}
                  />
                </Field>
                <Field
                  label="Почта *"
                  htmlFor={`${scope}-invite-email`}
                  hint={
                    emailHint?.email === form.email.trim().toLowerCase()
                      ? emailHint.text
                      : "Сюда придёт письмо со ссылками."
                  }
                >
                  <Input
                    id={`${scope}-invite-email`}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={254}
                    value={form.email}
                    onBlur={() => void lookUpEmail()}
                    onChange={(event) => update("email", event.target.value)}
                  />
                </Field>
              </PeopleGrid>
            </Group>

            <Group>
              <legend>Доступ</legend>
              <ChoiceRow>
                <ChoiceField>
                  <span>Язык письма и страницы</span>
                  <SegmentedChoice<Locale>
                    label="Язык письма и страницы"
                    name={`${scope}-invite-locale`}
                    value={form.locale}
                    options={[
                      { label: "RU", value: "ru" },
                      { label: "PL", value: "pl" },
                      { label: "EN", value: "en" },
                    ]}
                    onChange={(value) => {
                      localeTouched.current = true;
                      update("locale", value);
                    }}
                  />
                </ChoiceField>
                {scope === "group" && (
                  <ChoiceField>
                    <span>Тариф</span>
                    <SegmentedChoice<Product>
                      label="Тариф"
                      name="group-invite-product"
                      value={form.product}
                      options={[
                        { label: "Standard", value: "standard" },
                        { label: "Plus", value: "plus" },
                      ]}
                      onChange={(value) => update("product", value)}
                    />
                  </ChoiceField>
                )}
                <ChoiceField>
                  <span>Как человек войдёт</span>
                  <SegmentedChoice<Kind>
                    label="Как человек войдёт"
                    name={`${scope}-invite-kind`}
                    value={form.kind}
                    options={[
                      { label: "Вступление", value: "join" },
                      { label: "Продление", value: "renewal" },
                    ]}
                    onChange={(value) => update("kind", value)}
                  />
                </ChoiceField>
              </ChoiceRow>
              <FieldNote>
                {form.product === "hub"
                  ? KIND_HINTS[scope][form.kind]
                  : `${PRODUCT_HINTS[form.product]} ${KIND_HINTS[scope][form.kind]}`}
              </FieldNote>
            </Group>

            <Field
              label="Заметка"
              htmlFor={`${scope}-invite-note`}
              hint="Видна только в админке: например, «оплата наличными» или «подарок»."
            >
              <Input
                id={`${scope}-invite-note`}
                autoComplete="off"
                maxLength={500}
                value={form.note}
                onChange={(event) => update("note", event.target.value)}
              />
            </Field>

            <FormActions>
              <AdminButton
                type="submit"
                variant="primary"
                disabled={!canSend}
                loading={isSending}
              >
                Отправить приглашение
              </AdminButton>
            </FormActions>
          </Form>
        )}
        <StatusLine status={status} />
      </Panel>

      <Panel
        title="Журнал приглашений"
        description="Кому, что и на каком шаге. Нажми на строку — откроются ссылки и действия."
        actions={
          <AdminButton
            size="sm"
            variant="ghost"
            icon={<RefreshCw aria-hidden />}
            disabled={isLoading}
            onClick={() => void load()}
          >
            Обновить
          </AdminButton>
        }
      >
        {isLoading && entries.length === 0 ? (
          <Stack $gap={10}>
            <Skeleton $height={96} />
            <Skeleton $height={96} />
          </Stack>
        ) : entries.length === 0 ? (
          <EmptyState title="Приглашений пока нет" />
        ) : (
          <div>
            {needsHelp > 0 && (
              <Callout tone="danger">
                {needsHelp === 1
                  ? "Одной записи нужна твоя помощь — она стоит первой."
                  : `Записей, которым нужна твоя помощь: ${needsHelp}. Они стоят первыми.`}
              </Callout>
            )}
            {shown.rows.map(renderEntry)}
            {shown.toggle}
            {ordered.length === 0 && (
              <EmptyState title="В журнале пусто — всё завершённое в архиве" />
            )}
            {archivedEntries.length > 0 && (
              <FieldNote>
                <TextButton type="button" onClick={() => setArchiveOpen(!archiveOpen)}>
                  {archiveOpen ? "Свернуть архив" : `Архив · ${archivedEntries.length}`}
                </TextButton>
                {archiveOpen
                  ? ""
                  : " · завершённые и убранные вручную; доступы у людей не меняются"}
              </FieldNote>
            )}
            {archiveOpen && archivedEntries.map(renderEntry)}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={duplicates !== null}
        title="У этой почты уже есть доступ"
        description={
          duplicates?.includes("cohort")
            ? `В потоке${target?.ready && target.cohortTitle ? ` «${target.cohortTitle}»` : ""} уже есть покупка или приглашение с почтой ${form.email.trim()}. Второе приглашение даст ещё одни ссылки.`
            : `У почты ${form.email.trim()} сейчас идёт Inspiration Hub. Новое приглашение добавит ещё 8 недель после текущих.`
        }
        confirmLabel="Всё равно пригласить"
        busy={isSending}
        onCancel={() => setDuplicates(null)}
        onConfirm={() => void send(true)}
      />

      <ConfirmDialog
        open={revoking !== null}
        title="Отозвать приглашение?"
        description={
          revoking
            ? `Ссылки и страница для ${revoking.fullName} перестанут работать, а приглашение не будет считаться участником. Вернуть его нельзя — только пригласить заново.`
            : ""
        }
        confirmLabel="Отозвать"
        tone="danger"
        busy={Boolean(revoking && busyId === revoking.purchaseId)}
        onCancel={() => setRevoking(null)}
        onConfirm={() => void revoke()}
      >
        {revokeError && <Callout tone="danger">{revokeError}</Callout>}
      </ConfirmDialog>
    </Stack>
  );
};
