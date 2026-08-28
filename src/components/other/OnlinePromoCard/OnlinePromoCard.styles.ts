import styled from "styled-components";

export const CourseList = styled.ul`
  list-style: numeric;
  padding: 0 0 0 16px;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--ink);

  & li {
    margin: 0;
  }
`;

export const HighlightText = styled.span`
  font-weight: 600;
`;
