import { ArrowRight, Check, ChevronDown, Lock, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import styled from "styled-components";

import type { CohortOverview } from "@/lib/online-group/cohort-admin";

import { CopyField } from "../ui/copy";
import { Field, FormGrid, Input, Select } from "../ui/forms";
import { AdminButton, Muted, Stack } from "../ui/primitives";
import { TelegramPostPreview } from "./telegram-post-preview";

export type RenewalLinkKind = "plus" | "standard";

const formatDay = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));

const weeksWord = (weeks: number) => {
  const lastTwo = weeks % 100;
  const last = weeks % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "недель";
  if (last === 1) return "неделя";
  return last >= 2 && last <= 4 ? "недели" : "недель";
};

const Steps = styled.ol`
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const StepRoot = styled.li<{ $done: boolean }>`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  background: var(--a-surface);
`;

const Marker = styled.span<{ $done: boolean }>`
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 600;
  color: ${({ $done }) => ($done ? "var(--a-success)" : "var(--a-ink-2)")};
  background: ${({ $done }) =>
    $done ? "var(--a-success-soft)" : "var(--a-surface-sunken)"};

  svg {
    width: 16px;
    height: 16px;
  }
`;

const StepBody = styled.div`
  display: grid;
  gap: 8px;
  min-width: 0;

  b {
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--a-ink-2);
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Warning = styled.p`
  && {
    color: var(--a-warning);
  }
`;

const Toggle = styled.button`
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--a-accent);
  font: inherit;
  cursor: pointer;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const Step = ({
  children,
  done,
  index,
  title,
}: {
  children: ReactNode;
  done: boolean;
  index: number;
  title: string;
}) => (
  <StepRoot $done={done}>
    <Marker $done={done} aria-label={done ? "Сделано" : `Шаг ${index}`}>
      {done ? <Check aria-hidden /> : index}
    </Marker>
    <StepBody>
      <b>{title}</b>
      {children}
    </StepBody>
  </StepRoot>
);

/**
 * The move from the running cohort to the next one, as one ordered list: each step
 * says what it is for, ticks itself when the data shows it is done and offers the
 * action right there. Nothing here skips the safety of the closure window.
 */
export const CohortTransitionGuide = ({
  cohort,
  creatingKind,
  onCreateLink,
  onOpenClose,
}: {
  cohort: CohortOverview;
  creatingKind: RenewalLinkKind | "";
  onCreateLink: (kind: RenewalLinkKind) => void;
  onOpenClose: () => void;
}) => {
  const [showPost, setShowPost] = useState(false);
  const next = cohort.next;
  if (!next) return null;

  const hasPlus = Boolean(cohort.links?.plus);
  const hasStandard = Boolean(cohort.links?.standard);
  const linksReady = hasPlus && hasStandard;

  return (
    <Stack $gap={12}>
      <Muted>Делай по порядку. Готовые шаги отмечаются сами.</Muted>
      <Steps>
        <Step done index={1} title="Следующий поток заведён">
          <p>
            «{next.title}»: старт {formatDay(next.startsAt)}. Длительность меняется в его
            карточке в «Потоках».
          </p>
        </Step>

        <Step done={linksReady} index={2} title="Ссылки продления Plus и Standard">
          <p>
            Для людей из «{cohort.mainChatTitle}»: цена продления на «{next.title}».
            Оплата по ним откроется, когда закроешь «{cohort.title}».
          </p>
          <Actions>
            {hasPlus ? (
              <Muted>✓ Plus готова</Muted>
            ) : (
              <AdminButton
                icon={<Plus aria-hidden />}
                loading={creatingKind === "plus"}
                disabled={creatingKind !== ""}
                onClick={() => onCreateLink("plus")}
              >
                Создать ссылку Plus
              </AdminButton>
            )}
            {hasStandard ? (
              <Muted>✓ Standard готова</Muted>
            ) : (
              <AdminButton
                icon={<Plus aria-hidden />}
                loading={creatingKind === "standard"}
                disabled={creatingKind !== ""}
                onClick={() => onCreateLink("standard")}
              >
                Создать ссылку Standard
              </AdminButton>
            )}
          </Actions>
          {cohort.links?.plus && (
            <CopyField caption="Plus" label="Ссылка Plus" value={cohort.links.plus} />
          )}
          {cohort.links?.standard && (
            <CopyField
              caption="Standard"
              label="Ссылка Standard"
              value={cohort.links.standard}
            />
          )}
        </Step>

        <Step done={linksReady} index={3} title="Пост для чата готов">
          <p>
            {linksReady
              ? "В посте цены и ссылки на Plus, Standard и Inspiration HUB. Поправить текст можно в окне закрытия."
              : "Пост собирается из ссылок шага 2: пока их нет, в нём будет только Inspiration HUB."}
          </p>
          {cohort.draftPost && (
            <>
              <Toggle
                type="button"
                aria-expanded={showPost}
                onClick={() => setShowPost((open) => !open)}
              >
                {showPost ? "Скрыть пост" : "Показать пост"}
                <ChevronDown aria-hidden />
              </Toggle>
              {showPost && (
                <TelegramPostPreview
                  text={cohort.draftPost}
                  buttons={cohort.postButtons}
                />
              )}
            </>
          )}
        </Step>

        <Step done={false} index={4} title="Уроки убраны из чата">
          <p>
            Проверь, что уроки «{cohort.title}» есть в Inspiration HUB, и убери их из
            чата. Подтвердишь галочкой в окне закрытия.
          </p>
        </Step>

        <Step done={false} index={5} title={`Закрыть «${cohort.title}»`}>
          <p>
            Закрытие: доступ к группе закончится завтра в 00:00, Inspiration HUB у Plus —
            через 7 дней. Продажи «{next.title}» откроются, он станет текущим потоком, бот
            опубликует и закрепит пост. Это необратимо.
          </p>
          {!linksReady && (
            <Warning>
              Сначала создай обе ссылки продления — иначе пост уйдёт без Plus и Standard.
            </Warning>
          )}
          <Actions>
            <AdminButton
              variant="primary"
              icon={<Lock aria-hidden />}
              onClick={onOpenClose}
            >
              Перейти к закрытию
            </AdminButton>
          </Actions>
          <Muted>
            «{cohort.title}»: {cohort.durationWeeks} {weeksWord(cohort.durationWeeks)} по
            плану, до {formatDay(cohort.plannedEndsAt)}.
          </Muted>
        </Step>
      </Steps>
    </Stack>
  );
};

/** How many of the five steps are already done (the last two are confirmed at closure). */
export const transitionProgress = (cohort: CohortOverview) =>
  cohort.links?.plus && cohort.links?.standard ? 3 : 1;

/**
 * The line on top of «Потоки»: either the move into the recorded next cohort, or
 * the invitation to record it. One button opens the steps or the form.
 */
export const CohortTransitionBanner = ({
  latest,
  onCreateNext,
  onOpenTransition,
  running,
}: {
  latest: CohortOverview | undefined;
  onCreateNext: () => void;
  onOpenTransition: () => void;
  running: CohortOverview | undefined;
}) => {
  if (running?.next) {
    const done = transitionProgress(running);
    return (
      <Banner>
        <div>
          <b>
            Переход «{running.title}» → «{running.next.title}»
          </b>
          <Muted>
            Старт {formatDay(running.next.startsAt)} · готово {done} из 5 шагов
          </Muted>
        </div>
        <AdminButton
          variant="primary"
          icon={<ArrowRight aria-hidden />}
          onClick={onOpenTransition}
        >
          Настроить переход
        </AdminButton>
      </Banner>
    );
  }

  if (latest && !latest.next) {
    return (
      <Banner>
        <div>
          <b>Следующий поток после «{latest.title}» не заведён</b>
          <Muted>
            Заведи его заранее: чат, дата старта и длительность. Потом здесь появится
            «Настроить переход».
          </Muted>
        </div>
        <AdminButton icon={<Plus aria-hidden />} onClick={onCreateNext}>
          Завести следующий поток
        </AdminButton>
      </Banner>
    );
  }

  return null;
};

const Banner = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  padding: 16px 18px;
  border: 1px solid var(--a-accent-ring);
  border-radius: var(--a-radius-lg);
  background: var(--a-accent-soft);

  > div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  b {
    font-weight: 600;
  }
`;

export type NextCohortInput = {
  durationWeeks: number;
  mainChatId: string;
  startsAt: string;
  title: string;
};

/** «Online Group 3.0» → «Online Group 4.0»; anything else is left for the admin. */
const suggestNextTitle = (title: string) => {
  const match = /^(.*?)(\d+)(\.\d+)?\s*$/u.exec(title);
  return match ? `${match[1]}${Number(match[2]) + 1}${match[3] ?? ""}` : "";
};

/** The form of «Завести следующий поток». */
export const NextCohortForm = ({
  chats,
  error,
  latest,
  onChange,
  value,
}: {
  chats: { chatId: string; title: string }[];
  error: string;
  latest: CohortOverview;
  onChange: (value: NextCohortInput) => void;
  value: NextCohortInput;
}) => (
  <Stack $gap={12}>
    <Muted>
      Это только запись потока: продажи откроются, когда закроешь «{latest.title}».
      Сначала создай чат потока в Telegram, добавь бота администратором и отправь в чате
      /register_chat — тогда он появится в списке.
    </Muted>
    <Field label="Название" htmlFor="next-cohort-title">
      <Input
        id="next-cohort-title"
        value={value.title}
        onChange={(event) => onChange({ ...value, title: event.target.value })}
      />
    </Field>
    <Field
      label="Чат потока"
      htmlFor="next-cohort-chat"
      hint={chats.length === 0 ? "Свободных зарегистрированных чатов нет." : undefined}
    >
      <Select
        id="next-cohort-chat"
        value={value.mainChatId}
        onChange={(event) => onChange({ ...value, mainChatId: event.target.value })}
      >
        <option value="" disabled>
          Выбери чат
        </option>
        {chats.map((chat) => (
          <option key={chat.chatId} value={chat.chatId}>
            {chat.title}
          </option>
        ))}
      </Select>
    </Field>
    <FormGrid>
      <Field
        label="Старт"
        htmlFor="next-cohort-start"
        hint="По Варшаве. Час можно не уточнять."
      >
        <Input
          id="next-cohort-start"
          type="datetime-local"
          value={value.startsAt}
          onChange={(event) => onChange({ ...value, startsAt: event.target.value })}
        />
      </Field>
      <Field label="Длительность, недель" htmlFor="next-cohort-weeks">
        <Input
          id="next-cohort-weeks"
          type="number"
          min={1}
          max={26}
          inputMode="numeric"
          value={String(value.durationWeeks)}
          onChange={(event) =>
            onChange({ ...value, durationWeeks: Number(event.target.value) })
          }
        />
      </Field>
    </FormGrid>
    {error && <Warning>{error}</Warning>}
  </Stack>
);

export const initialNextCohortInput = (latest: CohortOverview): NextCohortInput => ({
  durationWeeks: latest.durationWeeks,
  mainChatId: "",
  startsAt: "",
  title: suggestNextTitle(latest.title),
});
