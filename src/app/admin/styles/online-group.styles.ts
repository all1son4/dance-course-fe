import styled from "styled-components";

export const OnlineGroupWorkspace = styled.div`
  width: 100%;
  margin-top: clamp(14px, 1.7vw, 20px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;

  > :nth-child(2):last-child {
    grid-column: 1 / -1;
  }

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;

    > * {
      grid-column: auto;
    }
  }
`;

export const RenewalLinksList = styled.div`
  margin-top: 9px;
  display: flex;
  flex-direction: column;
  gap: 9px;
`;

export const RenewalLinkControls = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
`;
