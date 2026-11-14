import {
  OnlineCreditCard,
  OnlineGroup,
  OnlineHome,
  OnlineInspiration,
  OnlineMusic,
  OnlineTelegram,
  OnlineVideo,
} from "@/svg";

import {
  buildOnlineSuggestionCards,
  type OnlineSuggestionCard,
  type OnlineSuggestionDefinition,
} from "../_shared/content";

type Translate = (key: string) => string;

const INSPIRATION_HUB_SUGGESTION_DEFINITIONS = [
  {
    id: "lessons",
    icon: OnlineVideo,
    titleKey: "suggestions.1.title",
    textKey: "suggestions.1.text",
  },
  {
    id: "extras",
    icon: OnlineMusic,
    titleKey: "suggestions.2.title",
    textKey: "suggestions.2.text",
  },
  {
    id: "telegram",
    icon: OnlineTelegram,
    titleKey: "suggestions.3.title",
    textKey: "suggestions.3.text",
  },
  {
    id: "member-price",
    icon: OnlineCreditCard,
    titleKey: "suggestions.4.title",
    textKey: "suggestions.4.text",
  },
] satisfies readonly OnlineSuggestionDefinition[];

export const getInspirationHubSuggestions = (t: Translate): OnlineSuggestionCard[] =>
  buildOnlineSuggestionCards({
    definitions: INSPIRATION_HUB_SUGGESTION_DEFINITIONS,
    t,
  });

/** Lesson topics shown as pills (`topics.items.N`). */
export const HUB_TOPIC_COUNT = 8;

/** «Кому подойдёт»: one icon per card, texts in `audience.items.N`. */
export const HUB_AUDIENCE = [
  { id: "group", icon: OnlineGroup },
  { id: "more-often", icon: OnlineHome },
  { id: "inspiration", icon: OnlineInspiration },
] as const;
