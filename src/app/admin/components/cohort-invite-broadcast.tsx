import {
  Ban,
  Check,
  CircleQuestionMark,
  Clock,
  ListChecks,
  MailCheck,
  MailX,
  RefreshCw,
  Send,
  TestTube,
  X,
} from "lucide-react";
import { Fragment, useState } from "react";

import type {
  CohortInviteAddressStatus,
  CohortInviteLinks,
} from "@/lib/cohort-invite-broadcast";

import type {
  CohortInviteTestInput,
  useCohortInviteAdmin,
} from "../hooks/use-cohort-invite-admin";
import {
  buildQuotaCells,
  formatDayTime,
  getBatchBoundary,
  letters,
  plural,
  readBatch,
  showsFirstSteps,
} from "../lib/cohort-invite-view";
import {
  AudienceActions,
  AudienceFacts,
  AudienceTable,
  BatchBar,
  BatchDivider,
  CellBadges,
  FirstSteps,
  QuotaMeter,
  RULES_ANCHOR,
  RulesPopover,
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
  Disclosure,
  EmptyState,
  FieldNote,
  IconButton,
  Panel,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { CellPrimary, CellSecondary, TableScroller } from "../ui/table";
import { SHOWN_ROWS, summarizeAddresses, useShownRows } from "./shown-rows";

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
  ready_new: { label: "Отправим · покупок не было, письмо на EN", tone: "info" },
};

const isReady = (status: CohortInviteAddressStatus) =>
  status === "ready" || status === "ready_new";

const LINKS: Record<CohortInviteLinks["kind"], { note: string; title: string }> = {
  pages: { note: "Цены обычные", title: "На страницы группы и Hub" },
  renewal: { note: "Участник прошлого потока", title: "На оплату продления по спеццене" },
};

const LINKS_COLUMN = "Куда ведут кнопки письма";

const LinksCell = ({
  hubSpecialPrice = false,
  links,
}: {
  hubSpecialPrice?: boolean;
  links: CohortInviteLinks["kind"];
}) => (
  <span>
    <CellPrimary>{LINKS[links].title}</CellPrimary>
    <CellSecondary>
      {LINKS[links].note}
      {hubSpecialPrice ? " · Hub тоже по спеццене" : ""}
    </CellSecondary>
  </span>
);

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
  const recipients = snapshot?.cohort ? snapshot.recipients : [];
  const batch = snapshot?.cohort
    ? readBatch({ input: batchInput, snapshot })
    : { max: 0, size: 0, valid: false };
  const boundary = getBatchBoundary({ ...batch, total: recipients.length });
  // The line after this batch stays in view, whatever the batch size.
  const nextRecipients = useShownRows(
    recipients,
    Math.max(SHOWN_ROWS, (boundary ?? 0) + 3),
  );
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
        <StatusLine status={invite.loadStatus} />
        {invite.loadStatus ? (
          <EmptyState
            icon={<MailX aria-hidden />}
            title="Список не загрузился"
            text="Нажми «Обновить»; если снова не выйдет — напиши разработчику."
          />
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
  const busy = invite.isSending || invite.isLoading;
  const readyFromList = (invite.listChecks ?? []).filter((check) =>
    isReady(check.status),
  );
  const listFits = readyFromList.length <= quota.remainingToday;
  const isLocked = invite.isSending || Boolean(invite.updatingEmail);
  const isDone = counts.remaining === 0;
  const dayIsOver = quota.remainingToday === 0;
  const meter = buildQuotaCells({ batch: batch.valid ? batch.size : 0, quota });

  const confirm = async () => {
    try {
      if (confirming === "batch") {
        await invite.sendBatch(batch.size);
        setBatchInput("");
      } else if (confirming === "list") {
        await invite.sendList(listInput, readyFromList.length);
      }
    } finally {
      setConfirming(null);
    }
  };

  const rules = (
    <>
      <IconButton
        type="button"
        aria-label="Как идёт рассылка"
        title="Как идёт рассылка"
        popoverTarget="cohort-invite-rules"
        style={{ anchorName: RULES_ANCHOR }}
      >
        <CircleQuestionMark aria-hidden />
      </IconButton>
      <RulesPopover
        id="cohort-invite-rules"
        popover="auto"
        role="dialog"
        aria-labelledby="cohort-invite-rules-title"
      >
        <header>
          <h3 id="cohort-invite-rules-title">Как идёт рассылка</h3>
          <IconButton
            type="button"
            aria-label="Закрыть"
            popoverTarget="cohort-invite-rules"
            popoverTargetAction="hide"
          >
            <X aria-hidden />
          </IconButton>
        </header>
        <ol>
          <li>
            Партия берёт первых по списку. Сначала идут участники прошлого потока: их
            спеццены кончаются раньше.
          </li>
          <li>
            Перед каждой партией список собирается заново: кто успел оплатить поток или
            Hub, отписался или исключён, письма не получит.
          </li>
          <li>
            {`Resend пропускает ${quota.dailyLimit} писем в сутки, ${quota.reserve} из них оставлены для писем о покупках и тестов. Письмо выходит из счёта через 24 часа после отправки.`}
          </li>
          <li>
            Дважды письмо не уйдёт: кому оно уже ушло, тот пропускается — и в партии, и
            при отправке по списку адресов.
          </li>
          <li>
            Если письмо не дошло, адрес остаётся в списке и уйдёт в одной из следующих
            партий.
          </li>
        </ol>
      </RulesPopover>
    </>
  );

  return (
    <Stack $gap={16}>
      <Panel
        title={`Приглашение в поток: ${snapshot.cohort.title}`}
        description={`Старт ${formatDay(snapshot.cohort.startsAt)}, ${snapshot.cohort.durationWeeks} нед. Письмо получают все, кто что-либо покупал, кроме уже оплативших этот поток или отдельный Hub.`}
        actions={refresh}
      >
        <Stack $gap={14}>
          <AudienceFacts>
            <Fact label="Осталось" value={counts.remaining} />
            <Fact label="Отправлено" value={counts.sent} />
            <Fact label="Уже купили" value={counts.alreadyBought} />
            <Fact label="Отписались / исключены" value={counts.excluded} />
            {counts.failed > 0 && (
              <Fact label="Не дошли, отправим снова" value={counts.failed} />
            )}
          </AudienceFacts>
          <StatusLine status={invite.loadStatus} />
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
        title="Следующая партия"
        titleAction={rules}
        description={
          isDone
            ? undefined
            : "Письма уходят первым по списку ниже. Перед отправкой список пересчитывается."
        }
      >
        <Stack $gap={14}>
          {isDone ? (
            <EmptyState
              icon={<MailCheck aria-hidden />}
              title="Все получили письмо"
              text={`Отправлено: ${letters(counts.sent)}. Получателей в этой рассылке не осталось.`}
            />
          ) : (
            <>
              {showsFirstSteps(counts) && (
                <FirstSteps aria-label="Как отправлять">
                  <li>
                    <strong>Проверь список</strong>
                    <span>
                      Письмо получат строки до черты. Лишних убери кнопкой «Не
                      отправлять».
                    </span>
                  </li>
                  <li>
                    <strong>Отправь партию</strong>
                    <span>
                      Список пересчитается: кто успел оплатить, письма не получит.
                    </span>
                  </li>
                  <li>
                    <strong>Продолжи завтра</strong>
                    <span>
                      Сколько можно сегодня — на полосе ниже. Остальным — на другой день.
                    </span>
                  </li>
                </FirstSteps>
              )}

              <QuotaMeter>
                <header>
                  <strong>
                    {dayIsOver
                      ? "На сегодня всё"
                      : `Сегодня можно ещё ${letters(quota.remainingToday)}`}
                  </strong>
                  <span>{`Лимит Resend — ${quota.dailyLimit} писем в сутки`}</span>
                </header>
                <div
                  data-cells
                  role="img"
                  aria-label={`Из ${quota.dailyLimit}: за 24 часа ушло ${meter.sent}, в эту партию ${meter.batch}, ещё свободно ${meter.free}, запас ${meter.reserve}.`}
                >
                  {meter.cells.map((cell, index) => (
                    <span data-cell={cell} key={index} />
                  ))}
                </div>
                <ul>
                  <li>
                    <span data-swatch="sent" />
                    За 24 часа ушло <b>{meter.sent}</b>
                  </li>
                  {!dayIsOver && (
                    <li>
                      <span data-swatch="batch" />
                      Эта партия <b>{meter.batch}</b>
                    </li>
                  )}
                  {meter.free > 0 && (
                    <li>
                      <span data-swatch="free" />
                      Ещё свободно сегодня <b>{meter.free}</b>
                    </li>
                  )}
                  <li>
                    <span data-swatch="reserve" />
                    Запас для писем о покупках и тестов <b>{meter.reserve}</b>
                  </li>
                </ul>
              </QuotaMeter>

              {dayIsOver ? (
                <Callout tone="info" icon={<Clock aria-hidden />} title="Продолжи позже">
                  {quota.nextBatch
                    ? `Партию из ${letters(quota.nextBatch.size)} можно будет отправить после ${formatDayTime(quota.nextBatch.at)}: тогда из суточного счёта выйдут письма, ушедшие сутки назад.`
                    : "Дневной остаток израсходован — продолжи завтра."}
                </Callout>
              ) : (
                <BatchBar>
                  <Field label="Писем в партии" htmlFor="cohort-invite-batch">
                    <Input
                      id="cohort-invite-batch"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={Math.max(1, batch.max)}
                      value={
                        batchInput === "" ? String(Math.max(batch.size, 0)) : batchInput
                      }
                      onChange={(event) => setBatchInput(event.target.value)}
                      disabled={busy}
                    />
                  </Field>
                  <FormActions>
                    <AdminButton
                      variant="primary"
                      icon={<Send aria-hidden />}
                      loading={invite.isSending && confirming !== "list"}
                      disabled={sendingBlocked || !batch.valid || busy}
                      onClick={() => setConfirming("batch")}
                    >
                      {batch.valid
                        ? `Отправить ${letters(batch.size)}`
                        : "Отправить партию"}
                    </AdminButton>
                  </FormActions>
                </BatchBar>
              )}
              {!dayIsOver && (
                <FieldNote>
                  {counts.remaining < quota.remainingToday
                    ? `От 1 до ${batch.max}: столько осталось в списке.`
                    : `От 1 до ${batch.max}: больше сегодня не уйдёт.`}
                </FieldNote>
              )}
            </>
          )}

          <StatusLine status={invite.batchStatus} />
          <StatusLine status={invite.tableStatus} />

          {!isDone && (
            <TableScroller>
              <AudienceTable aria-label="Следующие адресаты приглашения">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Язык</th>
                    <th>{LINKS_COLUMN}</th>
                    <th aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {nextRecipients.rows.map((recipient, index) => {
                    const isUpdating = invite.updatingEmail === recipient.email;
                    const isConfirming = confirmingGlobal === recipient.email;

                    return (
                      <Fragment key={recipient.email}>
                        {index === boundary && (
                          <BatchDivider>
                            <td colSpan={4}>
                              <span>{`Выше — эта партия, ниже — следующие`}</span>
                            </td>
                          </BatchDivider>
                        )}
                        <tr>
                          <td data-label="Имя">
                            <span>
                              <CellPrimary>
                                {recipient.fullName || "Без имени"}
                              </CellPrimary>
                              <CellSecondary>{recipient.email}</CellSecondary>
                              {recipient.retry && (
                                <CellBadges>
                                  <Badge $tone="danger">Прошлая попытка не дошла</Badge>
                                </CellBadges>
                              )}
                            </span>
                          </td>
                          <td data-label="Язык">{recipient.locale.toUpperCase()}</td>
                          <td data-label="Кнопки ведут">
                            <LinksCell
                              hubSpecialPrice={recipient.hubSpecialPrice}
                              links={recipient.links}
                            />
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
                      </Fragment>
                    );
                  })}
                </tbody>
              </AudienceTable>
            </TableScroller>
          )}
          {!isDone && nextRecipients.toggle}
        </Stack>
      </Panel>

      <Panel title="Дополнительно">
        <div>
          <Disclosure
            title="Тестовое письмо"
            hint="Необязательно · одно письмо себе, вне рассылки"
          >
            <Stack $gap={14}>
              <FieldNote>
                Счётчики не меняет, ссылка отписки в тесте не действует.
              </FieldNote>
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
                  label={LINKS_COLUMN}
                  htmlFor="cohort-invite-test-links"
                  hint="Участникам прошлого потока кнопки открывают оплату продления по спеццене, остальным — страницы группы и Hub."
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
                    <option value="pages">{LINKS.pages.title}</option>
                    <option value="renewal">{LINKS.renewal.title}</option>
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
          </Disclosure>

          <Disclosure
            title="Отправить отдельным адресам"
            hint="Вне очереди, до 50 адресов за раз"
          >
            <Stack $gap={14}>
              <Field
                label="Адреса"
                htmlFor="cohort-invite-list"
                hint="Через запятую, пробел или с новой строки. Сначала проверка: кому письмо уже ушло, тот будет отмечен и пропущен."
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
                  <TableScroller>
                    <AudienceTable aria-label="Проверка адресов из списка">
                      <thead>
                        <tr>
                          <th>Адрес</th>
                          <th>Язык</th>
                          <th>{LINKS_COLUMN}</th>
                          <th>Что будет</th>
                        </tr>
                      </thead>
                      <tbody>
                        {checkedAddresses.rows.map((check) => (
                          <tr key={check.email}>
                            <td data-label="Адрес">{check.email}</td>
                            <td data-label="Язык">
                              {check.locale?.toUpperCase() ?? "—"}
                            </td>
                            <td data-label="Кнопки ведут">
                              {check.links ? <LinksCell links={check.links} /> : "—"}
                            </td>
                            <td data-label="Что будет">
                              <Badge $tone={ADDRESS_STATUS[check.status].tone}>
                                {ADDRESS_STATUS[check.status].label}
                              </Badge>
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
          </Disclosure>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming === "list"
            ? `Отправить ${letters(readyFromList.length)} по списку?`
            : `Отправить ${letters(batch.size)}?`
        }
        description={
          confirming === "list"
            ? `Получат: ${summarizeAddresses(readyFromList.map((check) => check.email))}. Перед отправкой список проверится ещё раз — кто успел получить письмо или оплатить, будет пропущен.`
            : `Приглашение в ${snapshot.cohort.title} уйдёт первым ${batch.size} ${plural(batch.size, "адресату", "адресатам", "адресатам")} из списка ниже. Перед отправкой список пересчитается: кто успел оплатить, письма не получит. Останется на сегодня: ${Math.max(0, quota.remainingToday - batch.size)}.`
        }
        confirmLabel="Отправить"
        busy={invite.isSending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => void confirm()}
      />
    </Stack>
  );
};
