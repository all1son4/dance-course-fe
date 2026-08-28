"use client";

// Plyr's stylesheet travels with the player, so only pages that actually
// render a video pay for it (it used to be imported by the /online layout).
import "@/styles/vendor/plyr.css";

import { useTranslations } from "next-intl";
import type { Options as PlyrOptions } from "plyr";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { INSTAGRAM_BASE_URL } from "@/constants/links";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";
import { Play } from "@/svg";

import { CenterButton, PosterOverlay, VideoWrap } from "./VideoPlayer.styles";
import type { TVideoPlayerProps } from "./VideoPlayer.types";

type PlayerApi = {
  play: () => Promise<void> | void;
  pause: () => void;
};

type PlayerInstance = PlayerApi & {
  destroy: () => void;
  elements: {
    container: HTMLElement | null;
  };
};

type PlayerConstructor = new (
  target: HTMLElement,
  options: PlyrOptions,
) => PlayerInstance;

type CreatePlayerOptionsInput = {
  isYoutube: boolean;
  loop: boolean;
  muted: boolean;
};

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_SHORT_HOST = "youtu.be";
const YOUTUBE_HOST_SUFFIX = "youtube.com";
const YOUTUBE_NO_COOKIE_HOST_SUFFIX = "youtube-nocookie.com";
const INSTAGRAM_HOST = "instagram.com";
const INSTAGRAM_SHORT_HOST = "instagr.am";
const INSTAGRAM_WINDOW_TARGET = "_blank";
const INSTAGRAM_WINDOW_FEATURES = "noopener,noreferrer";

const getYoutubeId = (value: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (YOUTUBE_ID_PATTERN.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace("www.", "");

    if (host === YOUTUBE_SHORT_HOST) {
      return url.pathname.replace("/", "");
    }

    if (
      host.endsWith(YOUTUBE_HOST_SUFFIX) ||
      host.endsWith(YOUTUBE_NO_COOKIE_HOST_SUFFIX)
    ) {
      const idFromQuery = url.searchParams.get("v");
      if (idFromQuery) return idFromQuery;

      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === "embed");
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    }
  } catch {
    // Malformed values fall through to the native-video branch.
  }

  return null;
};

const getInstagramPostUrl = (value: string): string | null => {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    const host = url.hostname.replace("www.", "");
    if (host !== INSTAGRAM_HOST && host !== INSTAGRAM_SHORT_HOST) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const id = parts[1];

    if (!id) return null;
    if (type === "reel" || type === "p" || type === "tv") {
      return `${INSTAGRAM_BASE_URL}/${type}/${id}/`;
    }
  } catch {
    // Malformed values fall through to the native-video branch.
  }

  return null;
};

const createPlayerOptions = ({
  isYoutube,
  loop,
  muted,
}: CreatePlayerOptionsInput): PlyrOptions => ({
  controls: [],
  clickToPlay: false,
  loadSprite: false,
  // Plyr would otherwise remember volume/captions in localStorage ("plyr"):
  // a storage entry the cookie policy does not list and nobody asked for.
  storage: { enabled: false },
  muted,
  ...(loop ? { loop: { active: true } } : {}),
  ...(isYoutube
    ? {
        youtube: {
          noCookie: true,
          rel: 0,
          modestbranding: 1,
          controls: 0,
          disablekb: 1,
          playsinline: 1,
        },
      }
    : {}),
});

const destroyPlayer = (player: PlayerInstance): void => {
  try {
    player.destroy();
  } catch {
    // Plyr can throw if its managed DOM was already removed.
  }
};

const getPlayerApi = (
  player: PlayerInstance | null,
  video: HTMLVideoElement | null,
): PlayerApi | null => (player ?? video) as PlayerApi | null;

const isSpaceShortcut = (event: KeyboardEvent): boolean =>
  event.code === "Space" || event.key === " " || event.key === "Spacebar";

const shouldIgnorePauseShortcut = (
  element: Element | null,
  playButton: HTMLButtonElement | null,
): boolean => {
  if (!element) return false;
  if (playButton && playButton.contains(element)) return false;

  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "BUTTON" || tag === "A") return true;

  return (element as HTMLElement).isContentEditable;
};

export default function VideoPlayer({
  analyticsId,
  src,
  type = "video/mp4",
  poster,
  preload = "none",
  className,
  maxWidth = "100%",
  width = "100%",
  aspectRatio = "2 / 1",
  radius = "100px",
  buttonSize = "95px",
  iconSize = "40px",
  playLabel,
  loop = false,
  muted = false,
  playsInline = true,
}: TVideoPlayerProps) {
  const t = useTranslations("Common");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const embedRef = useRef<HTMLDivElement | null>(null);
  const plyrRef = useRef<PlayerInstance | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const hasTrackedStartRef = useRef(false);
  const hasTrackedCompletionRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const youtubeId = useMemo(() => getYoutubeId(src), [src]);
  const instagramPostUrl = useMemo(() => getInstagramPostUrl(src), [src]);
  const isYoutube = Boolean(youtubeId);
  const isInstagram = Boolean(instagramPostUrl);
  const videoProvider = isInstagram ? "instagram" : isYoutube ? "youtube" : "native";
  const resolvedPlayLabel = playLabel ?? t("playVideo");

  const options = useMemo<PlyrOptions>(
    () => createPlayerOptions({ isYoutube, loop, muted }),
    [isYoutube, loop, muted],
  );

  useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
    setHasStarted(false);
    hasTrackedStartRef.current = false;
    hasTrackedCompletionRef.current = false;
  }, [src]);

  useEffect(() => {
    let mounted = true;
    const video = videoRef.current;
    const embed = embedRef.current;

    if (isInstagram) {
      setIsReady(true);
      return undefined;
    }

    if (!isYoutube && !video) return undefined;
    if (isYoutube && !embed) return undefined;

    const handleLoadedMetadata = () => {
      if (!mounted) return;
      setIsReady(true);
    };

    const handlePlay = () => {
      if (!mounted) return;
      setIsPlaying(true);
      setHasStarted(true);

      if (analyticsId && !hasTrackedStartRef.current) {
        hasTrackedStartRef.current = true;
        void trackAnalyticsEvent("video_started", {
          video_id: analyticsId,
          video_provider: videoProvider,
        });
      }
    };

    const handlePause = () => {
      if (!mounted) return;
      setIsPlaying(false);

      if (analyticsId && hasTrackedStartRef.current && !hasTrackedCompletionRef.current) {
        void trackAnalyticsEvent("video_paused", {
          video_id: analyticsId,
          video_provider: videoProvider,
        });
      }
    };

    const handleEnded = () => {
      if (!mounted) return;
      setIsPlaying(false);

      if (analyticsId && !hasTrackedCompletionRef.current) {
        hasTrackedCompletionRef.current = true;
        void trackAnalyticsEvent("video_completed", {
          video_id: analyticsId,
          video_provider: videoProvider,
        });
      }
    };

    let eventTarget: HTMLElement | null = null;

    const attachMediaEvents = (target: HTMLElement) => {
      eventTarget = target;
      target.addEventListener("play", handlePlay);
      target.addEventListener("pause", handlePause);
      target.addEventListener("ended", handleEnded);
    };

    if (!isYoutube && video) {
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      attachMediaEvents(video);
      setIsReady(true);

      if (video.readyState >= 1) {
        setIsReady(true);
      }
      if (!video.paused) {
        setIsPlaying(true);
        setHasStarted(true);
      }
    }

    const init = async () => {
      try {
        const mod = await import("plyr");
        if (!mounted) return;

        // The browser bundle exposes Plyr through `default`, while its
        // declaration file uses `export =`.
        const PlyrCtor = (
          mod as unknown as {
            default: PlayerConstructor;
          }
        ).default;

        if (plyrRef.current) {
          destroyPlayer(plyrRef.current);
          plyrRef.current = null;
        }

        const target = isYoutube ? embed : video;
        if (!target) return;

        plyrRef.current = new PlyrCtor(target, options);

        if (isYoutube) {
          const container = plyrRef.current.elements.container;
          if (container) {
            attachMediaEvents(container);
          }
          setIsReady(true);
        }
      } catch {
        // ignore - fallback to native video API
      }
    };

    void init();

    return () => {
      mounted = false;

      if (!isYoutube && video) {
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      }

      if (eventTarget) {
        eventTarget.removeEventListener("play", handlePlay);
        eventTarget.removeEventListener("pause", handlePause);
        eventTarget.removeEventListener("ended", handleEnded);
      }

      if (plyrRef.current) {
        destroyPlayer(plyrRef.current);
        plyrRef.current = null;
      }
    };
  }, [analyticsId, isInstagram, options, src, isYoutube, videoProvider]);

  const handlePlay = () => {
    if (isInstagram) {
      if (instagramPostUrl) {
        if (analyticsId && !hasTrackedStartRef.current) {
          hasTrackedStartRef.current = true;
          void trackAnalyticsEvent("video_started", {
            video_id: analyticsId,
            video_provider: "instagram",
          });
        }
        window.open(instagramPostUrl, INSTAGRAM_WINDOW_TARGET, INSTAGRAM_WINDOW_FEATURES);
      }
      playButtonRef.current?.blur();
      return;
    }

    const api = getPlayerApi(plyrRef.current, videoRef.current);
    if (!api) return;

    const result = api.play();
    if (result instanceof Promise) {
      void result;
    }
    playButtonRef.current?.blur();
  };

  const handleWrapClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!isPlaying) return;
    const target = event.target as Node | null;
    if (playButtonRef.current && target && playButtonRef.current.contains(target)) {
      return;
    }
    const api = getPlayerApi(plyrRef.current, videoRef.current);
    if (!api) return;
    api.pause();
  };

  useEffect(() => {
    if (!isPlaying) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isSpaceShortcut(event)) return;
      if (shouldIgnorePauseShortcut(document.activeElement, playButtonRef.current)) {
        return;
      }
      event.preventDefault();
      const api = getPlayerApi(plyrRef.current, videoRef.current);
      api?.pause();
    };

    const options = { capture: true } as const;
    window.addEventListener("keydown", handleKeyDown, options);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, options);
    };
  }, [isPlaying]);

  const renderMedia = () => {
    if (isYoutube) {
      return (
        <div
          ref={embedRef}
          data-plyr-provider="youtube"
          data-plyr-embed-id={youtubeId ?? undefined}
        />
      );
    }

    if (isInstagram) {
      return <div className="instagram-fallback" aria-hidden />;
    }

    return (
      <video
        ref={videoRef}
        playsInline={playsInline}
        preload={preload}
        poster={poster}
        loop={loop}
        muted={muted}
        controls={false}
      >
        <source src={src} type={type} />
      </video>
    );
  };

  return (
    <VideoWrap
      className={className}
      onClickCapture={handleWrapClickCapture}
      $maxWidth={maxWidth}
      $width={width}
      $aspectRatio={aspectRatio}
      $radius={radius}
      $buttonSize={buttonSize}
      $iconSize={iconSize}
    >
      {poster && (isYoutube || isInstagram) && (
        <PosterOverlay
          $src={poster}
          $isVisible={isInstagram || !hasStarted}
          aria-hidden
        />
      )}
      <CenterButton
        type="button"
        aria-label={resolvedPlayLabel}
        disabled={!isReady}
        onClick={handlePlay}
        $isPlaying={isPlaying}
        ref={playButtonRef}
      >
        <Play />
      </CenterButton>

      {renderMedia()}
    </VideoWrap>
  );
}
