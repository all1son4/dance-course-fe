import { css } from "styled-components";

const PHOTO_MIN_HEIGHT = "255px";
/* What the photo leaves free on a short screen, so all of it fits: three lines
   of a section title, the gap under them and some air below the photo. */
const SCREEN_ALLOWANCE = "242px";

/**
 * A title with a photo under it, sticking beside a taller column.
 *
 * The outer column spans the section's height and clips what crosses its bottom
 * edge. The pair sticks inside it, and for layout the photo only counts as its
 * minimum height, the rest hanging out of its slot. So as the section runs out
 * the column cuts into the photo while the title stays pinned, and the pair
 * scrolls away only when the minimum is all that is left. The browser does this
 * as part of scrolling, so there is no script to lag behind it.
 */
export const stickyPhotoColumn = css`
  overflow: clip;
  border-radius: 0 0 var(--radius-card) var(--radius-card);
`;

/* Where the photo is hidden the column holds only the title, and clipping it
   with those rounded corners would cut into the first letter. */
export const stickyPhotoColumnWithoutPhoto = css`
  overflow: visible;
  border-radius: 0;
`;

export const stickyPhotoPair = css`
  display: flex;
  flex-direction: column;
  gap: 36px;
  position: sticky;
  top: calc(var(--header-clearance) + var(--safe-area-top));

  /* A section title may be sticky by itself; here it moves with the pair. */
  && > h2 {
    position: static;
  }
`;

export const stickyPhotoSlot = css`
  position: relative;
  flex: none;
  height: ${PHOTO_MIN_HEIGHT};
`;

export const stickyPhotoBox = css`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  aspect-ratio: 4 / 5;
  max-height: max(
    ${PHOTO_MIN_HEIGHT},
    calc(100svh - var(--header-clearance) - var(--safe-area-top) - ${SCREEN_ALLOWANCE})
  );
  border-radius: var(--radius-card);
  overflow: hidden;

  /* Cropped from the bottom, so the head stays in the frame. */
  & img {
    object-fit: cover;
    object-position: center top;
  }
`;
