export type TVideoPlayerProps = {
  src: string;
  type?: string;
  poster?: string;
  preload?: "none" | "metadata" | "auto";
  className?: string;
  maxWidth?: string;
  width?: string;
  aspectRatio?: string;
  radius?: string;
  buttonSize?: string;
  iconSize?: string;
  playLabel?: string;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
};
