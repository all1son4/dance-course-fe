import {
  OnlineCalendar,
  OnlineGroup,
  OnlineHome,
  OnlineTelegram,
  OnlineVideo,
} from "@/svg";

import {
  buildOnlineSuggestionCards,
  type OnlineSuggestionCard,
  type OnlineSuggestionDefinition,
} from "../_shared/content";

type Translate = (key: string) => string;

const FIRST_TOUCH_SUGGESTION_DEFINITIONS = [
  {
    id: "group",
    icon: OnlineGroup,
    titleKey: "suggestions.1.title",
    textKey: "suggestions.1.text",
  },
  {
    id: "home",
    icon: OnlineHome,
    titleKey: "suggestions.2.title",
    textKey: "suggestions.2.text",
  },
  {
    id: "video",
    icon: OnlineVideo,
    titleKey: "suggestions.3.title",
    textKey: "suggestions.3.text",
  },
  {
    id: "calendar",
    icon: OnlineCalendar,
    titleKey: "suggestions.4.title",
    textKey: "suggestions.4.text",
  },
  {
    id: "telegram",
    icon: OnlineTelegram,
    titleKey: "suggestions.5.title",
    textKey: "suggestions.5.text",
  },
] satisfies readonly OnlineSuggestionDefinition[];

export const getFirstTouchSuggestions = (t: Translate): OnlineSuggestionCard[] =>
  buildOnlineSuggestionCards({
    definitions: FIRST_TOUCH_SUGGESTION_DEFINITIONS,
    t,
  });
