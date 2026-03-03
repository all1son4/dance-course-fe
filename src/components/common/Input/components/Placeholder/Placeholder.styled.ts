import styled from "styled-components";

export const PlaceholderBox = styled.p`
  margin: 0;
  z-index: 1;
  position: absolute;
  background: transparent;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: rgba(72, 72, 72, 1);
  opacity: 0.8;
  transition: all 0.2s ease;
`;
