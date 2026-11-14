import Image from "next/image";
import styled from "styled-components";

/*
 * The Hub page's own blocks, in the site's language: 50px section titles, the
 * brand wine as the one accent, soft grey panels and big rounded photos, and the
 * white slab's rhythm (150px between sections on wide screens, 60px on phones).
 * Each block looks different on purpose, so the page reads as a story rather than
 * a stack of identical cards.
 */

const sectionTitle = `
  margin: 0;
  color: var(--ink);
  font-size: 50px;
  font-weight: 400;
  line-height: 1.1;

  @media (max-width: 880px) {
    font-size: var(--text-section);
  }
`;

/* ---------- «Что внутри»: the library ---------- */

export const LibrarySection = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
  gap: 32px 60px;
  width: 100%;

  /* Below 1240px a photo column would squeeze the topics into wrapped lines. */
  @media (max-width: 1240px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const LibraryText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-width: 0;
  container: hub-library / inline-size;

  h2 {
    ${sectionTitle}
  }

  > p {
    max-width: 560px;
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-body);
    font-weight: var(--weight-text);
    line-height: 1.5;
  }

  @media (max-width: 880px) {
    gap: 16px;

    > p {
      font-size: var(--text-body-sm);
    }
  }
`;

export const TopicsLabel = styled.span`
  margin: 14px 0 -8px;
  color: var(--brand);
  font-size: var(--text-caption);
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

/**
 * A compact table of contents: numbered rows in two columns, one soft panel.
 * Every topic stays on one line: the longest («Базовая акробатика») needs 217px at
 * 19px, so the steps follow the column's own width, not the screen's: two columns
 * need 518px at 19px and 396px at the small size, below that it is one column.
 */
export const TopicGrid = styled.ol`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-flow: column;
  grid-template-rows: repeat(4, auto);
  column-gap: 32px;
  margin: 0;
  padding: 6px 26px;
  border-radius: 32px;
  background: rgba(244, 245, 246, 1);
  list-style: none;

  li {
    display: flex;
    align-items: baseline;
    gap: 16px;
    padding: 15px 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.07);
    color: var(--ink);
    font-size: 19px;
    line-height: 1.25;
  }

  li:nth-child(4n),
  li:last-child {
    border-bottom: 0;
  }

  li span {
    flex-shrink: 0;
    color: var(--brand);
    font-size: var(--text-caption);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
  }

  @container hub-library (max-width: 540px) {
    column-gap: 16px;
    padding: 4px 18px;
    border-radius: 24px;

    li {
      gap: 9px;
      padding: 12px 0;
      font-size: var(--text-small);
    }
  }

  @container hub-library (max-width: 410px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-auto-flow: row;

    li:nth-child(4n) {
      border-bottom: 1px solid rgba(0, 0, 0, 0.07);
    }

    li:last-child {
      border-bottom: 0;
    }
  }
`;

export const LibraryPhoto = styled(Image)`
  width: 100%;
  height: 100%;
  min-height: 520px;
  object-fit: cover;
  object-position: 50% 20%;
  border-radius: var(--radius-panel);

  @media (max-width: 1240px) {
    display: none;
  }
`;

/** Anna's four other cards, small and side by side. */
export const FeatureRow = styled.ul`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 24px;
    border: 1px solid rgba(0, 0, 0, 0.07);
    border-radius: 28px;
  }

  svg {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
  }

  strong {
    display: block;
    margin-bottom: 6px;
    color: var(--ink);
    font-size: 19px;
    font-weight: 400;
    line-height: 1.25;
  }

  p {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-caption);
    font-weight: var(--weight-text);
    line-height: 1.5;
  }

  li {
    flex-direction: column;
  }

  @media (max-width: 1399px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 600px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;

    li {
      flex-direction: row;
      padding: 18px;
      border-radius: 24px;
    }
  }
`;

/* ---------- The statement band ---------- */

/**
 * Anna's line over the wide photo: she stands on the right, the light wall on the
 * left carries the words, so no overlay is needed on wide screens.
 */
export const StatementBand = styled.figure`
  position: relative;
  width: 100%;
  margin: 150px 0 0;
  aspect-ratio: 1400 / 640;
  overflow: hidden;
  border-radius: var(--radius-panel);
  background: rgba(233, 234, 238, 1);

  img {
    object-fit: cover;
    object-position: 70% 30%;
  }

  figcaption {
    position: absolute;
    inset: 0 auto 0 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 22px;
    width: min(46%, 560px);
    padding: 0 0 0 64px;
  }

  blockquote {
    margin: 0;
    color: var(--ink);
    font-size: clamp(28px, 2.9vw, 44px);
    font-weight: 400;
    line-height: 1.15;
  }

  cite {
    color: var(--brand);
    font-size: var(--text-caption);
    font-style: normal;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  @media (max-width: 1100px) {
    figcaption {
      padding-left: 40px;
    }
  }

  /* Phones: the photo above, the words under it on the same grey. */
  @media (max-width: 767px) {
    aspect-ratio: auto;
    margin: 60px 0 0;
    border-radius: 32px;

    img {
      position: static !important;
      height: auto !important;
      aspect-ratio: 1400 / 800;
      object-position: 75% 30%;
    }

    figcaption {
      position: static;
      width: auto;
      padding: 24px 24px 30px;
      gap: 14px;
    }

    blockquote {
      font-size: 28px;
    }
  }

  @media (max-width: 400px) {
    figcaption {
      padding: 20px 20px 26px;
    }

    blockquote {
      font-size: 24px;
    }
  }
`;

/* ---------- The closing offer ---------- */

export const FinalCta = styled.section`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
  width: 100%;
  margin: 150px 0 0;
  padding: 64px 72px;
  border-radius: var(--radius-panel);
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(255, 255, 255, 0.12), transparent 55%),
    linear-gradient(135deg, rgba(124, 0, 2, 1), rgba(74, 0, 1, 1));
  color: var(--ink-inverse);
  box-sizing: border-box;

  @media (max-width: 920px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 28px;
    padding: 44px 36px;
  }

  @media (max-width: 880px) {
    margin: 60px 0 0;
  }

  @media (max-width: 550px) {
    padding: 36px 24px;
    border-radius: 32px;
  }
`;

export const FinalCtaText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 520px;

  h2 {
    margin: 0;
    font-size: 50px;
    font-weight: 400;
    line-height: 1.1;
  }

  p {
    margin: 0;
    color: rgba(255, 255, 255, 0.82);
    font-size: var(--text-body);
    font-weight: var(--weight-text);
    line-height: 1.5;
  }

  @media (max-width: 880px) {
    h2 {
      font-size: var(--text-section);
    }

    p {
      font-size: var(--text-body-sm);
    }
  }

  /* «к Inspiration HUB» is one unbreakable piece; on the narrowest phones it needs a step smaller. */
  @media (max-width: 360px) {
    h2 {
      font-size: 28px;
    }
  }
`;

/** What the price buys, as a short checked list (the value stack). */
export const ValueList = styled.ul`
  display: grid;
  gap: 10px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: baseline;
    gap: 12px;
    color: var(--ink-inverse);
    font-size: var(--text-body-sm);
    line-height: 1.4;
  }

  li::before {
    content: "";
    flex-shrink: 0;
    width: 7px;
    height: 12px;
    margin: 0 2px 1px;
    border: solid rgba(255, 255, 255, 0.9);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg) translateY(-2px);
  }
`;

export const FinalCtaOffer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  min-width: 280px;

  strong {
    font-size: var(--text-fact);
    font-weight: 400;
    line-height: 1.1;
    white-space: nowrap;
  }

  small {
    color: rgba(255, 255, 255, 0.72);
    font-size: var(--text-caption);
  }

  @media (max-width: 920px) {
    width: 100%;
    min-width: 0;
  }
`;
