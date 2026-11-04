"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import { css, styled } from "styled-components";

import { trackCtaClick } from "@/lib/mixpanel-analytics";

import { TariffOptionsBox } from "./page.styles";

/* Where the two tariff cards stop sitting side by side (TariffOptionsBox). */
const STACK_BELOW = 920;

export type TariffTab = {
  key: string;
  label: string;
  /** Small pill over the card ("Popular"); also outlines the card. */
  badge?: string;
  panel: ReactNode;
};

type TariffTabsProps = {
  tabs: TariffTab[];
  defaultKey?: string;
  ariaLabel: string;
};

const TabsBar = styled.div`
  display: none;

  @media (max-width: ${STACK_BELOW}px) {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
    padding: 4px;
    box-sizing: border-box;
    border-radius: var(--radius-pill);
    background: rgba(0, 0, 0, 0.06);
  }
`;

const TabButton = styled.button<{ $isActive: boolean }>`
  appearance: none;
  border: 0;
  margin: 0;
  min-height: 44px;
  border-radius: var(--radius-pill);
  font: inherit;
  font-size: var(--text-body-sm);
  font-weight: 500;
  color: ${({ $isActive }) => ($isActive ? "var(--ink)" : "var(--ink-muted)")};
  background: ${({ $isActive }) => ($isActive ? "var(--surface)" : "transparent")};
  box-shadow: ${({ $isActive }) => ($isActive ? "0 2px 8px rgba(0, 0, 0, 0.08)" : "none")};
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color var(--motion-base, 220ms) var(--ease-standard, ease),
    color var(--motion-base, 220ms) var(--ease-standard, ease),
    box-shadow var(--motion-base, 220ms) var(--ease-standard, ease);

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Panel = styled.div<{ $isActive: boolean; $isHighlighted: boolean }>`
  position: relative;
  display: flex;
  min-width: 0;

  & > .courseCardContainer {
    flex: 1;
  }

  ${({ $isHighlighted }) =>
    $isHighlighted &&
    css`
      & > .courseCardContainer {
        outline: 2px solid var(--brand);
        outline-offset: -2px;
      }
    `}

  @media (max-width: ${STACK_BELOW}px) {
    display: ${({ $isActive }) => ($isActive ? "flex" : "none")};
    justify-content: center;

    & > .courseCardContainer {
      flex: 0 1 720px;
    }
  }
`;

const Badge = styled.span`
  position: absolute;
  top: 0;
  left: 50%;
  /* Above the card, which sits at z-index 20 (CourseCard). */
  z-index: 21;
  transform: translate(-50%, -50%);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: var(--brand);
  color: var(--ink-inverse);
  font-size: var(--text-caption);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
`;

/**
 * Online Group tariffs. Side by side on wide screens; where the cards would
 * stack (phones, tablets) a Standard | Plus switch shows one card at a time,
 * so the two can be compared in place instead of from memory. Both cards are
 * always in the HTML (purchase links, sticky-CTA anchors and tests see them);
 * the switch only hides the inactive one, from the server render on.
 */
export default function TariffTabs({ ariaLabel, defaultKey, tabs }: TariffTabsProps) {
  const baseId = useId();
  const [activeKey, setActiveKey] = useState(defaultKey ?? tabs[0]?.key);
  const [isStacked, setIsStacked] = useState(false);
  const hasSwitch = tabs.length > 1;

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${STACK_BELOW}px)`);
    const sync = () => setIsStacked(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const select = (key: string) => {
    if (key === activeKey) return;
    setActiveKey(key);
    void trackCtaClick({
      id: "select_tariff_tab",
      placement: `online_group_tariffs:${key}`,
    });
  };

  const asTabs = hasSwitch && isStacked;

  return (
    <>
      {hasSwitch && (
        <TabsBar role={asTabs ? "tablist" : undefined} aria-label={ariaLabel}>
          {tabs.map(({ key, label }) => (
            <TabButton
              key={key}
              type="button"
              id={`${baseId}-tab-${key}`}
              role={asTabs ? "tab" : undefined}
              aria-selected={asTabs ? activeKey === key : undefined}
              aria-controls={asTabs ? `${baseId}-panel-${key}` : undefined}
              $isActive={activeKey === key}
              onClick={() => select(key)}
            >
              {label}
            </TabButton>
          ))}
        </TabsBar>
      )}
      <TariffOptionsBox>
        {tabs.map(({ badge, key, panel }) => (
          <Panel
            key={key}
            id={`${baseId}-panel-${key}`}
            role={asTabs ? "tabpanel" : undefined}
            aria-labelledby={asTabs ? `${baseId}-tab-${key}` : undefined}
            $isActive={!hasSwitch || activeKey === key}
            $isHighlighted={Boolean(badge)}
          >
            {badge && <Badge>{badge}</Badge>}
            {panel}
          </Panel>
        ))}
      </TariffOptionsBox>
    </>
  );
}
