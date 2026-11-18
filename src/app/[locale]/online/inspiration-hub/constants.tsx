import { OnlineCalendar, OnlineCreditCard, OnlineTelegram, OnlineVideo } from "@/svg";

/**
 * The directions the library covers (`inside.topics.N`), shown without numbers:
 * numbered rows read as a list of lessons to count.
 */
export const HUB_TOPIC_COUNT = 6;

/** Anna's other four cards (`inside.features.N`), one icon each. */
export const HUB_FEATURES = [
  { id: "extras", icon: OnlineVideo, highlight: false },
  { id: "own-pace", icon: OnlineCalendar, highlight: false },
  { id: "telegram", icon: OnlineTelegram, highlight: false },
  // The renewal price card stands out a little: members look for it.
  { id: "no-pause", icon: OnlineCreditCard, highlight: true },
] as const;

/** What the price buys, listed in the closing offer (`cta.items.N`). */
export const HUB_VALUE_COUNT = 4;
