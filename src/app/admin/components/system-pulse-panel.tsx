import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";

import type { PulseSignal, SystemPulse } from "@/lib/admin/system-pulse";

import { ADMIN_API_ENDPOINTS } from "../lib/admin.constants";
import { requestAdminJson } from "../lib/admin-request";
import { toneColors } from "../styles/tokens.styles";
import { Callout, Muted, Panel, Skeleton } from "../ui/primitives";

const REFRESH_MS = 60_000;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @container admin-content (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const Signal = styled.div<{ $tone: PulseSignal["tone"] }>`
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--a-radius);
  background: var(--a-surface-sunken);
  box-shadow: inset 3px 0 0
    ${({ $tone }) => ($tone === "neutral" ? "var(--a-border-strong)" : toneColors[$tone].color)};

  > span {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    line-height: 1.4;
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
  }

  > span::before {
    content: "";
    width: 7px;
    height: 7px;
    margin-top: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background: ${({ $tone }) =>
      $tone === "neutral" ? "var(--a-ink-3)" : toneColors[$tone].color};
  }

  > b {
    color: ${({ $tone }) =>
      $tone === "danger" || $tone === "warning"
        ? toneColors[$tone].color
        : "var(--a-ink)"};
    font-size: var(--a-text-lg);
    font-weight: 700;
    line-height: 1.25;
    overflow-wrap: break-word;

    @container admin-content (max-width: 520px) {
      font-size: var(--a-text-md);
    }
  }

  @container admin-content (max-width: 520px) {
    padding: 10px 12px;
  }

  > small {
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));

/**
 * Live signals at the top of «Система»: refreshed every minute while the section
 * is open, each with its own verdict colour, so a glance says whether to act.
 */
export const SystemPulsePanel = ({ onUnauthorized }: { onUnauthorized: () => void }) => {
  const [pulse, setPulse] = useState<SystemPulse | null>(null);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    const result = await requestAdminJson<SystemPulse>(ADMIN_API_ENDPOINTS.systemPulse);
    if (current !== sequence.current) return;
    if (result.unauthorized) return onUnauthorized();
    setFailed(!result.ok);
    if (result.ok) setPulse(result.data);
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <Panel
      title="Пульс"
      description={
        pulse
          ? `Обновляется сам раз в минуту · ${formatTime(pulse.generatedAt)}`
          : "Живые показатели оплат, очереди и Telegram-бота."
      }
    >
      {pulse && failed && (
        <Callout tone="warning" title="Пульс не обновился">
          Показаны значения на {formatTime(pulse.generatedAt)}. Попробую снова через
          минуту.
        </Callout>
      )}
      {pulse ? (
        <Grid>
          {pulse.signals.map((signal) => (
            <Signal key={signal.id} $tone={signal.tone}>
              <span>{signal.label}</span>
              <b>{signal.value}</b>
              <small>{signal.detail}</small>
            </Signal>
          ))}
        </Grid>
      ) : failed ? (
        <Muted>Показатели не загрузились. Попробую снова через минуту.</Muted>
      ) : (
        <Grid>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} $height={92} />
          ))}
        </Grid>
      )}
    </Panel>
  );
};
