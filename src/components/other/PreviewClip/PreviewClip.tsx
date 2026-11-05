"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  isPreviewClipInView,
  PREVIEW_CLIP_HOVER_QUERY,
  PREVIEW_CLIP_IN_VIEW_ROOT_MARGIN,
  PREVIEW_CLIP_IN_VIEW_THRESHOLDS,
  PREVIEW_CLIP_MAX_PLAY_RETRIES,
  PREVIEW_CLIP_NEAR_ROOT_MARGIN,
  PREVIEW_CLIP_REDUCED_MOTION_QUERY,
  PREVIEW_CLIP_ROOT_ATTRIBUTE,
  PREVIEW_CLIP_START_DELAY_MS,
  type PreviewClipMode,
  resolvePreviewClipMode,
} from "@/lib/preview-clip";

import { PreviewVideo } from "./PreviewClip.styles";

/** Covers the fade-out (`--motion-slow`) before the clip rewinds to its start. */
/* Keep in sync with the fade-out in PreviewClip.styles: the clip keeps
   playing while it dissolves, then pauses (and rewinds) once it is gone. */
const PREVIEW_CLIP_FADE_OUT_MS = 480;
/** If the browser never reports a presented frame, show the clip anyway. */
const PREVIEW_CLIP_FRAME_FALLBACK_MS = 400;
/** One network hiccup should not cost the clip for the rest of the visit. */
const PREVIEW_CLIP_ERROR_RETRY_MS = 1_500;
const PREVIEW_CLIP_PLAY_RETRY_MS = 300;

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
 * or its media is mostly on screen (touch), after a short delay, and pauses
 * otherwise. Never fetched before the card comes near the viewport, never
 * under reduced motion or data saver, and only faded in once a frame is really
 * on screen - until then, and whenever anything fails, the poster underneath
 * is what shows. Purely decorative: hidden from assistive tech and from pointer
 * events, so the player's own button keeps doing exactly what it did.
 *
 * Playback can be taken away at any moment (a backgrounded tab, a page restored
 * from history, iOS Low Power Mode refusing autoplay until the next tap), so it
 * is treated as something to keep asking for while the clip is wanted.
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
  // Some touch devices report a hover-capable pointer (stylus phones, tablets
  // with a trackpad). The first finger on the screen settles which one it is.
  const [hasSeenTouch, setHasSeenTouch] = useState(false);
  const resolvedMode: PreviewClipMode =
    environmentMode === "hover" && hasSeenTouch ? "in-view" : environmentMode;
  const mode: PreviewClipMode = disabled || hasFailed ? "off" : resolvedMode;

  useEffect(() => {
    if (environmentMode !== "hover" || hasSeenTouch) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") setHasSeenTouch(true);
    };

    window.addEventListener("pointerdown", handlePointerDown, { passive: true });

    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [environmentMode, hasSeenTouch]);

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
    let startTimeoutId: number | undefined;
    let rewindTimeoutId: number | undefined;
    let retryTimeoutId: number | undefined;
    let revealTimeoutId: number | undefined;
    let frameCallbackId: number | undefined;
    let playRetries = 0;
    let hasRetriedError = false;

    const cancelReveal = () => {
      window.clearTimeout(revealTimeoutId);
      if (frameCallbackId !== undefined) {
        video.cancelVideoFrameCallback?.(frameCallbackId);
        frameCallbackId = undefined;
      }
    };

    // `playing` can fire before the first frame is composited; where the
    // browser can say when a frame is actually presented, wait for that, but
    // not forever: some browsers stop reporting frames for a transparent video.
    const reveal = () => {
      cancelReveal();
      if (!wantsPlayback || video.paused) return;

      const show = () => {
        cancelReveal();
        if (wantsPlayback && !video.paused) setIsVisible(true);
      };

      if (video.requestVideoFrameCallback) {
        frameCallbackId = video.requestVideoFrameCallback(() => {
          frameCallbackId = undefined;
          show();
        });
        revealTimeoutId = window.setTimeout(show, PREVIEW_CLIP_FRAME_FALLBACK_MS);
        return;
      }

      show();
    };

    const removeGestureRetry = () => {
      document.removeEventListener("touchend", handleGesture, true);
      document.removeEventListener("click", handleGesture, true);
    };

    // A browser that refuses muted autoplay (iOS Low Power Mode) still allows
    // playback inside a user gesture, so the next tap brings the clip back.
    function handleGesture() {
      removeGestureRetry();
      requestPlayback();
    }

    function requestPlayback() {
      if (!wantsPlayback || document.hidden) return;

      const result = video?.play();
      result?.then(reveal).catch((error: unknown) => {
        if (!wantsPlayback) return;

        if (error instanceof DOMException && error.name === "NotAllowedError") {
          document.addEventListener("touchend", handleGesture, {
            capture: true,
            passive: true,
          });
          document.addEventListener("click", handleGesture, { capture: true });
          return;
        }

        // Interrupted by a load or a pause it did not ask for: ask again.
        if (playRetries < PREVIEW_CLIP_MAX_PLAY_RETRIES) {
          playRetries += 1;
          window.clearTimeout(retryTimeoutId);
          retryTimeoutId = window.setTimeout(requestPlayback, PREVIEW_CLIP_PLAY_RETRY_MS);
        }
      });
    }

    const start = () => {
      if (wantsPlayback) return;
      wantsPlayback = true;
      playRetries = 0;
      window.clearTimeout(rewindTimeoutId);

      // Coming back during the fade-out: it never stopped, so no delay and no
      // `playing` event either - it only has to fade back in.
      if (!video.paused) {
        reveal();
        return;
      }

      // Buffer during the delay, so the clip starts the moment it ends.
      video.preload = "auto";
      window.clearTimeout(startTimeoutId);
      startTimeoutId = window.setTimeout(requestPlayback, PREVIEW_CLIP_START_DELAY_MS);
    };

    const stop = (rewind: boolean) => {
      wantsPlayback = false;
      window.clearTimeout(startTimeoutId);
      window.clearTimeout(retryTimeoutId);
      cancelReveal();
      removeGestureRetry();
      setIsVisible(false);

      window.clearTimeout(rewindTimeoutId);
      rewindTimeoutId = window.setTimeout(() => {
        if (wantsPlayback) return;
        video.pause();
        if (rewind) video.currentTime = 0;
      }, PREVIEW_CLIP_FADE_OUT_MS);
    };

    const handlePlaying = () => reveal();

    // Paused from outside (the system, another media session) while still wanted.
    const handlePause = () => {
      if (!wantsPlayback || document.hidden) return;
      if (playRetries >= PREVIEW_CLIP_MAX_PLAY_RETRIES) return;
      playRetries += 1;
      window.clearTimeout(retryTimeoutId);
      retryTimeoutId = window.setTimeout(requestPlayback, PREVIEW_CLIP_PLAY_RETRY_MS);
    };

    // Back from another tab or app, or restored from the back/forward cache:
    // the browser paused the clip and will not resume it on its own.
    const handleResume = () => {
      if (!wantsPlayback || document.hidden) return;
      playRetries = 0;
      window.clearTimeout(startTimeoutId);
      requestPlayback();
    };

    const handleError = () => {
      if (hasRetriedError) {
        stop(false);
        setHasFailed(true);
        return;
      }

      hasRetriedError = true;
      window.clearTimeout(retryTimeoutId);
      retryTimeoutId = window.setTimeout(() => {
        video.load();
        requestPlayback();
      }, PREVIEW_CLIP_ERROR_RETRY_MS);
    };

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleError);
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("pageshow", handleResume);

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
      // The media box, not the card: what matters is that the clip can be seen.
      // Measured on the card, media sitting fully on screen at the bottom of a
      // tall card counted as out of view, and media scrolled away as in view.
      const media = video.parentElement ?? root;
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
        {
          rootMargin: PREVIEW_CLIP_IN_VIEW_ROOT_MARGIN,
          threshold: PREVIEW_CLIP_IN_VIEW_THRESHOLDS,
        },
      );
      observer.observe(media);
      detachTrigger = () => observer.disconnect();
    } else {
      detachTrigger = () => undefined;
    }

    return () => {
      detachTrigger();
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleError);
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("pageshow", handleResume);
      stop(false);
      window.clearTimeout(rewindTimeoutId);
      video.pause();
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
