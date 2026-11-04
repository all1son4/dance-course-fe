"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { PanelText } from "@/components/cards/IconTextCard/IconTextCard.styles";

import {
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
};

const MOVE_DURATION_MS = 360;
const MOVE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** `view-transition-class` of every tile; the morph is styled in globals.css. */
const TILE_TRANSITION_CLASS = "suggestion-tile";
/** On <html> while tiles morph: the page around them switches without a fade. */
const MORPHING_ROOT_CLASS = "tiles-morphing";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/**
 * "What you get" items: a glass column on wide screens, a two-column grid of
 * icon + title tiles below `compactBelow`. Tapping a tile opens it across the
 * row (one at a time) and the neighbours glide to their new places.
 *
 * Where the browser has view transitions every tile morphs - position and
 * size together - from its old box to its new one, the content cross-fading
 * inside a clipped, rounded box (globals.css, "Tap-to-open tiles"). Elsewhere
 * a transform-only FLIP moves the tiles and CSS grows the opened text.
 */
export default function SuggestionTiles({ compactBelow, items }: SuggestionTilesProps) {
  const baseId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef<Map<string, DOMRect> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const [canMorph, setCanMorph] = useState(false);
  const transitionPrefix = `st${baseId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    setCanMorph(
      typeof (document as ViewTransitionDocument).startViewTransition === "function",
    );
  }, []);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${compactBelow}px)`);
    const sync = () => {
      setIsCompact(query.matches);
      if (!query.matches) setOpenId(null);
    };

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [compactBelow]);

  useLayoutEffect(() => {
    const before = previousRects.current;
    const grid = gridRef.current;
    previousRects.current = null;
    if (!before || !grid) return;

    for (const tile of Array.from(grid.children) as HTMLElement[]) {
      const previous = before.get(tile.dataset.tileId ?? "");
      if (!previous) continue;

      const next = tile.getBoundingClientRect();
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      tile.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        {
          duration: MOVE_DURATION_MS,
          easing: MOVE_EASING,
        },
      );
    }
  }, [openId]);

  const toggle = (id: string) => {
    if (!isCompact) return;

    const next = (current: string | null) => (current === id ? null : id);
    const grid = gridRef.current;
    const reduceMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
    const doc = document as ViewTransitionDocument;

    if (grid && !reduceMotion && canMorph && doc.startViewTransition) {
      const tiles = Array.from(grid.children) as HTMLElement[];
      tiles.forEach((tile, index) => {
        tile.style.setProperty("view-transition-name", `${transitionPrefix}-${index}`);
        tile.style.setProperty("view-transition-class", TILE_TRANSITION_CLASS);
      });
      document.documentElement.classList.add(MORPHING_ROOT_CLASS);
      const transition = doc.startViewTransition(() => {
        flushSync(() => setOpenId(next));
      });
      void transition.finished.finally(() => {
        document.documentElement.classList.remove(MORPHING_ROOT_CLASS);
        tiles.forEach((tile) => {
          tile.style.removeProperty("view-transition-name");
          tile.style.removeProperty("view-transition-class");
        });
      });
      return;
    }

    if (grid && !reduceMotion) {
      previousRects.current = new Map(
        (Array.from(grid.children) as HTMLElement[]).map((tile) => [
          tile.dataset.tileId ?? "",
          tile.getBoundingClientRect(),
        ]),
      );
    }

    setOpenId(next);
  };

  // Closed tiles pair up two per row; with an odd count the last one would
  // sit alone, so it takes the full row instead (dense flow keeps the order).
  const closedKeys = items
    .map(({ id }) => String(id))
    .filter((key) => !(isCompact && openId === key));
  const loneKey = closedKeys.length % 2 === 1 ? closedKeys.at(-1) : undefined;

  return (
    <TilesGrid ref={gridRef} $compactBelow={compactBelow}>
      {items.map(({ icon, id, text, title }) => {
        const key = String(id);
        const isOpen = isCompact && openId === key;
        const bodyId = `${baseId}-${key}`;

        return (
          <Tile
            key={key}
            data-tile-id={key}
            $compactBelow={compactBelow}
            $isFullRow={isOpen || key === loneKey}
          >
            <TileHeading $compactBelow={compactBelow}>
              <TileButton
                type="button"
                $compactBelow={compactBelow}
                onClick={() => toggle(key)}
                tabIndex={isCompact ? undefined : -1}
                aria-expanded={isCompact ? isOpen : undefined}
                aria-controls={isCompact ? bodyId : undefined}
              >
                <TileIcon $compactBelow={compactBelow}>{icon}</TileIcon>
                <TileTitle $compactBelow={compactBelow}>{title}</TileTitle>
              </TileButton>
            </TileHeading>
            <TileMark aria-hidden $compactBelow={compactBelow} $isOpen={isOpen} />
            <TileBody
              id={bodyId}
              $compactBelow={compactBelow}
              $isOpen={isOpen}
              $isInstant={canMorph}
              aria-hidden={isCompact && !isOpen ? true : undefined}
            >
              <div>
                <div>
                  <PanelText>{text}</PanelText>
                </div>
              </div>
            </TileBody>
          </Tile>
        );
      })}
    </TilesGrid>
  );
}
