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
