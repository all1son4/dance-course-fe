import { Mail, RefreshCw, Undo2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";

import type { AdminInvitationEntry } from "../api/access-invitations/route";
import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type { StatusMessage } from "../lib/admin.types";
import {
  formatDateTime,
  resolveOnlineGroupAccessStateLabel,
  resolveOnlineGroupAccessTitle,
} from "../lib/admin.utils";
import { requestAdminJson } from "../lib/admin-request";
import type { AdminTone } from "../styles/tokens.styles";
import { CopyField } from "../ui/copy";
import { ConfirmDialog } from "../ui/feedback";
import {
  Field,
  FormActions,
  FormGrid,
  Input,
  SegmentedChoice,
  StatusLine,
} from "../ui/forms";
import {
  AdminButton,
  Badge,
  Callout,
  Disclosure,
  EmptyState,
  FieldNote,
  Panel,
  Skeleton,
  Stack,
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

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
  gap: 22px;
`;

const Group = styled.fieldset`
  display: grid;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  > legend {
    margin-bottom: 12px;
    padding: 0;
    color: var(--a-ink-3);
    font-size: var(--a-text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
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
`;

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;

  strong {
    min-width: 0;
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  > :last-child:not(strong) {
    margin-left: auto;
  }
`;

const Meta = styled.p`
  margin: 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
  overflow-wrap: anywhere;
`;

/* «Письмо отправлено → Telegram подтверждён → В чате»: done steps are green. */
const Chain = styled.ol`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--a-text-xs);

  > li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  > li + li::before {
    content: "→";
    color: var(--a-ink-3);
  }
`;

const AccessRow = styled.div`
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--a-radius-sm);
  background: var(--a-surface-sunken);
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const stepTone = (state: "done" | "wait" | "failed"): AdminTone =>
  state === "done" ? "success" : state === "failed" ? "danger" : "neutral";

const emailStep = (entry: AdminInvitationEntry) => {
  const status = entry.inviteEmail?.status;
  if (status === "sent") return { label: "Письмо отправлено", state: "done" as const };
  if (status === "failed" || status === "dead_letter") {
    return { label: "Письмо не ушло", state: "failed" as const };
  }
  if (status === "skipped")
    return { label: "Письмо не отправлялось", state: "wait" as const };
  return { label: "Письмо отправляется", state: "wait" as const };
};

const StatusChain = ({ entry }: { entry: AdminInvitationEntry }) => {
  const email = emailStep(entry);
  const steps = [
    email,
    ...(entry.kind === "renewal"
      ? [
          {
            label: entry.telegramConfirmed
              ? "Telegram подтверждён"
              : "Telegram не подтверждён",
            state: entry.telegramConfirmed ? ("done" as const) : ("wait" as const),
          },
        ]
      : []),
    {
      label: entry.inChat ? "В чате" : "Ещё не в чате",
      state: entry.inChat ? ("done" as const) : ("wait" as const),
    },
  ];

  return (
    <Chain aria-label="Ход приглашения">
      {steps.map((step) => (
        <li key={step.label}>
          <Badge $tone={stepTone(step.state)}>{step.label}</Badge>
        </li>
      ))}
    </Chain>
  );
};

const accessMeta = (access: AdminInvitationEntry["accesses"][number]) =>
  [
    access.chatTitle,
    access.state === "issued" && access.tokenExpiresAt
      ? `ссылка до ${formatDateTime(access.tokenExpiresAt)}`
      : "",
    access.startsAt && Date.parse(access.startsAt) > Date.now()
      ? `откроется ${formatDateTime(access.startsAt)}`
      : "",
    access.expiresAt ? `доступ до ${formatDateTime(access.expiresAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

/** The step an invitation has reached, for its one-line summary. */
const currentStep = (entry: AdminInvitationEntry): { label: string; tone: AdminTone } => {
  if (entry.revoked) return { label: "Отозвано", tone: "danger" };
  if (entry.inChat) return { label: "В чате", tone: "success" };
  if (entry.kind === "renewal" && entry.telegramConfirmed) {
    return { label: "Telegram подтверждён", tone: "info" };
  }
  if (entry.kind === null) return { label: "Ссылки выданы", tone: "neutral" };
  const email = emailStep(entry);
  return { label: email.label, tone: email.state === "failed" ? "danger" : "neutral" };
};

const SummaryLine = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
`;

const Entry = ({
  busy,
  entry,
  onResend,
  onRevoke,
}: {
  busy: boolean;
  entry: AdminInvitationEntry;
  onResend: () => void;
  onRevoke: () => void;
}) => {
  const isLegacy = entry.kind === null;

  const step = currentStep(entry);

  return (
    <Disclosure
      title={entry.fullName}
      hint={
        <SummaryLine>
          {PRODUCT_LABELS[entry.product]} ·{" "}
          {isLegacy
            ? "ручной доступ"
            : entry.kind === "join"
              ? "вступление"
              : "продление"}{" "}
          · {formatDateTime(entry.createdAt)}
          <Badge $tone={step.tone}>{step.label}</Badge>
        </SummaryLine>
      }
    >
      <Stack $gap={10}>
        {!isLegacy && (
          <Meta>
            {[
              entry.email,
              entry.locale
                ? `письмо: ${LOCALE_NAMES[entry.locale as Locale] ?? entry.locale}`
                : "",
              entry.cohortTitle ?? "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </Meta>
        )}
        {entry.note && <Meta>Заметка: {entry.note}</Meta>}
        {!isLegacy && !entry.revoked && <StatusChain entry={entry} />}

        {entry.accesses.map((access) => (
          <AccessRow key={access.accessKey}>
            <Head>
              <strong>{resolveOnlineGroupAccessTitle(access.accessKey)}</strong>
              <Badge
                $tone={
                  access.state === "used"
                    ? "success"
                    : access.state === "failed"
                      ? "danger"
                      : "neutral"
                }
              >
                {entry.kind === "renewal" &&
                !entry.telegramConfirmed &&
                access.state === "pending"
                  ? "После проверки Telegram"
                  : resolveOnlineGroupAccessStateLabel(access.state)}
              </Badge>
            </Head>
            {accessMeta(access) && <Meta>{accessMeta(access)}</Meta>}
            {access.accessUrl && access.state === "issued" && (
              <CopyField label="Ссылка Telegram" value={access.accessUrl} />
            )}
          </AccessRow>
        ))}

        {entry.pageUrl && (
          <CopyField label="Ссылка на страницу проверки" value={entry.pageUrl} />
        )}

        {!isLegacy && !entry.revoked && (
          <Actions>
            <AdminButton
              size="sm"
              icon={<Mail aria-hidden />}
              disabled={busy}
              onClick={onResend}
            >
              Отправить письмо ещё раз
            </AdminButton>
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
  const shown = useShownRows(entries);

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
              <FormGrid>
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
              </FormGrid>
            </Group>

            {scope === "group" && (
              <Group>
                <legend>Что</legend>
                <ChoiceField>
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
                  <FieldNote>
                    {form.product === "plus"
                      ? "Чат потока и Inspiration Hub на всё время потока."
                      : "Чат потока."}
                  </FieldNote>
                </ChoiceField>
              </Group>
            )}

            <Group>
              <legend>Как</legend>
              <ChoiceField>
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
                <FieldNote>{KIND_HINTS[scope][form.kind]}</FieldNote>
              </ChoiceField>
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
            {shown.rows.map((entry) => (
              <Entry
                key={entry.purchaseId}
                busy={busyId === entry.purchaseId}
                entry={entry}
                onResend={() => void resend(entry)}
                onRevoke={() => {
                  setRevokeError("");
                  setRevoking(entry);
                }}
              />
            ))}
            {shown.toggle}
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
