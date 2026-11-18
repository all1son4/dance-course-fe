import {
  Ban,
  Check,
  ListChecks,
  MailCheck,
  MailX,
  RefreshCw,
  Send,
  TestTube,
  X,
} from "lucide-react";
import { useState } from "react";

import type { CohortInviteAddressStatus } from "@/lib/cohort-invite-broadcast";

import type {
  CohortInviteTestInput,
  useCohortInviteAdmin,
} from "../hooks/use-cohort-invite-admin";
import {
  AudienceActions,
  AudienceFacts,
  AudienceTable,
} from "../styles/broadcast.styles";
import type { AdminTone } from "../styles/tokens.styles";
import { ConfirmDialog } from "../ui/feedback";
import {
  Fact,
  Field,
  FormActions,
  FormGrid,
  Input,
  Select,
  StatusLine,
  Textarea,
} from "../ui/forms";
import {
  AdminButton,
  Badge,
  Callout,
  EmptyState,
  FieldNote,
  Panel,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { CellPrimary, CellSecondary, TableScroller } from "../ui/table";
import { summarizeAddresses, useShownRows } from "./shown-rows";

const plural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const letters = (count: number) =>
  `${count} ${plural(count, "письмо", "письма", "писем")}`;

const formatDay = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));

const ADDRESS_STATUS: Record<
  CohortInviteAddressStatus,
  { label: string; tone: AdminTone }
> = {
  already_sent: { label: "Письмо уже ушло — пропустим", tone: "neutral" },
  bought: { label: "Поток или Hub уже оплачен — пропустим", tone: "neutral" },
  excluded: { label: "Отписка или исключение — пропустим", tone: "warning" },
  in_progress: { label: "Отправляется сейчас — пропустим", tone: "neutral" },
  invalid: { label: "Не похоже на адрес — пропустим", tone: "danger" },
  ready: { label: "Отправим", tone: "success" },
  ready_new: { label: "Отправим · покупок не было, EN и страницы", tone: "info" },
};

const isReady = (status: CohortInviteAddressStatus) =>
  status === "ready" || status === "ready_new";

/** «Приглашение в поток»: one campaign of «Рассылки». */
export const CohortInviteBroadcast = ({
  invite,
}: {
  invite: ReturnType<typeof useCohortInviteAdmin>;
}) => {
  const [batchInput, setBatchInput] = useState("");
  const [confirming, setConfirming] = useState<"batch" | "list" | null>(null);
  const [confirmingGlobal, setConfirmingGlobal] = useState("");
  const [listInput, setListInput] = useState("");
  const [test, setTest] = useState<CohortInviteTestInput>({
    email: "",
    links: "pages",
    locale: "en",
  });
  const snapshot = invite.snapshot;
  const nextRecipients = useShownRows(snapshot?.cohort ? snapshot.recipients : []);
  const checkedAddresses = useShownRows(invite.listChecks ?? []);

  const refresh = (
    <AdminButton
      size="sm"
      icon={<RefreshCw aria-hidden />}
      loading={invite.isLoading}
      disabled={invite.isSending}
      onClick={() => void invite.load()}
    >
      Обновить
    </AdminButton>
  );

  if (!snapshot) {
    return (
      <Panel title="Приглашение в поток" actions={refresh}>
        {invite.loadStatus ? (
          <StatusLine status={invite.loadStatus} />
        ) : (
          <Skeleton $height={120} />
        )}
      </Panel>
    );
  }

  if (!snapshot.cohort) {
    return (
      <Panel title="Приглашение в поток" actions={refresh}>
        <EmptyState
          icon={<MailCheck aria-hidden />}
          title="Нет потока в продаже"
          text="Когда в «Онлайн-группе» откроются продажи нового потока, здесь появится его рассылка с нулевыми счётчиками."
        />
      </Panel>
    );
  }

  const { counts, quota } = snapshot;
  const sendingBlocked = !snapshot.salesOpen || !snapshot.unsubscribeConfigured;
  const maxBatch = Math.min(quota.remainingToday, counts.remaining);
  const batchSize =
    batchInput === ""
      ? Math.min(snapshot.defaultBatchSize, maxBatch)
      : Number(batchInput);
  const batchValid =
    Number.isInteger(batchSize) && batchSize >= 1 && batchSize <= maxBatch;
  const busy = invite.isSending || invite.isLoading;
  const readyFromList = (invite.listChecks ?? []).filter((check) =>
    isReady(check.status),
  );
  const skippedFromList = (invite.listChecks ?? []).length - readyFromList.length;
  const listFits = readyFromList.length <= quota.remainingToday;
  const isLocked = invite.isSending || Boolean(invite.updatingEmail);

  const batchLabel =
    counts.remaining === 0
      ? "Получателей не осталось"
      : quota.remainingToday === 0
        ? "На сегодня лимит исчерпан"
        : batchValid
          ? `Отправить партию: ${letters(batchSize)}`
          : "Отправить партию";

  const confirm = async () => {
    try {
      if (confirming === "batch") {
        await invite.sendBatch(batchSize);
        setBatchInput("");
      } else if (confirming === "list") {
        await invite.sendList(listInput, readyFromList.length);
      }
    } finally {
      setConfirming(null);
    }
  };

  return (
    <Stack $gap={16}>
      <Panel
        title={`Приглашение в поток: ${snapshot.cohort.title}`}
        description={`Старт ${formatDay(snapshot.cohort.startsAt)}, ${snapshot.cohort.durationWeeks} нед. Письмо получают все, кто что-либо покупал, кроме уже оплативших этот поток или отдельный Hub.`}
        actions={refresh}
      >
        <Stack $gap={14}>
          <AudienceFacts>
            <Fact label="Получателей осталось" value={counts.remaining} />
            <Fact label="Отправлено" value={counts.sent} />
            <Fact label="С ошибкой (повторим)" value={counts.failed} />
            <Fact label="Уже купили" value={counts.alreadyBought} />
            <Fact label="Отписались / исключены" value={counts.excluded} />
            <Fact
              label="Писем за 24 ч / можно ещё сегодня"
              value={`${quota.sentLast24h} / ${quota.remainingToday}`}
            />
          </AudienceFacts>
          <FieldNote>
            Как отправлять: 1) отправь тест себе и проверь письмо; 2) отправляй партиями —
            перед каждой список пересчитывается, кто успел оплатить, письма не получит; 3)
            когда остаток на сегодня кончится, продолжи завтра. Повторная отправка никому
            не пришлёт письмо дважды.
          </FieldNote>
          {invite.loadStatus && <StatusLine status={invite.loadStatus} />}
          {!snapshot.salesOpen && (
            <Callout tone="warning">
              Продажи онлайн-группы закрыты — отправка недоступна.
            </Callout>
          )}
          {!snapshot.unsubscribeConfigured && (
            <Callout tone="danger">
              На сервере нет ACCESS_LINK_SECRET: без ссылки отписки отправка недоступна.
            </Callout>
          )}
          {(!snapshot.renewal.standard || !snapshot.renewal.plus) && (
            <Callout tone="info">
              Нет активной кампании продления для{" "}
              {[
                !snapshot.renewal.standard && "Standard",
                !snapshot.renewal.plus && "Plus",
              ]
                .filter(Boolean)
                .join(" и ")}{" "}
              — участники прошлого потока получат ссылку на страницу группы.
            </Callout>
          )}
          {!snapshot.hubOnSale && (
            <Callout tone="info">
              Продажи Hub закрыты — блока «только Hub» в письме не будет.
            </Callout>
          )}
        </Stack>
      </Panel>

      <Panel
        title="Шаг 1. Тестовое письмо"
        description="Настоящее письмо на один адрес, вне рассылки: счётчики не меняет, ссылка отписки в нём не действует."
      >
        <Stack $gap={14}>
          <FormGrid>
            <Field label="Куда прислать" htmlFor="cohort-invite-test-email">
              <Input
                id="cohort-invite-test-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={test.email}
                onChange={(event) => setTest({ ...test, email: event.target.value })}
              />
            </Field>
            <Field label="Язык" htmlFor="cohort-invite-test-locale">
              <Select
                id="cohort-invite-test-locale"
                value={test.locale}
                onChange={(event) =>
                  setTest({
                    ...test,
                    locale: event.target.value as CohortInviteTestInput["locale"],
                  })
                }
              >
                <option value="en">EN — английский</option>
                <option value="pl">PL — польский</option>
                <option value="ru">RU — русский</option>
              </Select>
            </Field>
            <Field
              label="Ссылки в письме"
              htmlFor="cohort-invite-test-links"
              hint="Участникам прошлого потока уходят ссылки продления по спеццене."
            >
              <Select
                id="cohort-invite-test-links"
                value={test.links}
                onChange={(event) =>
                  setTest({
                    ...test,
                    links: event.target.value as CohortInviteTestInput["links"],
                  })
                }
              >
                <option value="pages">Как новому: страницы продуктов</option>
                <option value="renewal">Как участнику прошлого потока</option>
              </Select>
            </Field>
          </FormGrid>
          <FormActions>
            <AdminButton
              icon={<TestTube aria-hidden />}
              loading={invite.isTesting}
              disabled={!test.email.trim() || invite.isSending}
              onClick={() => void invite.sendTest(test)}
            >
              Отправить тест
            </AdminButton>
          </FormActions>
          <StatusLine status={invite.testStatus} />
        </Stack>
      </Panel>

      <Panel
        title="Шаг 2. Отправка партиями"
        description="Берёт первых по списку ниже. Перед отправкой сервер ещё раз пересчитывает список и остаток на сегодня."
      >
        <Stack $gap={14}>
          <FormGrid>
            <Field
              label="Сколько писем в партии"
              htmlFor="cohort-invite-batch"
              hint={
                maxBatch === 0
                  ? counts.remaining === 0
                    ? "Получателей не осталось."
                    : "На сегодня остаток исчерпан — продолжи завтра."
                  : `От 1 до ${maxBatch}. Лимит Resend — ${quota.dailyLimit} в сутки, ${quota.reserve} из них оставлены для писем о покупках.`
              }
            >
              <Input
                id="cohort-invite-batch"
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(1, maxBatch)}
                value={batchInput === "" ? String(Math.max(batchSize, 0)) : batchInput}
                onChange={(event) => setBatchInput(event.target.value)}
                disabled={maxBatch === 0 || busy}
              />
            </Field>
          </FormGrid>
          <FormActions>
            <AdminButton
              variant="primary"
              icon={<Send aria-hidden />}
              loading={invite.isSending && confirming !== "list"}
              disabled={sendingBlocked || !batchValid || busy}
              onClick={() => setConfirming("batch")}
            >
              {batchLabel}
            </AdminButton>
          </FormActions>
          <StatusLine status={invite.batchStatus} />
        </Stack>
      </Panel>

      <Panel
        title="Отправка по списку адресов"
        description="Для отдельных людей вне очереди. Сначала проверка: кому эта рассылка уже ушла, тот будет отмечен и пропущен."
      >
        <Stack $gap={14}>
          <Field
            label="Адреса"
            htmlFor="cohort-invite-list"
            hint="Через запятую, пробел или с новой строки, до 50 за раз."
          >
            <Textarea
              id="cohort-invite-list"
              value={listInput}
              placeholder="anna@example.com, maria@example.com"
              onChange={(event) => {
                setListInput(event.target.value);
                invite.clearListChecks();
              }}
            />
          </Field>
          <FormActions>
            <AdminButton
              icon={<ListChecks aria-hidden />}
              loading={invite.isChecking}
              disabled={!listInput.trim() || busy}
              onClick={() => void invite.checkList(listInput)}
            >
              Проверить
            </AdminButton>
            {invite.listChecks && readyFromList.length > 0 && (
              <AdminButton
                variant="primary"
                icon={<Send aria-hidden />}
                loading={invite.isSending && confirming === "list"}
                disabled={sendingBlocked || !listFits || busy}
                onClick={() => setConfirming("list")}
              >
                {`Отправить тем, кто ещё не получал: ${letters(readyFromList.length)}`}
              </AdminButton>
            )}
          </FormActions>
          {invite.listChecks && (
            <>
              {readyFromList.length === 0 ? (
                <Callout tone="info">
                  Отправлять некому: все адреса из списка уже получили письмо или
                  пропускаются.
                </Callout>
              ) : !listFits ? (
                <Callout tone="warning">
                  {`Сегодня можно ещё ${letters(quota.remainingToday)}, а в списке ${readyFromList.length}. Убери часть адресов или продолжи завтра.`}
                </Callout>
              ) : (
                skippedFromList > 0 && (
                  <Callout tone="info">
                    {`Отправим ${letters(readyFromList.length)}, пропустим ${skippedFromList} — причина у каждого адреса ниже.`}
                  </Callout>
                )
              )}
              <TableScroller>
                <AudienceTable aria-label="Проверка адресов из списка">
                  <thead>
                    <tr>
                      <th>Адрес</th>
                      <th>Язык</th>
                      <th>Что будет</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checkedAddresses.rows.map((check) => (
                      <tr key={check.email}>
                        <td data-label="Адрес">{check.email}</td>
                        <td data-label="Язык">{check.locale?.toUpperCase() ?? "—"}</td>
                        <td data-label="Что будет">
                          <Badge $tone={ADDRESS_STATUS[check.status].tone}>
                            {ADDRESS_STATUS[check.status].label}
                          </Badge>
                          {check.links === "renewal" && (
                            <>
                              {" "}
                              <Badge $tone="success">Продление</Badge>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </AudienceTable>
              </TableScroller>
              {checkedAddresses.toggle}
            </>
          )}
          <StatusLine status={invite.listStatus} />
        </Stack>
      </Panel>

      <Panel
        title="Следующие адресаты"
        description="В этом порядке берутся в партию: сначала участники прошлого потока, у них спеццены кончаются раньше."
      >
        <Stack $gap={14}>
          <StatusLine status={invite.tableStatus} />
          {snapshot.recipients.length === 0 ? (
            <EmptyState
              icon={<MailCheck aria-hidden />}
              title="Всё отправлено"
              text="Получателей в этой рассылке не осталось."
            />
          ) : (
            <TableScroller>
              <AudienceTable aria-label="Следующие адресаты приглашения">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Язык</th>
                    <th>Ссылки в письме</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {nextRecipients.rows.map((recipient, index) => {
                    const isUpdating = invite.updatingEmail === recipient.email;
                    const isConfirming = confirmingGlobal === recipient.email;
                    const inNextBatch = batchValid && index < batchSize;

                    return (
                      <tr key={recipient.email}>
                        <td data-label="Имя">
                          <span>
                            <CellPrimary>{recipient.fullName || "Без имени"}</CellPrimary>
                            <CellSecondary>{recipient.email}</CellSecondary>
                          </span>
                        </td>
                        <td data-label="Язык">{recipient.locale.toUpperCase()}</td>
                        <td data-label="Ссылки в письме">
                          <Badge
                            $tone={recipient.links === "renewal" ? "success" : "neutral"}
                          >
                            {recipient.links === "renewal"
                              ? "Продление по спеццене"
                              : "Страницы продуктов"}
                            {recipient.hubSpecialPrice ? " · Hub по спеццене" : ""}
                          </Badge>
                          {recipient.retry && (
                            <>
                              {" "}
                              <Badge $tone="danger">Прошлая попытка не дошла</Badge>
                            </>
                          )}
                          {inNextBatch && (
                            <>
                              {" "}
                              <Badge $tone="info">В следующей партии</Badge>
                            </>
                          )}
                        </td>
                        <td data-label="Действия" data-actions>
                          <AudienceActions>
                            {isConfirming ? (
                              <>
                                <AdminButton
                                  size="sm"
                                  variant="danger"
                                  icon={<Check aria-hidden />}
                                  loading={isUpdating}
                                  disabled={isLocked}
                                  onClick={() =>
                                    void invite
                                      .exclude(recipient.email, "global")
                                      .then(() => setConfirmingGlobal(""))
                                  }
                                >
                                  Да, исключить везде
                                </AdminButton>
                                <AdminButton
                                  size="sm"
                                  variant="ghost"
                                  icon={<X aria-hidden />}
                                  disabled={Boolean(invite.updatingEmail)}
                                  onClick={() => setConfirmingGlobal("")}
                                >
                                  Отмена
                                </AdminButton>
                              </>
                            ) : (
                              <>
                                <AdminButton
                                  size="sm"
                                  icon={<MailX aria-hidden />}
                                  loading={isUpdating}
                                  disabled={isLocked}
                                  onClick={() =>
                                    void invite.exclude(recipient.email, "campaign")
                                  }
                                  title="Не отправлять письмо в этой рассылке"
                                >
                                  Не отправлять
                                </AdminButton>
                                <AdminButton
                                  size="sm"
                                  variant="ghost"
                                  icon={<Ban aria-hidden />}
                                  disabled={isLocked}
                                  onClick={() => setConfirmingGlobal(recipient.email)}
                                  title="Не включать этот адрес ни в одну рассылку"
                                >
                                  Исключить везде
                                </AdminButton>
                              </>
                            )}
                          </AudienceActions>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </AudienceTable>
            </TableScroller>
          )}
          {nextRecipients.toggle}
        </Stack>
      </Panel>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === "list"
            ? `Отправить ${letters(readyFromList.length)} по списку?`
            : `Отправить ${letters(batchSize)}?`
        }
        description={
          confirming === "list"
            ? `Получат: ${summarizeAddresses(readyFromList.map((check) => check.email))}. Перед отправкой список проверится ещё раз — кто успел получить письмо или оплатить, будет пропущен.`
            : `Приглашение в ${snapshot.cohort.title} уйдёт первым ${batchSize} ${plural(batchSize, "адресату", "адресатам", "адресатам")} из списка ниже. Перед отправкой список пересчитается: кто успел оплатить, письма не получит. Останется на сегодня: ${Math.max(0, quota.remainingToday - batchSize)}.`
        }
        confirmLabel="Отправить"
        busy={invite.isSending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void confirm()}
      />
    </Stack>
  );
};
