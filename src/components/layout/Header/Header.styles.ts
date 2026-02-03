import Link from "next/link";
import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const HeaderWrap = styled.header`
  position: fixed;
  top: 20px;
  left: 0;
  right: 0;
  z-index: 50;
  padding: 0 50px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  background: transparent;
`;

export const Pill = styled.div`
  width: 100%;
  margin: 0 auto;
  height: 84px;

  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 26px 50px;

  ${glass({
    radius: "100px",
  })}
`;

export const Brand = styled(Link)`
  display: flex;

  &:hover {
    text-decoration: none;
  }
`;

export const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 40px;
`;

export const Divider = styled.div`
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.4);
`;
