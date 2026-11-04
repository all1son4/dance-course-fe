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
    /* Fade in like a focus pull (soft blur and a hair of zoom settling), fade
       out a little quicker; PREVIEW_CLIP_FADE_OUT_MS mirrors the 480ms. */
    filter: ${({ $isVisible }) => ($isVisible ? "blur(0)" : "blur(8px)")};
    transform: ${({ $isVisible }) => ($isVisible ? "scale(1)" : "scale(1.04)")};
    transition: ${({ $isVisible }) =>
      $isVisible
        ? "opacity 720ms cubic-bezier(0.22, 1, 0.36, 1), filter 900ms cubic-bezier(0.22, 1, 0.36, 1), transform 1100ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "opacity 480ms ease, filter 480ms ease, transform 480ms ease"};

    @media (prefers-reduced-motion: reduce) {
      filter: none;
      transform: none;
      transition: none;
    }
  }
`;
