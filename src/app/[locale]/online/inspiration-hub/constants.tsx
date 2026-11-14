import { OnlineCalendar, OnlineCreditCard, OnlineTelegram, OnlineVideo } from "@/svg";

/** What the lessons cover, from Anna's first card (`inside.topics.N`). */
export const HUB_TOPIC_COUNT = 7;

/** Anna's other four cards (`inside.features.N`), one icon each. */
export const HUB_FEATURES = [
  { id: "extras", icon: OnlineVideo },
  { id: "own-pace", icon: OnlineCalendar },
  { id: "telegram", icon: OnlineTelegram },
  { id: "no-pause", icon: OnlineCreditCard },
] as const;

/** What the price buys, listed in the closing offer (`cta.items.N`). */
export const HUB_VALUE_COUNT = 4;
