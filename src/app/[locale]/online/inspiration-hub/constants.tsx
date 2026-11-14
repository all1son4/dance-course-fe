import {
  OnlineCalendar,
  OnlineCreditCard,
  OnlineStructure,
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
    id: "programs",
    icon: OnlineStructure,
    titleKey: "suggestions.1.title",
    textKey: "suggestions.1.text",
  },
  {
    id: "materials",
    icon: OnlineVideo,
    titleKey: "suggestions.2.title",
    textKey: "suggestions.2.text",
  },
  {
    id: "own-pace",
    icon: OnlineCalendar,
    titleKey: "suggestions.3.title",
    textKey: "suggestions.3.text",
  },
  {
    id: "telegram",
    icon: OnlineTelegram,
    titleKey: "suggestions.4.title",
    textKey: "suggestions.4.text",
  },
  {
    id: "non-pause",
    icon: OnlineCreditCard,
    titleKey: "suggestions.5.title",
    textKey: "suggestions.5.text",
  },
] satisfies readonly OnlineSuggestionDefinition[];

export const getInspirationHubSuggestions = (t: Translate): OnlineSuggestionCard[] =>
  buildOnlineSuggestionCards({
    definitions: INSPIRATION_HUB_SUGGESTION_DEFINITIONS,
    t,
  });
