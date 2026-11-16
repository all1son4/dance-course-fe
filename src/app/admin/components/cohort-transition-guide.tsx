import { Check, ChevronDown, Lock, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import styled from "styled-components";

import type { CohortOverview } from "@/lib/online-group/cohort-admin";

import { CopyField } from "../ui/copy";
import { AdminButton, Muted } from "../ui/primitives";

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

const Guide = styled.section`
  display: grid;
  gap: 16px;
  padding: 20px;
  border: 1px solid var(--a-accent-ring);
  border-radius: var(--a-radius-lg);
  background: var(--a-accent-soft);

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }

  > p {
    margin: 4px 0 0;
    color: var(--a-ink-2);
  }
`;

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

const PostPreview = styled.pre`
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  border-radius: var(--a-radius-sm);
  background: var(--a-surface-sunken);
  font-family: var(--a-font);
  font-size: var(--a-text-xs);
  white-space: pre-wrap;
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

  if (!next) {
    return (
      <Guide aria-labelledby="transition-title">
        <div>
          <h3 id="transition-title">Переход на следующий поток</h3>
          <p>
            Следующий поток ещё не заведён. Его запись (чат, дата старта, длительность)
            заводит разработчик — после этого здесь появятся шаги перехода.
          </p>
        </div>
      </Guide>
    );
  }

  const hasPlus = Boolean(cohort.links?.plus);
  const hasStandard = Boolean(cohort.links?.standard);
  const linksReady = hasPlus && hasStandard;

  return (
    <Guide aria-labelledby="transition-title">
      <div>
        <h3 id="transition-title">
          Переход «{cohort.title}» → «{next.title}»
        </h3>
        <p>Делай по порядку. Готовые шаги отмечаются сами.</p>
      </div>

      <Steps>
        <Step done index={1} title="Следующий поток заведён">
          <p>
            «{next.title}»: старт {formatDay(next.startsAt)}. Длительность меняется в его
            карточке ниже.
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
          {cohort.links?.plus && <CopyField label="Plus" value={cohort.links.plus} />}
          {cohort.links?.standard && (
            <CopyField label="Standard" value={cohort.links.standard} />
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
              {showPost && <PostPreview>{cohort.draftPost}</PostPreview>}
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
              Открыть окно закрытия
            </AdminButton>
          </Actions>
          <Muted>
            {cohort.durationWeeks} {weeksWord(cohort.durationWeeks)} по плану, до{" "}
            {formatDay(cohort.plannedEndsAt)}.
          </Muted>
        </Step>
      </Steps>
    </Guide>
  );
};
