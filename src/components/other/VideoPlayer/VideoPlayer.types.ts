export type TVideoPlayerProps = {
  /** Stable content identifier; the media URL itself is never sent to analytics. */
  analyticsId?: string;
  src: string;
  type?: string;
  poster?: string;
  preload?: "none" | "metadata" | "auto";
  className?: string;
  maxWidth?: string;
  width?: string;
  /** Outer box height; "auto" leaves it to `aspectRatio`. */
  height?: string;
  aspectRatio?: string;
  radius?: string;
  buttonSize?: string;
  iconSize?: string;
  playLabel?: string;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
};
