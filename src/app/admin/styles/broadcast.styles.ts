import styled from "styled-components";

import { FactGrid } from "../ui/forms";
import { DataTable } from "../ui/table";

/** Header-cell widths only: the header hides on narrow screens, where rows
 *  become cards, so there is nothing to reset. */
export const AudienceTable = styled(DataTable)`
  th:nth-child(1) {
    width: 28%;
  }

  th:last-child {
    width: 1%;
  }
`;

export const AudienceActions = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;

  @container admin-content (max-width: 760px) {
    justify-content: flex-start;
  }
`;

/** Five counters: one row where there is room; on phones the total spans the
 *  first row and the other four sit two by two, so no tile hangs alone. */
export const AudienceFacts = styled(FactGrid)`
  @container admin-content (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > div:first-child {
      grid-column: 1 / -1;
    }
  }
`;

/** The campaign tiles of «Рассылки»: as many across as fit, one on phones. */
export const CampaignTiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 12px;
`;
