"use client";

import type { ReactNode } from "react";

import { StampIn } from "@/components/other/BlackFriday/BlackFridayMotion";

import { CampaignBadge } from "./ChoreoCard.styles";

/** The tutorial card's campaign label, landing like a stamp when first seen. */
export default function ChoreoCampaignBadge({ children }: { children: ReactNode }) {
  return <StampIn as={CampaignBadge}>{children}</StampIn>;
}
