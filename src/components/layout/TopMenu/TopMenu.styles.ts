import Link from "next/link";
import styled from "styled-components";

export const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: 40px;
  justify-content: center;
  color: rgba(0, 0, 0, 1);
`;

export const NavLink = styled(Link)`
  font-size: 16px;
  text-decoration: none;
  padding: 6px 0;

  box-sizing: border-box;
  font-weight: 500;
  font-style: normal;
  font-size: 15px;

  line-height: 100%;
  letter-spacing: 0;

  transition: all 0.2s ease;

  &:hover {
    text-decoration: none;
    color: rgba(124, 0, 2, 1);
  }
`;
