"use client";

import type Plyr from "plyr";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { Play } from "@/svg";

import { CenterButton, VideoWrap } from "./VideoPlayer.styles";
import type { TVideoPlayerProps } from "./VideoPlayer.types";

type PlayerApi = {
  play: () => Promise<void> | void;
  pause: () => void;
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
  const plyrRef = useRef<Plyr | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const options = useMemo<Plyr.Options>(
    () => ({
      controls: [],
      clickToPlay: false,
      muted,
      ...(loop ? { loop: { active: true } } : {}),
    }),
    [loop, muted],
  );

  useEffect(() => {
    setIsReady(false);
    setIsPlaying(false);
  }, [src]);

  useEffect(() => {
    let mounted = true;
    const video = videoRef.current;

    if (!video) return undefined;

    const handleLoadedMetadata = () => {
      if (!mounted) return;
      setIsReady(true);
    };

    const handlePlay = () => {
      if (!mounted) return;
      setIsPlaying(true);
    };

    const handlePause = () => {
      if (!mounted) return;
      setIsPlaying(false);
    };

    const handleEnded = () => {
      if (!mounted) return;
      setIsPlaying(false);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    if (video.readyState >= 1) {
      setIsReady(true);
    }
    if (!video.paused) {
      setIsPlaying(true);
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

        plyrRef.current = new PlyrCtor(video, options);
      } catch {
        // ignore - fallback to native video API
      }
    };

    void init();

    return () => {
      mounted = false;

      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);

      if (plyrRef.current) {
        try {
          plyrRef.current.destroy();
        } catch {
          // ignore
        }
        plyrRef.current = null;
      }
    };
  }, [options, src]);

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
    </VideoWrap>
  );
}
