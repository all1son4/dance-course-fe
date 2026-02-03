import Link from "next/link";
import styled from "styled-components";

export const CardContainer = styled.div`
  display: flex;
  gap: 14px;
  justify-content: center;
  align-items: center;
  margin: 0;
  cursor: pointer;
`;

export const CardLinkContainer = styled(Link)`
  display: flex;
  gap: 14px;
  justify-content: center;
  align-items: center;
  margin: 0;
  cursor: pointer;
  text-decoration: none !important;

  & svg rect {
    transition: all 0.2s ease;
  }

  &:hover {
    & svg rect {
      fill: rgba(0, 0, 0, 1);
    }
  }
`;

export const IconBox = styled.div`
  display: flex;
`;

export const ContactBlockText = styled.div`
  display: flex;
  flex-direction: column;
`;

export const ContactTitle = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 13px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(124, 0, 2, 1);
`;

export const ContactText = styled.p`
  font-family: Manrope;
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
`;
