"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  isPreviewClipInView,
  PREVIEW_CLIP_HOVER_QUERY,
  PREVIEW_CLIP_IN_VIEW_THRESHOLDS,
  PREVIEW_CLIP_NEAR_ROOT_MARGIN,
  PREVIEW_CLIP_REDUCED_MOTION_QUERY,
  PREVIEW_CLIP_ROOT_ATTRIBUTE,
  type PreviewClipMode,
  resolvePreviewClipMode,
} from "@/lib/preview-clip";

import { PreviewVideo } from "./PreviewClip.styles";

/** Covers the fade-out (`--motion-slow`) before the clip rewinds to its start. */
const PREVIEW_CLIP_REWIND_DELAY_MS = 360;

type NetworkInformationLike = EventTarget & { saveData?: boolean };
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const getConnection = (): NetworkInformationLike | undefined =>
  (navigator as Navigator & { connection?: NetworkInformationLike }).connection;

const subscribeToEnvironment = (onStoreChange: () => void): (() => void) => {
  const queries = [PREVIEW_CLIP_HOVER_QUERY, PREVIEW_CLIP_REDUCED_MOTION_QUERY].map(
    (query) => window.matchMedia(query),
  );
  const connection = getConnection();

  queries.forEach((query) => query.addEventListener("change", onStoreChange));
  connection?.addEventListener?.("change", onStoreChange);

  return () => {
    queries.forEach((query) => query.removeEventListener("change", onStoreChange));
    connection?.removeEventListener?.("change", onStoreChange);
  };
};

const getModeSnapshot = (): PreviewClipMode =>
  resolvePreviewClipMode({
    canHover: window.matchMedia(PREVIEW_CLIP_HOVER_QUERY).matches,
    prefersReducedMotion: window.matchMedia(PREVIEW_CLIP_REDUCED_MOTION_QUERY).matches,
    saveData: getConnection()?.saveData === true,
  });

/** Nothing is rendered on the server: the clip is a client-only enhancement. */
const getModeServerSnapshot = (): PreviewClipMode => "off";

const getRoot = (video: HTMLVideoElement): Element | null =>
  video.closest(`[${PREVIEW_CLIP_ROOT_ATTRIBUTE}]`) ?? video.parentElement;

type PreviewClipProps = {
  /** Short, silent, looping MP4 - see CHOREO_PRESENTATIONS for where clips live. */
  src: string;
  /** Stops and hides the clip, e.g. while the real video is playing. */
  disabled?: boolean;
};

/**
 * A muted loop over a card's poster: plays while the card is hovered (mouse)
 * or mostly on screen (touch), pauses otherwise. Never fetched before the
 * card comes near the viewport, never under reduced motion or data saver,
 * and only faded in once a frame is really on screen - until then, and
 * whenever anything fails, the poster underneath is what shows. Purely
 * decorative: hidden from assistive tech and from pointer events, so the
 * player's own button keeps doing exactly what it did.
 */
export default function PreviewClip({ src, disabled = false }: PreviewClipProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const environmentMode = useSyncExternalStore(
    subscribeToEnvironment,
    getModeSnapshot,
    getModeServerSnapshot,
  );
  const [hasFailed, setHasFailed] = useState(false);
  const [isNear, setIsNear] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const mode: PreviewClipMode = disabled || hasFailed ? "off" : environmentMode;

  // Set `src` only once the card comes near the viewport. preload="none"
  // keeps even that from downloading anything until playback is asked for.
  useEffect(() => {
    const video = videoRef.current;
    const root = video && getRoot(video);
    if (mode === "off" || isNear || !root) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: PREVIEW_CLIP_NEAR_ROOT_MARGIN },
    );
    observer.observe(root);

    return () => observer.disconnect();
  }, [isNear, mode]);

  useEffect(() => {
    const video = videoRef.current as VideoWithFrameCallback | null;
    const root = video && getRoot(video);
    if (mode === "off" || !isNear || !video || !root) return undefined;

    // React sets `muted` as a property; restate it (and the default) so
    // autoplay policies, iOS's in particular, always see a silent video.
    video.muted = true;
    video.defaultMuted = true;

    let wantsPlayback = false;
    let rewindTimeoutId: number | undefined;
    let frameCallbackId: number | undefined;

    const cancelFrameCallback = () => {
      if (frameCallbackId !== undefined) {
        video.cancelVideoFrameCallback?.(frameCallbackId);
        frameCallbackId = undefined;
      }
    };

    const start = () => {
      if (wantsPlayback) return;
      wantsPlayback = true;
      window.clearTimeout(rewindTimeoutId);
      const result = video.play();
      // Refused (autoplay policy, Low Power Mode) or interrupted by a pause:
      // the poster simply stays.
      result?.catch(() => undefined);
    };

    const stop = (rewind: boolean) => {
      wantsPlayback = false;
      cancelFrameCallback();
      video.pause();
      setIsVisible(false);

      if (rewind) {
        window.clearTimeout(rewindTimeoutId);
        rewindTimeoutId = window.setTimeout(() => {
          if (!wantsPlayback) video.currentTime = 0;
        }, PREVIEW_CLIP_REWIND_DELAY_MS);
      }
    };

    // `playing` can fire before the first frame is composited; where the
    // browser can say when a frame is actually presented, wait for that.
    const handlePlaying = () => {
      if (!wantsPlayback) return;
      if (video.requestVideoFrameCallback) {
        cancelFrameCallback();
        frameCallbackId = video.requestVideoFrameCallback(() => {
          frameCallbackId = undefined;
          if (wantsPlayback && !video.paused) setIsVisible(true);
        });
        return;
      }
      setIsVisible(true);
    };

    const handleError = () => {
      stop(false);
      setHasFailed(true);
    };

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("error", handleError);

    let detachTrigger: () => void;

    if (mode === "hover") {
      const handleEnter = () => start();
      const handleLeave = () => stop(true);
      root.addEventListener("pointerenter", handleEnter);
      root.addEventListener("pointerleave", handleLeave);
      // The pointer may already rest on the card when the clip becomes ready.
      if (root.matches(":hover")) start();

      detachTrigger = () => {
        root.removeEventListener("pointerenter", handleEnter);
        root.removeEventListener("pointerleave", handleLeave);
      };
    } else if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;

          const inView = isPreviewClipInView({
            ratio: entry.intersectionRatio,
            visibleHeight: entry.intersectionRect.height,
            viewportHeight: entry.rootBounds?.height ?? window.innerHeight,
          });

          if (inView) {
            start();
          } else {
            stop(false);
          }
        },
        { threshold: PREVIEW_CLIP_IN_VIEW_THRESHOLDS },
      );
      observer.observe(root);
      detachTrigger = () => observer.disconnect();
    } else {
      detachTrigger = () => undefined;
    }

    return () => {
      detachTrigger();
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("error", handleError);
      window.clearTimeout(rewindTimeoutId);
      stop(false);
    };
  }, [isNear, mode]);

  if (mode === "off") {
    return null;
  }

  return (
    <PreviewVideo
      ref={videoRef}
      src={isNear ? src : undefined}
      preload="none"
      muted
      loop
      playsInline
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
      tabIndex={-1}
      aria-hidden
      $isVisible={isVisible}
    />
  );
}
