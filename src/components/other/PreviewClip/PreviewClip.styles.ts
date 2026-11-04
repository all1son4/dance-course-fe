import { styled } from "styled-components";

/**
 * Sits over the poster (VideoPlayer's PosterOverlay is z-index 5) and under
 * the play button (20) and the buffering ring (15). Transparent and invisible
 * until a frame has actually been presented, so the poster is what shows
 * while the clip loads - never a black box.
 */
export const PreviewVideo = styled.video<{ $isVisible: boolean }>`
  /* Doubled class: VideoPlayer's wrap styles every descendant "video". A
     video layer snaps to whole device pixels while the box can end on a
     fraction, so it bleeds 1px past every edge (the box clips it) - otherwise
     a hairline of poster shows along the bottom. */
  && {
    position: absolute;
    inset: -1px;
    z-index: 6;
    width: calc(100% + 2px);
    height: calc(100% + 2px);
    display: block;
    object-fit: cover;
    border-radius: inherit;
    background: transparent;
    pointer-events: none;
    opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
    transition: opacity var(--motion-slow, 320ms) var(--ease-standard, ease);
  }
`;
