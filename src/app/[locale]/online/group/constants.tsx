import {
  OnlineCalendar,
  OnlineCreditCard,
  OnlineGroup,
  OnlineHome,
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

const ONLINE_GROUP_SUGGESTION_DEFINITIONS = [
  {
    id: "group",
    icon: OnlineGroup,
    titleKey: "suggestions.1.title",
    textKey: "suggestions.1.text",
  },
  {
    id: "new-lessons",
    icon: OnlineVideo,
    titleKey: "suggestions.2.title",
    textKey: "suggestions.2.text",
  },
  {
    id: "homework",
    icon: OnlineHome,
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
    id: "library",
    icon: OnlineStructure,
    titleKey: "suggestions.5.title",
    textKey: "suggestions.5.text",
  },
  {
    id: "telegram",
    icon: OnlineTelegram,
    titleKey: "suggestions.6.title",
    textKey: "suggestions.6.text",
  },
  {
    id: "non-pause",
    icon: OnlineCreditCard,
    titleKey: "suggestions.7.title",
    textKey: "suggestions.7.text",
  },
] satisfies readonly OnlineSuggestionDefinition[];

export const getOnlineSuggestions = (t: Translate): OnlineSuggestionCard[] =>
  buildOnlineSuggestionCards({
    definitions: ONLINE_GROUP_SUGGESTION_DEFINITIONS,
    t,
  });
