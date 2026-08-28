import type { ComponentType, ReactNode } from "react";

import IconTextCard, { type IconTextPanelProps } from "@/components/cards/IconTextCard";

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
};

/** "What you get" block: a sticky title next to a column of icon + text panels. */
export default function SuggestionGrid({
  components: { Cards, Section, Title },
  id,
  items,
  title,
}: SuggestionGridProps) {
  return (
    <Section id={id}>
      <Title>{title}</Title>
      <Cards>
        {items.map(({ id: itemId, ...suggestion }) => (
          <IconTextCard key={itemId} {...suggestion} />
        ))}
      </Cards>
    </Section>
  );
}
