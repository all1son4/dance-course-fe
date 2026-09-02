"use client";

import Button from "@/components/common/Button";

import type { ClosedSalesNoticeTone } from "./ClosedSalesNotice.styles";

type RefreshButtonProps = {
  label: string;
  /** Where the retry lives, for analytics (e.g. "birthday_drop_hero"). */
  placement: string;
  tone?: ClosedSalesNoticeTone;
};

/**
 * The action for a retryable sales-state notice on a server-rendered page: a
 * full reload re-reads the catalogue, which is exactly the recovery the
 * "temporarily unavailable" copy promises.
 */
export default function RefreshButton({
  label,
  placement,
  tone = "light",
}: RefreshButtonProps) {
  return (
    <Button
      size="sm"
      width="fit-content"
      buttonText={label}
      variant={tone === "dark" ? "ghost" : "secondary"}
      analytics={{ id: "sales_state_retry", placement }}
      onClick={() => window.location.reload()}
    />
  );
}
