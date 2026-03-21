import styled from "styled-components";

export const NotFoundContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100dvh;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 0 20px;
`;

export const AbsoluteLogo = styled.div`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  top: 70px;
  left: 0;
  right: 0;
`;

export const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 540px;
`;

export const ErrorText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 26px;
  line-height: 110%;
  letter-spacing: 0;
  text-align: center;
  margin: 10px 0 30px;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 22px;
    margin: 10px 0 20px;
  }

  @media (max-width: 450px) {
    font-size: 20px;
    margin: 10px 0 20px;
  }
`;
