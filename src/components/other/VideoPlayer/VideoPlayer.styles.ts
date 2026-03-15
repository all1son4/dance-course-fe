import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

type VideoWrapProps = {
  $maxWidth: string;
  $width: string;
  $aspectRatio: string;
  $radius: string;
  $buttonSize: string;
  $iconSize: string;
};

export const CenterButton = styled.button<{ $isPlaying: boolean }>`
  ${glass({
    radius: "100px",
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

  transition:
    opacity 160ms ease,
    transform 160ms ease,
    box-shadow 200ms ease;

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

  &:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
    transform: translate(-50%, -50%);
  }

  @media (hover: hover) and (pointer: fine) {
    &:disabled:hover {
      transform: translate(-50%, -50%);
    }
  }
`;

export const VideoWrap = styled.div<VideoWrapProps>`
  width: ${({ $width }) => $width};
  height: auto;
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
    background: #000;
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
  transition: opacity 220ms ease;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  pointer-events: none;
`;
