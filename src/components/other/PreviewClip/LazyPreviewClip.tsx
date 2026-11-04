"use client";

import dynamic from "next/dynamic";

/*
 * The clip player is only rendered for cards that have a `previewSrc`, so its
 * code is split out and fetched on demand: pages (and cards) without a clip
 * ship none of it. Nothing is server-rendered either - the <video> only ever
 * gets a source on the client, once the card is near the viewport.
 */
const LazyPreviewClip = dynamic(() => import("./PreviewClip"), { ssr: false });

export default LazyPreviewClip;
