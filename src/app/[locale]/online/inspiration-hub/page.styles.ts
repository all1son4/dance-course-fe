import styled from "styled-components";

import { InfoBoxGroup } from "../_shared/section.styles";
import {
  ButtonBox as GroupButtonBox,
  MobileImagesBox as GroupMobileImagesBox,
  Title as GroupTitle,
} from "../group/page.styles";

// The Hub page is laid out like the Online Group page it continues: the same hero,
// button row and "what's inside" grid; the steps come from First Touch.
export {
  CourseProgramImage as StepsImage,
  CourseProgramSection as StepsSection,
  CourseProgramTextBox as StepsTextBox,
  CourseProgramTitle as StepsTitle,
} from "../first-touch/page.styles";
export { ImageBox, IntroductionSection, TextBox } from "../group/page.styles";

/**
 * "Inspiration HUB" never breaks between its two words: one line everywhere, a
 * step smaller on the narrowest phones so it still fits.
 */
export const Title = styled(GroupTitle)`
  max-width: none;
  white-space: nowrap;

  @media (max-width: 380px) {
    font-size: 32px;
  }
`;

/**
 * Access and price side by side, so the hero fits the same height as the group's.
 * Each fact is as wide as its value, so the pair fits the 515px text column of
 * small laptops too. Below 920px the photo slides under the text column, so the
 * facts stack and stay clear of it.
 */
export const FactsRow = styled(InfoBoxGroup)`
  flex-direction: row;
  flex-wrap: wrap;
  column-gap: 60px;

  & > div {
    flex: 0 0 auto;
  }

  @media (max-width: 920px) {
    flex-direction: column;

    & > div {
      flex: none;
    }
  }
`;

/** Two buttons instead of the group's one: on tablets they keep off the photo. */
export const ButtonBox = styled(GroupButtonBox)`
  @media (min-width: 768px) and (max-width: 920px) {
    max-width: 500px;
  }
`;

/** The group page shifts its phone photo left to make room for the icon; here there is none. */
export const MobileImagesBox = styled(GroupMobileImagesBox)`
  @media (max-width: 767px) {
    & #mobile-only-image-box {
      margin-left: 0;
    }

    & #mobile-only-image-box :is(svg, img) {
      width: 100%;
    }
  }
`;
