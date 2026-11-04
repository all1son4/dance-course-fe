import { getTranslations } from "next-intl/server";
import type { ComponentType, ReactNode } from "react";

import type { IconTextPanelProps } from "@/components/cards/IconTextCard";
import SuggestionTiles from "@/components/cards/SuggestionTiles";

type SuggestionItem = IconTextPanelProps & { id: number | string };

type SuggestionGridProps = {
  /** The page's section/title/cards trio (layouts differ per page). */
  components: {
    Section: ComponentType<{ id?: string; children?: ReactNode }>;
    Title: ComponentType<{ children?: ReactNode }>;
    Cards: ComponentType<{ children?: ReactNode }>;
  };
  id?: string;
  title: ReactNode;
  items: SuggestionItem[];
  /**
   * Widest viewport (px) at which the page stacks the title above the cards;
   * from there down the items become a tap-to-open grid. Matches the page's
   * own section breakpoint (880 on choreo, 920 on the course pages).
   */
  compactBelow?: 880 | 920;
};

/**
 * "What you get" block: a sticky title next to a column of icon + text
 * panels; on narrower screens a title above a grid of tiles that open on tap.
 */
export default async function SuggestionGrid({
  compactBelow = 880,
  components: { Cards, Section, Title },
  id,
  items,
  title,
}: SuggestionGridProps) {
  const commonT = await getTranslations("Common");

  return (
    <Section id={id}>
      <Title>{title}</Title>
      <Cards>
        <SuggestionTiles
          closeLabel={commonT("close")}
          compactBelow={compactBelow}
          items={items}
        />
      </Cards>
    </Section>
  );
}
