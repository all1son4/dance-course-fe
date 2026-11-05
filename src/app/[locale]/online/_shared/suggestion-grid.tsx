import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ComponentType, ReactNode } from "react";

import type { IconTextPanelProps } from "@/components/cards/IconTextCard";
import SuggestionTiles from "@/components/cards/SuggestionTiles";
import { imageFadeProps } from "@/lib/reveal";

import {
  SuggestionPair,
  SuggestionPhotoBox,
  SuggestionPhotoSlot,
  SuggestionSide,
} from "./section.styles";

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
  /**
   * Widest viewport (px) at which the page stacks the title above the cards;
   * from there down the items become a tap-to-open grid. Matches the page's
   * own section breakpoint (880 on choreo, 920 on the course pages).
   */
  compactBelow?: 880 | 920;
  /** Wide screens only: a photo under the title, filling the empty half. */
  photo?: string;
};

/**
 * "What you get" block: a sticky title next to a column of icon + text
 * panels; on narrower screens a title above a grid of tiles that open on tap.
 */
export default async function SuggestionGrid({
  compactBelow = 880,
  components: { Cards, Section, Title },
  id,
  items,
  photo,
  title,
}: SuggestionGridProps) {
  const commonT = await getTranslations("Common");

  return (
    <Section id={id}>
      {photo ? (
        <SuggestionSide $compactBelow={compactBelow}>
          <SuggestionPair $compactBelow={compactBelow}>
            <Title>{title}</Title>
            <SuggestionPhotoSlot $compactBelow={compactBelow}>
              <SuggestionPhotoBox>
                <Image
                  {...imageFadeProps}
                  src={photo}
                  alt=""
                  fill
                  sizes={`(max-width: ${compactBelow}px) 0px, (max-width: 1240px) 360px, 420px`}
                />
              </SuggestionPhotoBox>
            </SuggestionPhotoSlot>
          </SuggestionPair>
        </SuggestionSide>
      ) : (
        <Title>{title}</Title>
      )}
      <Cards>
        <SuggestionTiles
          closeLabel={commonT("close")}
          hintLabel={commonT("tapToReadMore")}
          compactBelow={compactBelow}
          items={items}
        />
      </Cards>
    </Section>
  );
}
