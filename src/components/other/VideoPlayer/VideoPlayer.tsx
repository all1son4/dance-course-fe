"use client";

import type Plyr from "plyr";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { Play } from "@/svg";

import { CenterButton, PosterOverlay, VideoWrap } from "./VideoPlayer.styles";
import type { TVideoPlayerProps } from "./VideoPlayer.types";

type PlayerApi = {
  play: () => Promise<void> | void;
  pause: () => void;
};

const getYoutubeId = (value: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace("www.", "");

    if (host === "youtu.be") {
      return url.pathname.replace("/", "");
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const idFromQuery = url.searchParams.get("v");
      if (idFromQuery) return idFromQuery;

      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === "embed");
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return parts[embedIndex + 1];
      }
    }
  } catch {
    // ignore
  }

  return null;
};

export default function VideoPlayer({
  src,
  type = "video/mp4",
  poster,
  preload = "metadata",
  className,
  maxWidth = "100%",
  width = "100%",
  aspectRatio = "2 / 1",
  radius = "100px",
  buttonSize = "95px",
  iconSize = "40px",
  playLabel = "Play video",
  loop = false,
  muted = false,
  playsInline = true,
}: TVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const embedRef = useRef<HTMLDivElement | null>(null);
  const plyrRef = useRef<Plyr | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const youtubeId = useMemo(() => getYoutubeId(src), [src]);
  const isYoutube = Boolean(youtubeId);

  const options = useMemo<Plyr.Options>(
    () => ({
      controls: [],
      clickToPlay: false,
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
    }),
    [isYoutube, loop, muted],
  );

  useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
    setHasStarted(false);
  }, [src]);

  useEffect(() => {
    let mounted = true;
    const video = videoRef.current;
    const embed = embedRef.current;

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
    };

    const handlePause = () => {
      if (!mounted) return;
      setIsPlaying(false);
    };

    const handleEnded = () => {
      if (!mounted) return;
      setIsPlaying(false);
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

        const PlyrCtor = mod.default;

        if (plyrRef.current) {
          try {
            plyrRef.current.destroy();
          } catch {
            // ignore
          }
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
        try {
          plyrRef.current.destroy();
        } catch {
          // ignore
        }
        plyrRef.current = null;
      }
    };
  }, [options, src, isYoutube]);

  const handlePlay = () => {
    const api = (plyrRef.current ?? videoRef.current) as PlayerApi | null;
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
    const api = (plyrRef.current ?? videoRef.current) as PlayerApi | null;
    if (!api) return;
    api.pause();
  };

  useEffect(() => {
    if (!isPlaying) return undefined;

    const shouldIgnore = (el: Element | null) => {
      if (!el) return false;
      if (playButtonRef.current && playButtonRef.current.contains(el)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "BUTTON" || tag === "A") return true;
      return (el as HTMLElement).isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " " && event.key !== "Spacebar") return;
      if (shouldIgnore(document.activeElement)) return;
      event.preventDefault();
      const api = (plyrRef.current ?? videoRef.current) as PlayerApi | null;
      api?.pause();
    };

    const options = { capture: true } as const;
    window.addEventListener("keydown", handleKeyDown, options);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, options);
    };
  }, [isPlaying]);

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
      {poster && isYoutube && (
        <PosterOverlay $src={poster} $isVisible={!hasStarted} aria-hidden />
      )}
      <CenterButton
        type="button"
        aria-label={playLabel}
        disabled={!isReady}
        onClick={handlePlay}
        $isPlaying={isPlaying}
        ref={playButtonRef}
      >
        <Play />
      </CenterButton>

      {isYoutube ? (
        <div
          ref={embedRef}
          data-plyr-provider="youtube"
          data-plyr-embed-id={youtubeId ?? undefined}
        />
      ) : (
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
      )}
    </VideoWrap>
  );
}
