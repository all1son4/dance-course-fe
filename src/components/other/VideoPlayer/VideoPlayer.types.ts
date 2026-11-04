export type TVideoPlayerProps = {
  /** Stable content identifier; the media URL itself is never sent to analytics. */
  analyticsId?: string;
  src: string;
  /**
   * Optional short, muted loop shown over the poster while the card is
   * hovered (mouse) or mostly in view (touch); see PreviewClip. Pressing play
   * still does exactly what `src` asks for.
   */
  previewSrc?: string;
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
