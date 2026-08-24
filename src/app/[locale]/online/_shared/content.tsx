import type { ComponentType, ReactNode } from "react";

import type { TextContentCardProps } from "@/components/cards/TextContentCard";
import type { IIconProps } from "@/types/icons";

type Translate = (key: string) => string;
type RichTranslate = (key: string) => ReactNode;

export type OnlineSuggestionDefinition = {
  id: string;
  icon: ComponentType<IIconProps>;
  titleKey: string;
  textKey: string;
  textResolver?: "plain" | "rich";
};

export type OnlineSuggestionCard = TextContentCardProps & {
  id: string;
};

type BuildOnlineSuggestionCardsOptions = {
  definitions: readonly OnlineSuggestionDefinition[];
  t: Translate;
  tRich?: RichTranslate;
};

export const buildOnlineSuggestionCards = ({
  definitions,
  t,
  tRich,
}: BuildOnlineSuggestionCardsOptions): OnlineSuggestionCard[] =>
  definitions.map(({ icon: Icon, id, textKey, textResolver = "plain", titleKey }) => ({
    id,
    icon: <Icon />,
    title: t(titleKey),
    text: textResolver === "rich" ? (tRich?.(textKey) ?? t(textKey)) : t(textKey),
  }));

/**
 * Messages carry their own markup - a line break in a title, an intro paragraph
 * plus a bulleted list in a card - so the structure stays inside the translation
 * instead of being hard-coded per locale.
 */
type RichTranslator = {
  rich: (
    key: string,
    tags: Record<string, (chunks: ReactNode) => ReactNode>,
  ) => ReactNode;
};

export const createRichText =
  (t: RichTranslator) =>
  (key: string): ReactNode =>
    t.rich(key, {
      br: () => <br />,
      item: (chunks) => <li>{chunks}</li>,
      list: (chunks) => <ul>{chunks}</ul>,
      p: (chunks) => <p>{chunks}</p>,
      strong: (chunks) => <strong>{chunks}</strong>,
    });
