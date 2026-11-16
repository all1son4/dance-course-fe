import { ArrowRight, CircleAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";
import styled from "styled-components";

import type { AttentionItem } from "@/lib/admin/overview";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import type { AdminFeatureId } from "../lib/admin.types";
import { requestAdminJson } from "../lib/admin-request";
import { useToast } from "../ui/feedback";
import { AdminButton, Badge } from "../ui/primitives";

const VIEW_LABELS: Record<AttentionItem["view"], string> = {
  "inspiration-hub": "Библиотека",
  "online-group": "Online Group",
  operations: "Система",
  purchases: "Покупки",
  sales: "Каталог",
};

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const AttentionRow = styled.li<{ $danger: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--a-border);

  &:first-child {
    border-top: 0;
    padding-top: 2px;
  }

  > svg {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    color: ${({ $danger }) => ($danger ? "var(--a-danger)" : "var(--a-warning)")};
  }

  strong {
    display: block;
    font-weight: 650;
  }

  p {
    margin: 2px 0 0;
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
  }

  @media (max-width: 640px) {
    grid-template-columns: auto minmax(0, 1fr);

    > div:last-child {
      grid-column: 2;
    }
  }
`;

type AttentionListProps = {
  /** The section showing the list: items of that section lose their "Открыть". */
  currentView?: AdminFeatureId;
  items: AttentionItem[];
  onFixed: () => void;
  onNavigate: (view: AdminFeatureId) => void;
};

/**
 * Problems the system could not solve by itself. The overview shows all of them;
 * each section shows its own, so a problem is solved where it is seen.
 */
export const AttentionList = ({
  currentView,
  items,
  onFixed,
  onNavigate,
}: AttentionListProps) => {
  const toast = useToast();
  const [fixingId, setFixingId] = useState("");

  const runFix = async (item: AttentionItem) => {
    if (!item.fix) return;
    setFixingId(item.id);
    const result = await requestAdminJson<{ status: string }>(
      ADMIN_API_ENDPOINTS.onlineGroupCohortPostRetry,
      { body: { cohortId: item.fix.cohortId }, method: "POST" },
    );
    setFixingId("");
    if (result.unauthorized) {
      toast({
        tone: "warning",
        title: "Сессия закончилась",
        description: "Войди заново и повтори.",
      });
      return;
    }
    if (result.ok && result.data.status === "sent") {
      toast({ tone: "success", title: "Пост опубликован" });
    } else {
      toast({
        tone: "danger",
        title: "Пост снова не отправился",
        description: "Проверь права бота в чате потока.",
      });
    }
    onFixed();
  };

  return (
    <List>
      {items.map((item) => {
        const danger = item.severity === "danger";
        return (
          <AttentionRow key={item.id} $danger={danger}>
            {danger ? (
              <CircleAlert aria-label="Срочно" />
            ) : (
              <TriangleAlert aria-label="Внимание" />
            )}
            <div>
              <strong>{item.title}</strong>
              <p>
                {!currentView && (
                  <>
                    <Badge $tone={danger ? "danger" : "warning"}>
                      {VIEW_LABELS[item.view]}
                    </Badge>{" "}
                  </>
                )}
                {item.detail}
              </p>
            </div>
            <div>
              {item.fix ? (
                <AdminButton
                  size="sm"
                  variant="primary"
                  loading={fixingId === item.id}
                  onClick={() => void runFix(item)}
                >
                  {item.fix.label}
                </AdminButton>
              ) : item.view !== currentView ? (
                <AdminButton
                  size="sm"
                  icon={<ArrowRight aria-hidden />}
                  onClick={() => onNavigate(item.view)}
                >
                  Открыть
                </AdminButton>
              ) : null}
            </div>
          </AttentionRow>
        );
      })}
    </List>
  );
};
