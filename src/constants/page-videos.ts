/**
 * Self-hosted videos that pages play, with the facts search engines ask for:
 * the poster the player shows, when the file was first published (the
 * commit that added it to the repo) and its running time (ffprobe). Names
 * and descriptions are translated in `Metadata.pages.<page>.video`.
 *
 * Re-encoding a file keeps its upload date; a new recording gets a new file.
 */
export const PAGE_VIDEOS: Readonly<
  Record<string, { poster: string; uploadDate: string; duration: string }>
> = {
  "/videos/introduction_first_touch_en.mp4": {
    poster: "/images/first_touch_poster.webp",
    uploadDate: "2026-02-25T23:43:43+01:00",
    duration: "PT1M3S",
  },
  "/videos/introduction_first_touch_ru.mp4": {
    poster: "/images/first_touch_poster.webp",
    // Added as introduction_first_touch.mp4 and renamed on 2026-02-25.
    uploadDate: "2026-02-11T20:49:22+01:00",
    duration: "PT1M11S",
  },
  "/videos/online_example.mp4": {
    poster: "/images/online_example_poster.webp",
    uploadDate: "2026-07-24T20:34:33+03:00",
    duration: "PT43S",
  },
};
