import Link from "next/link";
import styled from "styled-components";

export const FooterBox = styled.footer`
  display: flex;
  flex-direction: column;
  padding: 50px 100px 30px;
  border-radius: 100px 100px 0 0;
  background: rgba(244, 245, 246, 1);
  box-sizing: border-box;
`;

export const TopRow = styled.div`
  display: flex;
  gap: 20px;
  justify-content: space-between;
  align-items: center;
`;

export const AddressBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const ContactBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Contact = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;

  & p {
    font-weight: 400;
    font-style: normal;
    font-size: 13px;
    line-height: 120%;
    letter-spacing: 0;
    margin: 0;
    color: rgba(72, 72, 72, 1);
  }
`;

export const AddressItem = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 13px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

export const InfoBlock = styled.div`
  display: flex;
  gap: 80px;
  align-items: flex-start;
`;

export const SupportBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const SupportText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 20px;
  line-height: 100%;
  letter-spacing: 0;
  text-align: right;
  margin: 0;
  color: #000000;
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background: rgba(227, 227, 227, 1);
  padding: 0;
  margin: 30px 0;
  box-sizing: content-box;
`;

export const BottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const CopyRight = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 13px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;

export const PrivacyPolicy = styled(Link)`
  font-weight: 400;
  font-style: normal;
  font-size: 13px;
  line-height: 120%;
  letter-spacing: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  margin: 0;
  color: rgba(72, 72, 72, 1);
  transition: all 0.2s ease;

  &:hover {
    color: #000000;
  }
`;
