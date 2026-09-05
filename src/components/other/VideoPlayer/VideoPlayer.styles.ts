import styled, { keyframes } from "styled-components";

import { Ring } from "@/components/common/Spinner/Spinner.styles";
import { glass } from "@/styles/mixins/glass";

type VideoWrapProps = {
  $maxWidth: string;
  $width: string;
  $height: string;
  $aspectRatio: string;
  $radius: string;
  $buttonSize: string;
  $iconSize: string;
};

const playIconBreathe = keyframes`
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.55;
    transform: scale(0.92);
  }
`;

export const CenterButton = styled.button<{ $isPlaying: boolean }>`
  ${glass({
    variant: "control",
    radius: "var(--radius-slab)",
    bgParam: "rgba(255, 255, 255, 0.3)",
    frostPx: 10,
    depth: 45,
  })}

  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 20;

  width: var(--vp-button-size);
  height: var(--vp-button-size);
  border: none;

  display: grid;
  place-items: center;

  cursor: pointer;

  /* glass() transitions only background-color/box-shadow on the same tokens;
     the button adds opacity/transform on top, so it restates the whole list
     (as Button.styles.ts does) - a partial list would drop the glass fill's
     easing and snap it while the shadow still eased. */
  transition:
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-fast, 160ms) var(--ease-standard, ease),
    background-color var(--motion-base, 220ms) var(--ease-standard, ease),
    box-shadow var(--motion-base, 220ms) var(--ease-standard, ease);

  svg {
    width: var(--vp-icon-size);
    height: var(--vp-icon-size);
  }

  opacity: ${({ $isPlaying }) => ($isPlaying ? 0 : 1)};
  pointer-events: ${({ $isPlaying }) => ($isPlaying ? "none" : "auto")};

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: translate(-50%, -50%) scale(1.03);
    }
  }

  @media (hover: none) and (pointer: coarse) {
    &:active {
      opacity: 0.9;
    }
  }

  /* Focus is no longer thrown away after a click, so the ring has to be
     right: :focus-visible keeps it off for mouse and touch, and while the
     video plays a keyboard-focused button stays in view for its toggle. */
  &:focus-visible {
    opacity: 1;
    pointer-events: auto;
    outline: var(--focus-ring);
    outline-offset: 3px;
  }

  /* Disabled only while the player library is still loading: read as
     "getting ready", not "broken" - full presence, a waiting cursor and a slow
     breathing icon instead of a greyed-out button. */
  &:disabled {
    cursor: progress;
    opacity: 0.9;
    transform: translate(-50%, -50%);

    svg {
      animation: ${playIconBreathe} 1.4s ease-in-out infinite;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &:disabled:hover {
      transform: translate(-50%, -50%);
    }
  }
`;

/**
 * The site's loading ring (components/common/Spinner) in the play button's
 * place while the media has been asked to play but has not rendered a frame
 * yet. Sized on the ring itself: it declares its own 20px defaults at element
 * level, so variables set on an ancestor would be ignored. Centred with
 * margins rather than a transform - the ring's spin owns `transform`.
 */
export const BufferingRing = styled(Ring)<{ $isVisible: boolean }>`
  --spinner-size: 28px;
  --spinner-stroke: 2px;
  --spinner-dot: 5px;
  --spinner-orbit: 13px;

  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 15;
  margin: calc(var(--spinner-size) / -2) 0 0 calc(var(--spinner-size) / -2);
  color: var(--ink-inverse);
  filter: drop-shadow(0 1px 2px rgba(7, 10, 16, 0.45));
  pointer-events: none;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  /* One beat of grace before it shows, so a clip that starts at once never
     flashes it; it leaves without delay. */
  transition: opacity var(--motion-fast, 160ms) var(--ease-standard, ease)
    ${({ $isVisible }) => ($isVisible ? "var(--motion-fast, 160ms)" : "0ms")};
`;

export const VideoWrap = styled.div<VideoWrapProps>`
  width: ${({ $width }) => $width};
  /* "auto" leaves the height to the aspect ratio; a percentage fills a taller
     parent instead - Chromium stretches a flex item past its ratio on its own,
     WebKit does not. */
  height: ${({ $height }) => $height};
  max-width: ${({ $maxWidth }) => $maxWidth};
  position: relative;
  margin: 0 auto;
  overflow: hidden;
  border-radius: ${({ $radius }) => $radius};
  aspect-ratio: ${({ $aspectRatio }) => $aspectRatio};
  --vp-button-size: ${({ $buttonSize }) => $buttonSize};
  --vp-icon-size: ${({ $iconSize }) => $iconSize};

  .plyr,
  .plyr__video-wrapper,
  .plyr__video-embed,
  .plyr__video-embed iframe,
  video {
    border-radius: ${({ $radius }) => $radius};
  }

  .plyr,
  .plyr__video-wrapper {
    width: 100%;
    height: 100%;
  }

  .plyr__video-wrapper {
    position: relative;
    padding-bottom: 0 !important;
  }

  video {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .instagram-fallback {
    width: 100%;
    height: 100%;
    display: block;
    background: var(--ink);
    border-radius: ${({ $radius }) => $radius};
  }

  .plyr__video-embed,
  .plyr__video-embed iframe {
    width: 100%;
    height: 100%;
  }

  .plyr__video-embed {
    position: absolute;
    inset: 0;
  }

  .plyr__video-embed iframe {
    position: absolute;
    inset: 0;
  }

  /* скрываем встроенную оверлей кнопку */
  .plyr__control--overlaid {
    display: none !important;
  }

  /* скрываем ВСЕ штатные контролы */
  .plyr__controls,
  .plyr__progress,
  .plyr__time,
  .plyr__control {
    display: none !important;
  }

  .plyr__poster {
    top: unset !important;
    left: unset !important;
    right: unset !important;
    bottom: unset !important;
  }
`;

export const PosterOverlay = styled.div<{ $src: string; $isVisible: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 5;
  background-image: url(${({ $src }) => $src});
  background-position: center;
  background-size: cover;
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  pointer-events: none;
`;
