import styled from "styled-components";

import { Link } from "@/i18n/navigation";

export const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 40px;
  justify-content: center;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 1024px) {
    gap: 20px;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const NavLink = styled(Link).attrs({ prefetch: false })<{ $selected: boolean }>`
  font-size: 16px;
  text-decoration: none;
  padding: 6px 0;

  box-sizing: border-box;
  font-weight: 500;
  font-style: normal;
  font-size: 15px;

  line-height: 100%;
  letter-spacing: 0;

  transition: color 0.2s ease;

  ${({ $selected }) =>
    $selected &&
    `
    color: rgba(124, 0, 2, 1);
  `}

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      text-decoration: none;
      color: rgba(124, 0, 2, 1);
    }
  }

  @media (max-width: 767px) {
    padding: 0;
    font-size: 17px;
  }
`;
