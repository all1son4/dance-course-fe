import { getDatabase } from "@/db/client";
import { getActiveOnlineGroupCampaign } from "@/db/online-group-campaigns";
import {
  getOnlineGroupCohortSale,
  type OnlineGroupCohortSaleRefusal,
} from "@/db/online-group-cohort-sale";

export type OnlineGroupSaleRefusal = "campaign_missing" | OnlineGroupCohortSaleRefusal;

type ActiveCampaign = NonNullable<
  Awaited<ReturnType<typeof getActiveOnlineGroupCampaign>>
>;

export type OnlineGroupSale =
  | { campaign: ActiveCampaign; open: true }
  | { campaign: ActiveCampaign | null; open: false; reason: OnlineGroupSaleRefusal };

/**
 * Whether the Online Group can be sold right now, by the same rule the payment route
 * applies (HUB-D13, П9): an active campaign whose main chat has an open cohort whose
 * predecessor is closed. The storefront, the admin switch and the renewal check ask
 * here, so none of them offers a sale the payment would refuse.
 */
export async function getOnlineGroupSale(): Promise<OnlineGroupSale> {
  const campaign = await getActiveOnlineGroupCampaign();

  if (!campaign) {
    return { campaign: null, open: false, reason: "campaign_missing" };
  }

  const sale = await getOnlineGroupCohortSale(getDatabase(), campaign.regularChatId);

  return sale.open
    ? { campaign, open: true }
    : { campaign, open: false, reason: sale.reason };
}

/** Russian, for the admin: what keeps the Online Group closed. */
export const ONLINE_GROUP_SALE_REFUSAL_LABELS: Record<OnlineGroupSaleRefusal, string> = {
  campaign_missing: "Поток не запущен",
  cohort_closed: "Поток с этим основным чатом уже закрыт",
  cohort_not_found: "Нет записи потока для основного чата: её заводит разработчик",
  cohort_sales_disabled:
    "Продажи потока ещё не открыты: их открывает закрытие предыдущего",
  previous_cohort_open: "Предыдущий поток не закрыт",
};
