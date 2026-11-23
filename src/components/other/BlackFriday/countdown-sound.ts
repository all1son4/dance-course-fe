type SoundMode = "initial" | "enabled" | "muted";
type CountdownAudio = {
  context: AudioContext;
  tick: AudioBuffer | null;
  loading: boolean;
};

// Edited excerpt of “Split Flap Display” by ngruber (CC0).
// https://freesound.org/people/ngruber/sounds/261244/
const TICK_SRC = "/audio/black-friday-flap.wav";

let mode: SoundMode = "initial";
let revision = 0;
let lastPlayedSecond = -Infinity;
let audio: CountdownAudio | null = null;
const listeners = new Set<() => void>();

const setMode = (next: SoundMode) => {
  if (mode === next) return;
  mode = next;
  listeners.forEach((listener) => listener());
};

const loadTick = async (playback: CountdownAudio) => {
  if (playback.tick || playback.loading) return;
  playback.loading = true;

  try {
    const response = await fetch(TICK_SRC);
    if (!response.ok) return;
    playback.tick = await playback.context.decodeAudioData(await response.arrayBuffer());
  } catch {
    // Sound is optional. A failed sample load can be retried on the next click.
  } finally {
    playback.loading = false;
  }
};

/** Create or resume the context in the visitor's click handler. */
const enableSound = () => {
  const previous = mode;
  const version = ++revision;

  try {
    if (!audio || audio.context.state === "closed") {
      audio = { context: new AudioContext(), tick: null, loading: false };
    }
    const ready = audio.context.state === "running" ? null : audio.context.resume();
    void loadTick(audio);
    setMode("enabled");
    void ready?.catch(() => {
      if (revision === version) setMode(previous);
    });
  } catch {
    // The timer keeps working if the browser cannot play Web Audio.
  }
};

const onPageClick = (event: MouseEvent) => {
  if (!event.isTrusted || mode === "muted") return;
  // The dedicated control handles its own click, including the first one.
  if (event.target instanceof Element && event.target.closest("[data-countdown-sound]")) {
    return;
  }
  if (mode === "initial" || !audio?.tick || audio.context.state !== "running")
    enableSound();
};

const onVisibilityChange = () => {
  if (document.visibilityState === "visible" && mode === "enabled") enableSound();
};

export const subscribeCountdownSound = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("click", onPageClick, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("click", onPageClick, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
};

export const getCountdownSoundEnabled = () => mode === "enabled";
export const getServerCountdownSoundEnabled = () => false;

export const toggleCountdownSound = () => {
  if (mode === "enabled") {
    revision++;
    setMode("muted");
    return;
  }
  enableSound();
};

export const playCountdownTick = (surface: HTMLElement, at: number) => {
  const second = Math.floor(at / 1_000);
  if (
    mode !== "enabled" ||
    audio?.context.state !== "running" ||
    !audio.tick ||
    document.visibilityState !== "visible" ||
    second === lastPlayedSecond
  ) {
    return;
  }

  // A ribbon still intersecting the viewport can be fading in from opacity 0.
  const style = getComputedStyle(surface);
  if (
    !surface.isConnected ||
    style.visibility !== "visible" ||
    Number(style.opacity) === 0
  ) {
    return;
  }

  lastPlayedSecond = second;
  const source = audio.context.createBufferSource();
  source.buffer = audio.tick;
  source.connect(audio.context.destination);
  source.onended = () => source.disconnect();
  source.start();
};
