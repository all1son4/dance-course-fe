import SvgAsset from "@/components/common/SvgAsset";

import { NoticeCard, NoticeIconBox, NoticeText } from "./ClosedSalesNotice.styles";

type ClosedSalesNoticeProps = {
  text: string;
};

/**
 * The one way "sales are closed" looks on a product page: a small glass card
 * with the exclamation badge and a single line of copy. Deliberately no call
 * to action - it states a fact, it does not sell.
 */
export default function ClosedSalesNotice({ text }: ClosedSalesNoticeProps) {
  return (
    <NoticeCard role="status">
      <NoticeIconBox>
        <SvgAsset
          src="/svg/Exclamation.webp"
          width={57}
          height={60}
          sizes="(max-width: 767px) 34px, 57px"
          unoptimized
        />
      </NoticeIconBox>
      <NoticeText>{text}</NoticeText>
    </NoticeCard>
  );
}
