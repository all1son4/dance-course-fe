import { CircleAlert, Lock, Send } from "lucide-react";
import { useState } from "react";
import styled, { css } from "styled-components";

import type { CohortOverview } from "@/lib/online-group/cohort-admin";

import type { CloseCohortInput, CloseCohortResult } from "../hooks/use-cohorts-admin";
import type { AdminTone } from "../styles/tokens.styles";
import { CopyField } from "../ui/copy";
import { ConfirmDialog, useToast } from "../ui/feedback";
import { Switch } from "../ui/forms";
import {
  AdminButton,
  Badge,
  Callout,
  EmptyState,
  focusVisible,
  Panel,
  Row,
  Skeleton,
  Stack,
} from "../ui/primitives";
import { BotRightsCheck } from "./bot-rights-check";

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
    grid-template-columns: auto minmax(0, 1fr);
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

  @container admin-content (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const Facts = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

  /* Phones: one tidy row per figure instead of three squeezed tiles. */
  @container admin-content (max-width: 520px) {
    grid-template-columns: minmax(0, 1fr);
    max-width: none;

    div {
      flex-direction: row;
      align-items: center;
    }

    small {
      font-size: var(--a-text-sm);
    }

    b {
      font-size: var(--a-text-md);
    }
  }
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
  onSetPreviousChatRemoval,
  onUnauthorized,
  retryingId,
}: CohortsPanelProps) => {
  const toast = useToast();
  const [switchingId, setSwitchingId] = useState("");

  const switchPreviousChatRemoval = async (cohort: CohortOverview, enabled: boolean) => {
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
  const [closeError, setCloseError] = useState("");

  const ordered = orderCohorts(cohorts ?? [], loadedAt);

  const openCloseWindow = (cohort: CohortOverview) => {
    setClosing(cohort);
    setLessonsCleared(false);
    setOpenNext(Boolean(cohort.next));
    setPublish(Boolean(cohort.draftPost));
    setPin(true);
    setPostText(cohort.draftPost);
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
    if (result.continuations.failures.length > 0) {
      toast({
        tone: "danger",
        title: `${result.continuations.failures.length} продолжений хаба не получили даты`,
        description: "Они видны во вкладке Inspiration Hub. Напиши разработчику.",
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
    <Panel
      title="Потоки"
      description="Записи потоков: даты, продажи, участницы и закрытие."
    >
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
          text="Они появятся после переноса при запуске хаба. До этого работает форма «Настройки потока»."
        />
      ) : (
        <List>
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
                          <dt>Хаб Plus до</dt>
                          <dd>{formatWarsawDay(cohort.plusHubLastDay)} включительно</dd>
                        </>
                      )}
                      <dt>Чат</dt>
                      <dd>{cohort.mainChatTitle}</dd>
                    </dl>
                    <Facts>
                      <div>
                        <small>Покупок</small>
                        <b>{cohort.facts.purchases}</b>
                      </div>
                      <div>
                        <small>из них Plus</small>
                        <b>{cohort.facts.plusPurchases}</b>
                      </div>
                      <div>
                        <small>Продолжений хаба</small>
                        <b>{cohort.facts.continuations}</b>
                      </div>
                    </Facts>
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
                                : "Пост о закрытии в очереди"}
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
                            Ссылки для участниц этого потока
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
                            caption="Хаб"
                            label="Ссылка на хаб"
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
        open={closing !== null}
        title={closing ? `Закрыть «${closing.title}»` : ""}
        description="Закрытие необратимо. Чат и участницы остаются, уроков в нём больше нет."
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
            <Facts>
              <div>
                <small>Доступ закончится</small>
                <b>завтра 00:00</b>
              </div>
              <div>
                <small>Хаб Plus до</small>
                <b>{formatWarsawDay(closing.plusHubLastDay)}</b>
              </div>
              <div>
                <small>Продолжений хаба</small>
                <b>{closing.facts.continuations}</b>
              </div>
            </Facts>
            {closing.facts.legacyPlusHubRights > 0 && (
              <Callout tone="warning" icon={<CircleAlert aria-hidden />}>
                У {closing.facts.legacyPlusHubRights} покупок Plus хаб в старой модели:
                закрытие не поставит им конец. Для обычного потока сначала попроси
                разработчика перевести их (команда db:hub:classify-plus).
              </Callout>
            )}
            {!closing.next && (
              <Callout tone="warning" icon={<CircleAlert aria-hidden />}>
                Следующий поток не заведён — продажи открывать нечему.
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
                <small>Сначала проверь, что они сохранены в хабе.</small>
              </span>
            </Check>
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
                    <PostEditor
                      aria-label="Текст поста"
                      value={postText}
                      onChange={(event) => setPostText(event.target.value)}
                    />
                  </>
                )}
              </>
            )}
            {closeError && <Callout tone="danger">{closeError}</Callout>}
          </Stack>
        )}
      </ConfirmDialog>
    </Panel>
  );
};
