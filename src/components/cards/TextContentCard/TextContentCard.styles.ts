import { styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const CardContainer = styled.div`
  display: grid;
  grid-template-columns: 50px 1fr;
  align-items: flex-start;
  box-sizing: border-box;
  padding: 30px;
  gap: 30px;
  width: 100%;
  max-width: 100%;

  ${glass({
    frost: "static",
    radius: "60px",
    hoverEffect: false,
  })}

  @media (max-width: 880px) {
    --glass-radius: 40px;
  }

  @media (max-width: 450px) {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
`;

export const IconBox = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Title = styled.h3`
  font-weight: 600;
  font-style: semibold;
  font-size: 17px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const Text = styled.div`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);

  p {
    margin: 0;
  }

  p + p {
    margin-top: 20px;
  }

  strong {
    font-weight: 600;
    color: rgba(0, 0, 0, 1);
  }

  ul {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Own marker instead of list-style, so the bullet keeps its distance from the
     text and hanging indent works on wrapped lines. */
  li {
    position: relative;
    padding-left: 22px;
  }

  li::before {
    content: "•";
    position: absolute;
    left: 8px;
    top: 0;
    line-height: inherit;
  }
`;
