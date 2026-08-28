/**
 * Hero photos and their pre-generated width variants (see
 * scripts/generate-hero-media.mjs). The variants are plain static files - no
 * image optimizer in the request path, which is what keeps the heroes from
 * flashing - and the browser picks one by `sizes`, so a phone no longer
 * downloads the desktop-sized original.
 */
export type HeroMediaAsset = {
  /** The original file; also the largest srcset candidate. */
  src: string;
  /** Intrinsic CSS size used for the layout box (unchanged from before). */
  width: number;
  height: number;
  /** Pixel width of the original file. */
  nativeWidth: number;
  /** Generated smaller variants, e.g. `/svg/Name-w720.webp`. */
  widths: readonly number[];
};

const asset = (
  src: string,
  width: number,
  height: number,
  nativeWidth: number,
  widths: readonly number[],
): HeroMediaAsset => ({ src, width, height, nativeWidth, widths });

export const HERO_MEDIA = {
  home: asset("/svg/MainPageBackgroundPhoto.webp", 775, 900, 1550, [480, 720, 960, 1200]),
  online: asset("/svg/OnlinePageBackgroundPhoto.webp", 598, 846, 1196, [480, 720, 960]),
  choreo: asset(
    "/svg/OnlineChoreoPageBackgroundPhoto.webp",
    794,
    989,
    1588,
    [480, 720, 960, 1200],
  ),
  firstTouch: asset(
    "/svg/FirstTouchPageBackgroundPhoto.webp",
    660,
    826,
    1320,
    [480, 720, 960],
  ),
  offline: asset("/svg/OfflinePageBackgroundPhoto.webp", 558, 738, 1116, [480, 720, 960]),
  onlineTelegram: asset("/svg/OnlineTelegramBig.webp", 453, 474, 906, [453]),
  choreoTelegram: asset("/svg/TelegramChoreo.webp", 401, 421, 802, [401]),
  firstTouchTelegram: asset("/svg/FirstTouchTelegram.webp", 356, 534, 712, [356]),
  warsawMap: asset("/svg/WarsawMap.webp", 379, 568, 758, [379]),
} as const satisfies Record<string, HeroMediaAsset>;

export const heroMediaVariantPath = (src: string, width: number) =>
  src.replace(/\.webp$/u, `-w${width}.webp`);

export const buildHeroMediaSrcSet = ({ nativeWidth, src, widths }: HeroMediaAsset) =>
  [
    ...widths.map((width) => `${heroMediaVariantPath(src, width)} ${width}w`),
    `${src} ${nativeWidth}w`,
  ].join(", ");
