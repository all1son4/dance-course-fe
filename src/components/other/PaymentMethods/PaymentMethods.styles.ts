import styled from "styled-components";

export const PaymentMethodsBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px 20px;
  color: var(--ink-muted);
  text-align: center;
`;

export const MarkList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 16px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const MarkItem = styled.li`
  display: flex;
  align-items: center;
  height: 24px;

  & svg {
    display: block;
    width: auto;
    height: 24px;
    fill: currentColor;
  }
`;

/* BLIK has no Simple Icons mark, so it is set as a compact wordmark that
   matches the weight of the other glyphs. */
export const Wordmark = styled.span`
  font-size: var(--text-small);
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
`;

export const Note = styled.p`
  margin: 0;
  font-size: var(--text-small);
  font-weight: 300;
  line-height: 1.4;
`;
