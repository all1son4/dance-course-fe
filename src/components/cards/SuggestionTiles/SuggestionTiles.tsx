"use client";

import {
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { PanelText } from "@/components/cards/IconTextCard/IconTextCard.styles";

import {
  DetailCaret,
  DetailClip,
  DetailClose,
  DetailContent,
  DetailHeader,
  DetailPanel,
  DetailRow,
  DetailStack,
  DetailTitle,
  TapHint,
  Tile,
  TileBody,
  TileButton,
  TileHeading,
  TileIcon,
  TileMark,
  TilesGrid,
  TileTitle,
} from "./SuggestionTiles.styles";

export type SuggestionTileItem = {
  id: number | string;
  icon?: ReactNode;
  title?: ReactNode;
  text?: ReactNode;
};

type SuggestionTilesProps = {
  items: SuggestionTileItem[];
  /** Widest viewport (px) that gets the compact, tap-to-open grid. */
  compactBelow: number;
  /** Close button label in the detail panel. */
  closeLabel?: string;
  /** One-time nudge shown at the first tile's "+" ("Tap to read more"). */
  hintLabel?: string;
};

type TileRow = { index: number; keys: string[] };

const SINGLE_COLUMN_QUERY = "(max-width: 360px)";
/* The tap hint: after the grid has been in view this long without a tap it
   appears once per visit (session storage), then fades away on its own or
   on any tap. */
const HINT_DELAY_MS = 2000;
const HINT_VISIBLE_MS = 4000;
const HINT_SEEN_KEY = "suggestion-tiles-hint-seen";

const hasSeenHint = () => {
  try {
    return window.sessionStorage.getItem(HINT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

const rememberHint = () => {
  try {
    window.sessionStorage.setItem(HINT_SEEN_KEY, "1");
  } catch {
    // Storage blocked: the hint may show again on another page; harmless.
  }
};
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/* Matches OPEN_MS / EASE in the styles. */
const RESIZE_MS = 420;
const RESIZE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/* Space kept above an opened tile when the page scrolls the panel into view
   (the fixed header pill sits there). */
const TOP_CLEARANCE_PX = 110;

const buildRows = (keys: string[], columns: number): TileRow[] => {
  const rows: TileRow[] = [];
  for (let start = 0; start < keys.length; start += columns) {
    rows.push({ index: rows.length, keys: keys.slice(start, start + columns) });
  }
  return rows;
};

/**
 * "What you get" items: a glass column on wide screens, a grid of icon +
 * title tiles below `compactBelow`. Tapping a tile opens a full-width panel
 * with its text right under the tile's row; tiles never move sideways, the
 * rows below just slide down. Choosing the other tile of the same row keeps
 * the panel open, slides its caret across and eases the height to the new
 * text; choosing a tile in another row closes one panel while the other opens.
 */
export default function SuggestionTiles({
  closeLabel = "Close",
  hintLabel,
  compactBelow,
  items,
}: SuggestionTilesProps) {
  const baseId = useId();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [isHintVisible, setIsHintVisible] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const hasTapped = useRef(false);
  const [isCompact, setIsCompact] = useState(false);
  const [columns, setColumns] = useState(2);
  // What each row's panel last showed, so a closing panel keeps its text
  // while it folds away.
  const [rowContent, setRowContent] = useState<Record<number, string>>({});
  const clipRefs = useRef(new Map<number, HTMLDivElement>());
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingResize = useRef<{ row: number; height: number } | null>(null);
  // The text that is fading out on a same-row switch.
  const [leaving, setLeaving] = useState<{ row: number; key: string } | null>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const scrollTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const compactQuery = window.matchMedia(`(max-width: ${compactBelow}px)`);
    const singleQuery = window.matchMedia(SINGLE_COLUMN_QUERY);
    const sync = () => {
      setIsCompact(compactQuery.matches);
      setColumns(singleQuery.matches ? 1 : 2);
      if (!compactQuery.matches) setOpenKey(null);
    };

    sync();
    compactQuery.addEventListener("change", sync);
    singleQuery.addEventListener("change", sync);
    return () => {
      compactQuery.removeEventListener("change", sync);
      singleQuery.removeEventListener("change", sync);
      window.clearTimeout(scrollTimer.current);
      window.clearTimeout(leaveTimer.current);
    };
  }, [compactBelow]);

  const keys = items.map(({ id }) => String(id));
  const rows = buildRows(keys, columns);
  const rowOf = (key: string) => rows.find((row) => row.keys.includes(key))?.index ?? -1;
  const itemByKey = new Map(items.map((item) => [String(item.id), item]));
  const openRow = openKey ? rowOf(openKey) : -1;

  // Same-row switch: the panel stays open but its text changes, so ease its
  // height from the old text to the new one.
  useLayoutEffect(() => {
    const pending = pendingResize.current;
    pendingResize.current = null;
    if (!pending) return;

    const clip = clipRefs.current.get(pending.row);
    if (!clip) return;
    const next = clip.getBoundingClientRect().height;
    if (Math.abs(next - pending.height) < 1) return;

    clip.animate([{ height: `${pending.height}px` }, { height: `${next}px` }], {
      duration: RESIZE_MS,
      easing: RESIZE_EASING,
    });
  }, [openKey]);

  const revealPanel = (key: string) => {
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const clip = clipRefs.current.get(rowOf(key));
      const button = buttonRefs.current.get(key);
      if (!clip || !button) return;

      const overflow = clip.getBoundingClientRect().bottom - window.innerHeight + 16;
      const room = button.getBoundingClientRect().top - TOP_CLEARANCE_PX;
      const distance = Math.min(overflow, room);
      if (distance > 0) {
        window.scrollBy({
          top: distance,
          behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth",
        });
      }
    }, RESIZE_MS);
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!hintLabel || !isCompact || !grid || hasSeenHint()) return;

    let showTimer: number | undefined;
    let hideTimer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(showTimer);
        if (!entry?.isIntersecting) return;
        showTimer = window.setTimeout(() => {
          if (hasTapped.current || hasSeenHint()) return;
          rememberHint();
          setIsHintVisible(true);
          hideTimer = window.setTimeout(() => setIsHintVisible(false), HINT_VISIBLE_MS);
          observer.disconnect();
        }, HINT_DELAY_MS);
      },
      // Most of the grid on screen, not just its edge scrolling past.
      { threshold: 0.5 },
    );

    observer.observe(grid);
    return () => {
      observer.disconnect();
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [hintLabel, isCompact]);

  const toggle = (key: string) => {
    if (!isCompact) return;
    hasTapped.current = true;
    setIsHintVisible(false);

    if (openKey === key) {
      setOpenKey(null);
      return;
    }

    const row = rowOf(key);
    if (openKey && openRow === row && !window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      const clip = clipRefs.current.get(row);
      if (clip)
        pendingResize.current = { row, height: clip.getBoundingClientRect().height };
      setLeaving({ row, key: openKey });
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => setLeaving(null), RESIZE_MS);
    }

    setRowContent((current) => ({ ...current, [row]: key }));
    setOpenKey(key);
    revealPanel(key);
  };

  const close = () => {
    const key = openKey;
    setOpenKey(null);
    if (key) buttonRefs.current.get(key)?.focus();
  };

  const renderDetail = (key: string, withClose: boolean) => {
    const item = itemByKey.get(key);
    return (
      <>
        <DetailHeader>
          <span aria-hidden>{item?.icon}</span>
          <DetailTitle>{item?.title}</DetailTitle>
          {withClose ? (
            <DetailClose type="button" aria-label={closeLabel} onClick={close}>
              <span aria-hidden />
            </DetailClose>
          ) : (
            <span />
          )}
        </DetailHeader>
        <PanelText>{item?.text}</PanelText>
      </>
    );
  };

  // The bubble opens leftwards from a "+", so it sits on the right-hand tile
  // of the first row, where it has the whole row width to use.
  const hintKey = columns > 1 && keys.length > 1 ? keys[1] : keys[0];

  const loneKey =
    columns > 1 && keys.length % columns === 1 ? keys[keys.length - 1] : undefined;

  return (
    <TilesGrid ref={gridRef} $compactBelow={compactBelow}>
      {rows.map((row) => {
        const isRowOpen = isCompact && openRow === row.index;
        const shownKey = isRowOpen ? openKey : rowContent[row.index];
        const shown = shownKey ? itemByKey.get(shownKey) : undefined;
        const column = shownKey ? row.keys.indexOf(shownKey) : 0;
        const caretAt = row.keys.length === 1 ? 50 : ((column + 0.5) / columns) * 100;
        const panelId = `${baseId}-row-${row.index}`;

        return (
          <Fragment key={row.index}>
            {row.keys.map((key) => {
              const item = itemByKey.get(key);
              const isOpen = isCompact && openKey === key;

              return (
                <Tile key={key} $compactBelow={compactBelow} $isFullRow={key === loneKey}>
                  <TileHeading $compactBelow={compactBelow}>
                    <TileButton
                      ref={(node) => {
                        if (node) buttonRefs.current.set(key, node);
                        else buttonRefs.current.delete(key);
                      }}
                      type="button"
                      id={`${baseId}-tile-${key}`}
                      $compactBelow={compactBelow}
                      $isOpen={isOpen}
                      onClick={() => toggle(key)}
                      tabIndex={isCompact ? undefined : -1}
                      aria-expanded={isCompact ? isOpen : undefined}
                      aria-controls={isCompact ? panelId : undefined}
                    >
                      <TileIcon $compactBelow={compactBelow}>{item?.icon}</TileIcon>
                      <TileTitle $compactBelow={compactBelow}>{item?.title}</TileTitle>
                      {isCompact && (
                        <TileMark
                          aria-hidden
                          $isOpen={isOpen}
                          $isNudging={isHintVisible && key === hintKey}
                        />
                      )}
                    </TileButton>
                  </TileHeading>
                  {hintLabel && key === hintKey && isCompact && (
                    <TapHint role="status" $isVisible={isHintVisible}>
                      {isHintVisible ? hintLabel : ""}
                    </TapHint>
                  )}
                  <TileBody $compactBelow={compactBelow}>
                    <PanelText>{item?.text}</PanelText>
                  </TileBody>
                </Tile>
              );
            })}
            <DetailRow
              $compactBelow={compactBelow}
              $isOpen={isRowOpen}
              id={panelId}
              role={isCompact ? "region" : undefined}
              aria-labelledby={shownKey ? `${baseId}-tile-${shownKey}` : undefined}
              aria-hidden={isRowOpen ? undefined : true}
              inert={!isRowOpen}
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
              }}
            >
              <DetailClip
                ref={(node) => {
                  if (node) clipRefs.current.set(row.index, node);
                  else clipRefs.current.delete(row.index);
                }}
              >
                {shown && (
                  <DetailPanel $isOpen={isRowOpen}>
                    <DetailCaret aria-hidden $notchAt={caretAt} />
                    <DetailStack>
                      {leaving?.row === row.index && leaving.key !== shownKey && (
                        <DetailContent key={`out-${leaving.key}`} $isLeaving aria-hidden>
                          {renderDetail(leaving.key, false)}
                        </DetailContent>
                      )}
                      {/* Keyed by item: new text plays its entrance again. */}
                      <DetailContent key={shownKey}>
                        {renderDetail(shownKey as string, true)}
                      </DetailContent>
                    </DetailStack>
                  </DetailPanel>
                )}
              </DetailClip>
            </DetailRow>
          </Fragment>
        );
      })}
    </TilesGrid>
  );
}
