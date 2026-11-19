import { CircleAlert, Lock, Send } from "lucide-react";
import { useState } from "react";
import styled, { css } from "styled-components";

import type { CohortOverview } from "@/lib/online-group/cohort-admin";

import type { CloseCohortInput, CloseCohortResult } from "../hooks/use-cohorts-admin";
import type { AdminTone } from "../styles/tokens.styles";
import { CopyField } from "../ui/copy";
import { ConfirmDialog, SheetDialog, useToast } from "../ui/feedback";
import { Input, Switch } from "../ui/forms";
import {
  AdminButton,
  Badge,
  Callout,
  EmptyState,
  FieldNote,
  focusVisible,
  Muted,
  Panel,
  Row,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { BotRightsCheck } from "./bot-rights-check";
import {
  CohortTransitionBanner,
  CohortTransitionGuide,
  initialNextCohortInput,
  NextCohortForm,
  type NextCohortInput,
  type RenewalLinkKind,
} from "./cohort-transition-guide";
import { TelegramPostPreview } from "./telegram-post-preview";

const formatDate = (iso: string, withTime = false) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));

const formatWarsawDay = (day: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));

const weeksWord = (weeks: number) => {
  const lastTwo = weeks % 100;
  const last = weeks % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "недель";
  if (last === 1) return "неделя";
  return last >= 2 && last <= 4 ? "недели" : "недель";
};

const DurationEditor = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  ${Input} {
    width: 88px;
  }

  /* Phones: the label above, the field and its button together under it. */
  @container admin-content (max-width: 520px) {
    label {
      flex-basis: 100%;
    }
  }
`;

const cohortStatus = (
  cohort: CohortOverview,
  cohorts: CohortOverview[],
  now: number,
): { label: string; tone: AdminTone } => {
  if (cohort.closedAt) {
    // A closure can be set ahead (the launch transfer does): say when, not "closed".
    return Date.parse(cohort.closedAt) > now
      ? { label: `Закроется ${formatDate(cohort.closedAt)}`, tone: "warning" }
      : { label: "Закрыт", tone: "neutral" };
  }
  const started = Date.parse(cohort.startsAt) <= now;
  if (cohort.salesEnabled)
    return { label: started ? "Идёт · продаётся" : "Продаётся", tone: "success" };
  const previous = cohorts.find((candidate) => candidate.id === cohort.previousCohortId);
  if (previous && !previous.closedAt)
    return { label: "Ждёт закрытия предыдущего", tone: "warning" };
  return started
    ? { label: "Идёт", tone: "info" }
    : { label: "Запланирован", tone: "neutral" };
};

const List = styled.div`
  display: grid;
  gap: 12px;
`;

const CohortCard = styled.article<{ $current: boolean; $closed: boolean }>`
  --fact-fill: ${({ $closed }) => ($closed ? "var(--a-surface)" : "var(--a-surface-sunken)")};
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  background: ${({ $closed }) => ($closed ? "var(--a-surface-sunken)" : "var(--a-surface)")};
  ${({ $current }) =>
    $current &&
    css`
      border-color: var(--a-accent-ring);
      box-shadow: 0 0 0 1px var(--a-accent-ring);
    `}

  dl {
    display: grid;
    /* One label width for every card, so the values line up down the list. */
    grid-template-columns: minmax(0, 11em) minmax(0, 1fr);
    gap: 6px 16px;
    margin: 0;
    font-size: var(--a-text-sm);
  }

  dt {
    color: var(--a-ink-2);
  }

  dd {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
`;

const CardHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;

  h3 {
    margin: 0;
    font-size: var(--a-text-md);
    font-weight: 700;
  }

  > button {
    margin-left: auto;
  }

  @media (max-width: 640px) {
    > button {
      width: 100%;
      margin-left: 0;
    }
  }
`;

const CardBody = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
  gap: 16px 28px;
  align-items: start;

  /* Below this the left column gets too narrow for the figures and the editor. */
  @container admin-content (max-width: 980px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Facts = styled.div<{ $rows?: boolean }>`
  display: grid;
  /* Four figures in two even rows: participants, paid / invited, Plus, continuations. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-width: 420px;

  div {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--fact-fill, var(--a-surface-sunken));
  }

  small {
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
    line-height: 1.3;
  }

  b {
    font-size: var(--a-text-lg);
    line-height: 1.2;
  }

  /* Phones: one tidy row per figure instead of squeezed tiles. */
  @container admin-content (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
    max-width: none;

    div {
      flex-direction: row;
      align-items: center;
      gap: 12px;
    }

    small {
      font-size: var(--a-text-sm);
    }

    b {
      font-size: var(--a-text-md);
      text-align: right;
    }
  }

  /* The closure window: rows always, its values are phrases, not numbers. */
  ${({ $rows }) =>
    $rows &&
    css`
      grid-template-columns: minmax(0, 1fr);
      max-width: none;

      div {
        flex-direction: row;
        align-items: center;
        gap: 12px;
      }

      small {
        font-size: var(--a-text-sm);
      }

      b {
        font-size: var(--a-text-md);
        text-align: right;
      }
    `}
`;

const CardFooter = styled.div`
  padding-top: 12px;
  border-top: 1px solid var(--a-border);
`;

const SwitchSetting = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 560px;

  > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  b {
    font-size: var(--a-text-sm);
    font-weight: 600;
  }

  small {
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
    line-height: 1.4;
  }
`;

const SectionCaption = styled.p`
  margin: 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
`;

/** Current cohort first, then what comes next, then history. */
const orderCohorts = (cohorts: CohortOverview[], now: number) => {
  const rank = (cohort: CohortOverview) =>
    cohort.closedAt ? 2 : Date.parse(cohort.startsAt) <= now ? 0 : 1;
  return [...cohorts].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) return byRank;
    const byStart = Date.parse(left.startsAt) - Date.parse(right.startsAt);
    return rank(left) === 2 ? -byStart : byStart;
  });
};

const Check = styled.label`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--a-border);
  border-radius: 10px;
  cursor: pointer;
  font-size: var(--a-text);

  input {
    width: 18px;
    height: 18px;
    margin-top: 1px;
    accent-color: var(--a-accent);
    flex-shrink: 0;
  }

  small {
    display: block;
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
  }
`;

const PostEditor = styled.textarea`
  width: 100%;
  min-height: 220px;
  padding: 10px 12px;
  border: 1px solid var(--a-border-strong);
  border-radius: var(--a-radius-sm);
  font: inherit;
  font-size: var(--a-text-sm);
  line-height: 1.5;
  resize: vertical;
  ${focusVisible}

  @media (max-width: 640px) {
    font-size: 16px;
  }
`;

type CohortsPanelProps = {
  cohorts: CohortOverview[] | null;
  /** The last load failed; without data the panel says so instead of loading forever. */
  failed: boolean;
  isClosing: boolean;
  /** When the cohorts were fetched: "has it started" is judged at that moment. */
  loadedAt: number;
  onClose: (
    input: CloseCohortInput,
  ) => Promise<{ ok: true; result: CloseCohortResult } | { ok: false; message: string }>;
  onClosed: () => void;
  onReload: () => Promise<void> | void;
  onRetryPost: (cohortId: string) => Promise<boolean>;
  chats: { chatId: string; title: string }[];
  libraryChatId: string;
  onCreateNextCohort: (
    previous: CohortOverview,
    input: NextCohortInput,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCreateRenewalLink: (
    cohort: CohortOverview,
    kind: RenewalLinkKind,
  ) => Promise<boolean>;
  onSetDurationWeeks: (cohortId: string, durationWeeks: number) => Promise<boolean>;
  onSetPreviousChatRemoval: (cohortId: string, enabled: boolean) => Promise<boolean>;
  onUnauthorized: () => void;
  retryingId: string;
};

/** The cohort records and the "Закрыть поток" window (section 6.2). */
export const CohortsPanel = ({
  cohorts,
  failed,
  isClosing,
  loadedAt,
  onClose,
  onClosed,
  onReload,
  onRetryPost,
  chats,
  libraryChatId,
  onCreateNextCohort,
  onCreateRenewalLink,
  onSetDurationWeeks,
  onSetPreviousChatRemoval,
  onUnauthorized,
  retryingId,
}: CohortsPanelProps) => {
  const toast = useToast();
  const [switchingId, setSwitchingId] = useState("");
  // HUB-D50: the length being typed per cohort, until it is saved.
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  const [savingDurationId, setSavingDurationId] = useState("");

  const saveDuration = async (cohort: CohortOverview) => {
    const weeks = Number(durationDrafts[cohort.id]);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 26) {
      toast({ tone: "danger", title: "Длительность — целое число недель от 1 до 26." });
      return;
    }
    setSavingDurationId(cohort.id);
    const ok = await onSetDurationWeeks(cohort.id, weeks);
    setSavingDurationId("");
    if (ok) {
      setDurationDrafts((drafts) => {
        const rest = { ...drafts };
        delete rest[cohort.id];
        return rest;
      });
      toast({ tone: "success", title: `Длительность: ${weeks} ${weeksWord(weeks)}.` });
    } else {
      toast({ tone: "danger", title: "Не получилось сохранить. Попробуй ещё раз." });
    }
  };

  // Switching removal on means the bot will remove people from the previous chat:
  // it asks first. Switching it off is harmless.
  const [removalConfirm, setRemovalConfirm] = useState<CohortOverview | null>(null);

  const switchPreviousChatRemoval = async (cohort: CohortOverview, enabled: boolean) => {
    if (enabled && removalConfirm?.id !== cohort.id) {
      setRemovalConfirm(cohort);
      return;
    }
    setRemovalConfirm(null);
    setSwitchingId(cohort.id);
    const ok = await onSetPreviousChatRemoval(cohort.id, enabled);
    setSwitchingId("");
    if (!ok)
      toast({ tone: "danger", title: "Не получилось переключить. Попробуй ещё раз." });
  };
  const [closing, setClosing] = useState<CohortOverview | null>(null);
  const [lessonsCleared, setLessonsCleared] = useState(false);
  const [openNext, setOpenNext] = useState(true);
  const [publish, setPublish] = useState(true);
  const [pin, setPin] = useState(true);
  const [postText, setPostText] = useState("");
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [closeError, setCloseError] = useState("");

  const ordered = orderCohorts(cohorts ?? [], loadedAt);
  // The running cohort: the transition guide walks it into the next one.
  const running = ordered.find(
    (cohort) => !cohort.closedAt && Date.parse(cohort.startsAt) <= loadedAt,
  );
  const [creatingKind, setCreatingKind] = useState<RenewalLinkKind | "">("");
  const [transitionOpen, setTransitionOpen] = useState(false);
  // The newest cohort record: the one a «следующий поток» would follow.
  const latest = [...(cohorts ?? [])].sort(
    (left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt),
  )[0];
  const [nextForm, setNextForm] = useState<NextCohortInput | null>(null);
  const [nextError, setNextError] = useState("");
  const [isCreatingNext, setIsCreatingNext] = useState(false);
  // A chat that already belongs to a cohort, or the library chat, cannot start one.
  const freeChats = chats.filter(
    (chat) =>
      chat.chatId !== libraryChatId &&
      !(cohorts ?? []).some((cohort) => cohort.mainChatId === chat.chatId),
  );

  const submitNextCohort = async () => {
    if (!latest || !nextForm) return;
    setIsCreatingNext(true);
    setNextError("");
    const outcome = await onCreateNextCohort(latest, nextForm);
    setIsCreatingNext(false);
    if (!outcome.ok) {
      setNextError(outcome.message);
      return;
    }
    setNextForm(null);
    toast({ tone: "success", title: `«${nextForm.title}» заведён` });
  };

  const createRenewalLink = async (kind: RenewalLinkKind) => {
    if (!running) return;
    setCreatingKind(kind);
    const ok = await onCreateRenewalLink(running, kind);
    setCreatingKind("");
    toast(
      ok
        ? {
            tone: "success",
            title: `Ссылка ${kind === "plus" ? "Plus" : "Standard"} готова`,
          }
        : { tone: "danger", title: "Не получилось создать ссылку. Попробуй ещё раз." },
    );
  };

  const openCloseWindow = (cohort: CohortOverview) => {
    setClosing(cohort);
    setLessonsCleared(false);
    setOpenNext(Boolean(cohort.next));
    setPublish(Boolean(cohort.draftPost));
    setPin(true);
    setPostText(cohort.draftPost);
    setIsEditingPost(false);
    setCloseError("");
  };

  const confirmClose = async () => {
    if (!closing) return;
    setCloseError("");
    const outcome = await onClose({
      cohortId: closing.id,
      confirmationTitle: closing.title,
      lessonsCleared,
      openNextCohortSales: openNext && Boolean(closing.next),
      post: publish && postText.trim() ? { pin, text: postText } : null,
    });
    if (!outcome.ok) {
      setCloseError(outcome.message);
      return;
    }
    const { result } = outcome;
    setClosing(null);
    toast({
      tone: result.postStatus && result.postStatus !== "sent" ? "warning" : "success",
      title: `«${closing.title}» закрыт`,
      description:
        result.postStatus && result.postStatus !== "sent"
          ? "Пост не отправился — повтори его в карточке потока."
          : result.nextCohortSalesOpened
            ? "Продажи следующего потока открыты."
            : undefined,
    });
    if (result.campaignSwitch === "failed") {
      toast({
        tone: "danger",
        title: "Следующий поток не стал текущим",
        description:
          "Открой «Настройки потока» → «Исправить название или дату», сохрани без изменений — следующий поток станет текущим. Пока этого нет, ссылки продления не открывают оплату.",
      });
    }
    if (result.continuations.failures.length > 0) {
      toast({
        tone: "danger",
        title: `У ${result.continuations.failures.length} покупок библиотеки не проставились даты`,
        description: "Они видны в разделе Inspiration Hub. Напиши разработчику.",
      });
    }
    onClosed();
  };

  const retry = async (cohort: CohortOverview) => {
    const ok = await onRetryPost(cohort.id);
    toast(
      ok
        ? { tone: "success", title: "Пост опубликован" }
        : {
            tone: "danger",
            title: "Пост снова не отправился",
            description: "Проверь права бота в чате потока.",
          },
    );
  };

  return (
    <Panel title="Потоки" description="Записи потоков: даты, продажи, ссылки и закрытие.">
      {failed && cohorts && (
        <Callout tone="warning" title="Список не обновился">
          Показаны данные прошлой загрузки.{" "}
          <AdminButton size="sm" onClick={() => void onReload()}>
            Повторить
          </AdminButton>
        </Callout>
      )}
      {!cohorts && failed ? (
        <EmptyState
          icon={<CircleAlert aria-hidden />}
          title="Не удалось загрузить потоки"
          text="Остальные разделы работают. Попробуй ещё раз через минуту."
          action={<AdminButton onClick={() => void onReload()}>Повторить</AdminButton>}
        />
      ) : !cohorts ? (
        <List>
          <Skeleton $height={160} />
          <Skeleton $height={120} />
        </List>
      ) : ordered.length === 0 ? (
        <EmptyState
          title="Записей потоков пока нет"
          text="Потоков пока нет. Напиши разработчику — первый поток заводится вместе с ним."
        />
      ) : (
        <List>
          <CohortTransitionBanner
            latest={latest}
            running={running}
            onOpenTransition={() => setTransitionOpen(true)}
            onCreateNext={() => {
              if (!latest) return;
              setNextError("");
              setNextForm(initialNextCohortInput(latest));
            }}
          />
          {ordered.map((cohort) => {
            const status = cohortStatus(cohort, ordered, loadedAt);
            const isCurrent = !cohort.closedAt && Date.parse(cohort.startsAt) <= loadedAt;
            // A queued post is on its way; only a failed one can be retried.
            const postFailed =
              cohort.post && ["failed", "dead_letter"].includes(cohort.post.status);
            const showLinks = !cohort.closedAt && cohort.links;
            return (
              <CohortCard
                key={cohort.id}
                $current={isCurrent}
                $closed={Boolean(cohort.closedAt)}
              >
                <CardHead>
                  <h3>{cohort.title}</h3>
                  <Badge $tone={status.tone}>{status.label}</Badge>
                  {isCurrent && (
                    <AdminButton
                      variant="primary"
                      icon={<Lock aria-hidden />}
                      onClick={() => openCloseWindow(cohort)}
                    >
                      Закрыть поток
                    </AdminButton>
                  )}
                </CardHead>
                <CardBody>
                  <Stack $gap={12}>
                    <dl>
                      <dt>Старт</dt>
                      <dd>{formatDate(cohort.startsAt, true)}</dd>
                      <dt>Длительность</dt>
                      <dd>
                        {cohort.durationWeeks} {weeksWord(cohort.durationWeeks)} · по
                        плану до {formatDate(cohort.plannedEndsAt)}
                      </dd>
                      {cohort.closedAt && (
                        <>
                          <dt>
                            {Date.parse(cohort.closedAt) > loadedAt
                              ? "Закроется"
                              : "Закрыт"}
                          </dt>
                          <dd>{formatDate(cohort.closedAt, true)}</dd>
                        </>
                      )}
                      {cohort.accessEndsAt && (
                        <>
                          <dt>Библиотека у Plus до</dt>
                          <dd>{formatWarsawDay(cohort.plusHubLastDay)} включительно</dd>
                        </>
                      )}
                      <dt>Чат</dt>
                      <dd>{cohort.mainChatTitle}</dd>
                    </dl>
                    <Facts>
                      <div>
                        <small>Участников</small>
                        <b>{cohort.facts.purchases}</b>
                      </div>
                      <div>
                        <small>оплат / по приглашению</small>
                        <b>
                          {cohort.facts.purchases - cohort.facts.invitedParticipants} /{" "}
                          {cohort.facts.invitedParticipants}
                        </b>
                      </div>
                      <div>
                        <small>из них Plus</small>
                        <b>{cohort.facts.plusPurchases}</b>
                      </div>
                      <div>
                        <small>Купили библиотеку после потока</small>
                        <b>{cohort.facts.continuations}</b>
                      </div>
                    </Facts>
                    {!cohort.closedAt && (
                      <DurationEditor>
                        <label htmlFor={`cohort-weeks-${cohort.id}`}>
                          Длительность, недель
                        </label>
                        <Input
                          id={`cohort-weeks-${cohort.id}`}
                          type="number"
                          min={1}
                          max={26}
                          inputMode="numeric"
                          value={
                            durationDrafts[cohort.id] ?? String(cohort.durationWeeks)
                          }
                          onChange={(event) =>
                            setDurationDrafts((drafts) => ({
                              ...drafts,
                              [cohort.id]: event.target.value,
                            }))
                          }
                        />
                        <AdminButton
                          disabled={
                            savingDurationId === cohort.id ||
                            durationDrafts[cohort.id] === undefined ||
                            durationDrafts[cohort.id] === String(cohort.durationWeeks)
                          }
                          onClick={() => void saveDuration(cohort)}
                        >
                          Сохранить
                        </AdminButton>
                      </DurationEditor>
                    )}
                    {!cohort.closedAt && (
                      <FieldNote>
                        Меняет дату окончания по плану — её видят покупатели Plus в «Моём
                        доступе». Сам поток закрывается только кнопкой «Закрыть поток».
                      </FieldNote>
                    )}
                    {cohort.previousCohortId && !cohort.closedAt && (
                      <SwitchSetting>
                        <Switch
                          checked={cohort.removesPreviousChatMembers}
                          disabled={switchingId === cohort.id}
                          label="Удалять из чата прошлого потока"
                          onChange={(enabled) =>
                            void switchPreviousChatRemoval(cohort, enabled)
                          }
                        />
                        <div>
                          <b>Удалять из чата прошлого потока</b>
                          <small>
                            Кто вошёл в чат этого потока по своей покупке, удаляется из
                            чата
                            {cohorts?.find((c) => c.id === cohort.previousCohortId)
                              ? ` «${cohorts.find((c) => c.id === cohort.previousCohortId)!.mainChatTitle}»`
                              : " прошлого потока"}
                            . Админов и создателя бот не трогает.
                          </small>
                        </div>
                      </SwitchSetting>
                    )}
                  </Stack>
                  {(showLinks || cohort.post) && (
                    <Stack $gap={10}>
                      {cohort.post && (
                        <Row $gap={8}>
                          <Badge
                            $tone={
                              cohort.post.status === "sent"
                                ? "success"
                                : postFailed
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            <Send aria-hidden />
                            {cohort.post.status === "sent"
                              ? "Пост о закрытии опубликован"
                              : postFailed
                                ? "Пост о закрытии не опубликован"
                                : "Пост о закрытии отправляется…"}
                          </Badge>
                          {postFailed && (
                            <AdminButton
                              size="sm"
                              loading={retryingId === cohort.id}
                              onClick={() => void retry(cohort)}
                            >
                              Повторить
                            </AdminButton>
                          )}
                        </Row>
                      )}
                      {showLinks && cohort.links && (
                        <Stack $gap={6}>
                          <SectionCaption>
                            Ссылки продления для этого потока
                            {cohort.next ? ` на «${cohort.next.title}»` : ""}
                          </SectionCaption>
                          {cohort.links.plus && (
                            <CopyField
                              caption="Plus"
                              label="Ссылка продления Plus"
                              value={cohort.links.plus}
                            />
                          )}
                          {cohort.links.standard && (
                            <CopyField
                              caption="Standard"
                              label="Ссылка продления Standard"
                              value={cohort.links.standard}
                            />
                          )}
                          <CopyField
                            caption="Библиотека"
                            label="Ссылка на покупку библиотеки"
                            value={cohort.links.hub}
                          />
                        </Stack>
                      )}
                    </Stack>
                  )}
                </CardBody>
                {!cohort.closedAt && (
                  <CardFooter>
                    <BotRightsCheck
                      chatId={cohort.mainChatId}
                      needsPin
                      onUnauthorized={onUnauthorized}
                    />
                  </CardFooter>
                )}
              </CohortCard>
            );
          })}
        </List>
      )}

      <ConfirmDialog
        open={removalConfirm !== null}
        title="Удалять из чата прошлого потока?"
        description={
          removalConfirm
            ? `Каждый, кто войдёт в «${removalConfirm.mainChatTitle}» по своей покупке, будет удалён из «${
                cohorts?.find((c) => c.id === removalConfirm.previousCohortId)
                  ?.mainChatTitle ?? "чата прошлого потока"
              }». Админов и создателя чата бот не трогает.`
            : ""
        }
        confirmLabel="Включить"
        tone="danger"
        onCancel={() => setRemovalConfirm(null)}
        onConfirm={() => {
          if (removalConfirm) void switchPreviousChatRemoval(removalConfirm, true);
        }}
      />
      <ConfirmDialog
        open={closing !== null}
        title={closing ? `Закрыть «${closing.title}»` : ""}
        description="Закрытие нельзя отменить. Люди останутся в чате до старта следующего потока, но уроков там уже не будет."
        confirmLabel="Закрыть поток"
        tone="danger"
        busy={isClosing}
        requireText={closing?.title}
        confirmDisabled={!lessonsCleared}
        onCancel={() => setClosing(null)}
        onConfirm={() => void confirmClose()}
      >
        {closing && (
          <Stack $gap={12}>
            <Facts $rows>
              <div>
                <small>Уроки потока недоступны с</small>
                <b>завтра, 00:00 по Варшаве</b>
              </div>
              <div>
                <small>Библиотека у Plus до</small>
                <b>{formatWarsawDay(closing.plusHubLastDay)}</b>
              </div>
              <div>
                <small>Купили библиотеку после потока</small>
                <b>{closing.facts.continuations}</b>
              </div>
            </Facts>
            {closing.facts.legacyPlusHubRights > 0 && (
              <Callout tone="info" icon={<CircleAlert aria-hidden />}>
                {closing.next
                  ? `У ${closing.facts.legacyPlusHubRights} покупок Plus по старым условиям библиотека открыта до старта «${closing.next.title}» (${formatDate(closing.next.startsAt)}). Дата поставится сама при закрытии.`
                  : `У ${closing.facts.legacyPlusHubRights} покупок Plus по старым условиям библиотека открыта до старта следующего потока, а его пока нет. Сначала заведи следующий поток.`}
              </Callout>
            )}
            {!closing.next && (
              <Callout tone="warning" icon={<CircleAlert aria-hidden />}>
                Следующий поток не заведён — продажи открывать нечему.
              </Callout>
            )}
            {loadedAt < Date.parse(closing.plannedEndsAt) && (
              <Callout tone="warning" icon={<CircleAlert aria-hidden />}>
                По плану поток идёт до {formatDate(closing.plannedEndsAt)} (
                {closing.durationWeeks} {weeksWord(closing.durationWeeks)}). Если закрыть
                сейчас, библиотека у Plus закончится раньше — через 7 дней после закрытия.
              </Callout>
            )}
            <Check>
              <input
                type="checkbox"
                checked={lessonsCleared}
                onChange={(event) => setLessonsCleared(event.target.checked)}
              />
              <span>
                Уроки из чата убраны
                <small>Сначала проверь, что они сохранены в библиотеке.</small>
              </span>
            </Check>
            {!lessonsCleared && (
              <FieldNote>
                Пока галочка «Уроки из чата убраны» не стоит, закрыть поток нельзя.
              </FieldNote>
            )}
            {closing.next && (
              <Check>
                <input
                  type="checkbox"
                  checked={openNext}
                  onChange={(event) => setOpenNext(event.target.checked)}
                />
                <span>
                  Открыть продажи «{closing.next.title}»
                  <small>Старт {formatDate(closing.next.startsAt)}.</small>
                </span>
              </Check>
            )}
            {closing.draftPost && (
              <>
                <Check>
                  <input
                    type="checkbox"
                    checked={publish}
                    onChange={(event) => setPublish(event.target.checked)}
                  />
                  <span>
                    Опубликовать пост в чате потока
                    <small>Бот отправит его сразу после закрытия.</small>
                  </span>
                </Check>
                {publish && (
                  <>
                    <Check>
                      <input
                        type="checkbox"
                        checked={pin}
                        onChange={(event) => setPin(event.target.checked)}
                      />
                      <span>Закрепить пост</span>
                    </Check>
                    <Muted>
                      Пост на английском — чаты международные. Цены и даты уже
                      подставлены, ссылки на оплату — кнопками под постом.
                    </Muted>
                    {isEditingPost ? (
                      <>
                        <PostEditor
                          aria-label="Текст поста"
                          value={postText}
                          onChange={(event) => setPostText(event.target.value)}
                        />
                        <Muted>
                          *Звёздочки* — жирный, ~тильды~ — зачёркнутый, строки с «&gt; » в
                          начале — цитата.
                        </Muted>
                      </>
                    ) : (
                      <TelegramPostPreview
                        text={postText}
                        buttons={closing.postButtons}
                      />
                    )}
                    <Row>
                      <AdminButton
                        size="sm"
                        variant="secondary"
                        onClick={() => setIsEditingPost((editing) => !editing)}
                      >
                        {isEditingPost ? "Показать как в Telegram" : "Изменить текст"}
                      </AdminButton>
                    </Row>
                  </>
                )}
              </>
            )}
            {closing.next && !closing.draftPost && !closing.closedAt && (
              <Callout tone="info" icon={<CircleAlert aria-hidden />}>
                Пост о закрытии не предложен: сначала создай ссылки продления в «Настроить
                переход».
              </Callout>
            )}
            {closeError && <Callout tone="danger">{closeError}</Callout>}
          </Stack>
        )}
      </ConfirmDialog>
      {running?.next && (
        <SheetDialog
          open={transitionOpen}
          onClose={() => setTransitionOpen(false)}
          title={`Переход «${running.title}» → «${running.next.title}»`}
        >
          <CohortTransitionGuide
            cohort={running}
            creatingKind={creatingKind}
            onCreateLink={(kind) => void createRenewalLink(kind)}
            onOpenClose={() => {
              setTransitionOpen(false);
              openCloseWindow(running);
            }}
          />
        </SheetDialog>
      )}
      {latest && nextForm && (
        <SheetDialog
          open
          onClose={() => setNextForm(null)}
          title="Завести следующий поток"
          footer={
            <AdminButton
              variant="primary"
              loading={isCreatingNext}
              disabled={
                !nextForm.title.trim() || !nextForm.mainChatId || !nextForm.startsAt
              }
              onClick={() => void submitNextCohort()}
            >
              Завести поток
            </AdminButton>
          }
        >
          <NextCohortForm
            chats={freeChats}
            error={nextError}
            latest={latest}
            value={nextForm}
            onChange={setNextForm}
          />
        </SheetDialog>
      )}
    </Panel>
  );
};
