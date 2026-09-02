import type { ReactNode } from "react";

import SvgAsset from "@/components/common/SvgAsset";

import {
  type ClosedSalesNoticeTone,
  NoticeActionBox,
  NoticeCard,
  NoticeIconBox,
  NoticeText,
} from "./ClosedSalesNotice.styles";

type ClosedSalesNoticeProps = {
  text: string;
  /** Match the section behind it: "dark" sits on the deep-red hero. */
  tone?: ClosedSalesNoticeTone;
  /**
   * Optional action for retryable states (e.g. a refresh button when the
   * sales state could not be read). Closed sales stay action-free: the notice
   * states a fact, it does not sell.
   */
  action?: ReactNode;
};

/**
 * The one way "sales are closed" looks on a product page: a compact status
 * line with the exclamation badge - visibly quieter than a button, so it
 * never reads as one.
 */
export default function ClosedSalesNotice({
  text,
  tone = "light",
  action,
}: ClosedSalesNoticeProps) {
  return (
    <NoticeCard role="status" $tone={tone}>
      <NoticeIconBox>
        <SvgAsset
          src="/svg/Exclamation.webp"
          width={30}
          height={32}
          sizes="30px"
          unoptimized
        />
      </NoticeIconBox>
      <NoticeText $tone={tone}>{text}</NoticeText>
      {action ? <NoticeActionBox>{action}</NoticeActionBox> : null}
    </NoticeCard>
  );
}
