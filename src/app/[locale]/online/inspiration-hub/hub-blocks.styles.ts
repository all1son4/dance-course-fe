import styled from "styled-components";

/*
 * The Hub page's own selling blocks, drawn in the site's language: the 50px section
 * titles of the course pages, the brand wine as the one accent, pill shapes and the
 * white slab's rhythm (150px between sections on wide screens, 40px on phones).
 */

export const HubSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 40px;
  width: 100%;
  padding: 150px 0 0;

  @media (max-width: 880px) {
    gap: 28px;
    padding: 60px 0 0;
  }
`;

export const HubSectionHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 40px;
`;

export const HubSectionTitle = styled.h2`
  margin: 0;
  color: var(--ink);
  font-size: 50px;
  font-weight: 400;
  line-height: 1.1;

  @media (max-width: 880px) {
    font-size: var(--text-section);
  }
`;

export const HubSectionLead = styled.p`
  max-width: 420px;
  margin: 0;
  color: var(--ink-muted);
  font-size: var(--text-body);
  font-weight: var(--weight-text);
  line-height: 1.5;

  @media (max-width: 880px) {
    font-size: var(--text-body-sm);
  }
`;

/** Lesson topics as pills: the library at a glance. */
export const TopicList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    padding: 14px 26px;
    border: 1px solid rgba(124, 0, 2, 0.16);
    border-radius: var(--radius-pill);
    background: rgba(124, 0, 2, 0.04);
    color: var(--brand);
    font-size: var(--text-body);
    line-height: 1.2;
    white-space: nowrap;
  }

  @media (max-width: 550px) {
    gap: 8px;

    li {
      padding: 11px 18px;
      font-size: var(--text-small);
    }
  }
`;

/** Three "this is for you" cards in a row; one column on phones. */
export const AudienceGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;

  @media (max-width: 920px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
`;

export const AudienceCard = styled.article`
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 36px 32px;
  border-radius: var(--radius-panel);
  background: rgba(244, 245, 246, 1);

  svg {
    width: 44px;
    height: 44px;
    color: var(--brand);
  }

  h3 {
    margin: 0;
    color: var(--ink);
    font-size: 24px;
    font-weight: 400;
    line-height: 1.2;
  }

  p {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-body-sm);
    font-weight: var(--weight-text);
    line-height: 1.5;
  }

  @media (max-width: 920px) {
    flex-direction: row;
    align-items: flex-start;
    gap: 18px;
    padding: 24px;
    border-radius: 28px;

    svg {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
    }

    h3 {
      margin-bottom: 6px;
      font-size: 20px;
    }
  }
`;

/** The closing call to action: the brand wine panel with the price and the button. */
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
