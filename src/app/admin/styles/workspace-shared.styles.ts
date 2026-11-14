import styled from "styled-components";

export const WorkspaceGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.9fr);
  gap: 16px;
  align-items: start;

  > :only-child {
    grid-column: 1 / -1;
    width: min(760px, 100%);
  }

  @container admin-content (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

export const WorkspacePrimary = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const WorkspaceSecondary = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;
