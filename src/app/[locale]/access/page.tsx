import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  getSellableProductById,
  getSellableProductOfferById,
} from "@/constants/sellable-products";
import { getDatabase } from "@/db/client";
import { readMyAccessSnapshot } from "@/db/my-access";
import { shouldNameOfferAtCheckout } from "@/lib/choreo-offer-presentation";
import {
  getMyAccessActionAnalytics,
  getMyAccessAnalyticsProperties,
} from "@/lib/my-access/analytics";
import {
  buildMyAccessCards,
  type MyAccessCard,
  type MyAccessLine,
} from "@/lib/my-access/cards";
import { isMyAccessLinkConfigured, verifyMyAccessToken } from "@/lib/my-access/link";
import { OnlineGroup, OnlineInspiration, OnlineVideo } from "@/svg";

import { getCompactSummaryTitle } from "../payment/payment.helpers";
import AccessAnalytics from "./access-analytics";
import {
  AccessCard,
  AccessHeading,
  AccessPanel,
  AccessSection,
  CardList,
  CardNote,
  CardProgress,
  CardStatus,
  CardText,
  CardTitleRow,
  EmptyState,
  HelpRow,
  StatusChip,
} from "./page.styles";
import RequestLinkForm from "./request-link-form";

// Personal data behind a personal link: rendered per request, never cached.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("MyAccessPage");

  return {
    title: t("metaTitle"),
    referrer: "no-referrer",
    robots: {
      follow: false,
      index: false,
      nocache: true,
      googleBot: { follow: false, index: false, noimageindex: true },
    },
  };
}

type AccessPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DATE_VALUE_KEYS = new Set(["date", "start", "end"]);

const CARD_ICONS = {
  channel: OnlineVideo,
  group: OnlineGroup,
  hub: OnlineInspiration,
  lifetime: OnlineVideo,
} as const;

/** The share of a running window still ahead, 0..1. */
const remainingShare = (period: { start: string; end: string }, now: Date) => {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  if (!(end > start)) return 0;
  return Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)));
};

export default async function AccessPage({ searchParams }: AccessPageProps) {
  if (!isMyAccessLinkConfigured()) {
    notFound();
  }

  const [params, locale, t, productT] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("MyAccessPage"),
    getTranslations("SellableProducts"),
  ]);
  const rawToken = Array.isArray(params.k) ? params.k[0] : params.k;
  const customerId = verifyMyAccessToken(rawToken);
  const snapshot = customerId
    ? await readMyAccessSnapshot(getDatabase(), customerId)
    : null;

  const formatDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  });
  const translateLine = ({ key, values }: MyAccessLine) =>
    t(
      `cards.${key}`,
      Object.fromEntries(
        Object.entries(values ?? {}).map(([name, value]) => [
          name,
          DATE_VALUE_KEYS.has(name) && typeof value === "string"
            ? formatDate.format(new Date(value))
            : value,
        ]),
      ),
    );
  const cardTitle = (card: MyAccessCard) => {
    if (card.title === "hub") return t("cards.hubTitle");

    const product = getSellableProductById(card.title.productExternalId);
    if (!product) return t("cards.fallbackTitle");

    const offer = getSellableProductOfferById(product, card.title.offerExternalId);
    const title = product.checkoutTitleKey
      ? productT(product.checkoutTitleKey)
      : getCompactSummaryTitle(productT(product.titleKey));

    return offer && shouldNameOfferAtCheckout(product, offer.id)
      ? `${title} · ${productT(offer.labelKey)}`
      : title;
  };

  if (!snapshot) {
    return (
      <AccessSection data-analytics-private>
        <AccessAnalytics
          properties={getMyAccessAnalyticsProperties(
            rawToken ? "invalid_link" : "link_required",
          )}
        />
        <AccessPanel>
          <AccessHeading>
            <h1>{t("title")}</h1>
            <p>{t(rawToken ? "request.invalidLink" : "request.lead")}</p>
          </AccessHeading>
          <RequestLinkForm
            locale={locale}
            texts={{
              emailLabel: t("request.emailLabel"),
              error: t("request.error"),
              invalid: t("request.invalid"),
              sent: t("request.sent"),
              submit: t("request.submit"),
            }}
          />
        </AccessPanel>
      </AccessSection>
    );
  }

  const now = new Date();
  const cards = buildMyAccessCards(snapshot, now);

  return (
    <AccessSection data-analytics-private>
      <AccessAnalytics
        properties={getMyAccessAnalyticsProperties(
          cards.length ? "ready" : "empty",
          cards,
        )}
      />
      <AccessPanel>
        <AccessHeading>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </AccessHeading>
        {cards.length === 0 ? (
          <EmptyState>
            <p>{t("empty.text")}</p>
            <Button
              buttonText={t("empty.button")}
              href="/online"
              size="sm"
              variant="secondary"
              width="240px"
              analytics={{ id: "my_access_browse_catalog", placement: "my_access_empty" }}
            />
          </EmptyState>
        ) : (
          <CardList>
            {cards.map((card) => {
              const Icon = CARD_ICONS[card.kind];
              const needsAction = card.chip === "endsSoon" || card.chip === "notJoined";

              return (
                <AccessCard key={card.id} $needsAction={needsAction}>
                  <Icon />
                  <CardText>
                    <CardTitleRow>
                      <strong>
                        {cardTitle(card)}
                        {card.count > 1 && (
                          <span aria-label={t("cards.count", { count: card.count })}>
                            × {card.count}
                          </span>
                        )}
                      </strong>
                      <StatusChip $tone={card.chip}>
                        {t(`cards.chips.${card.chip}`)}
                      </StatusChip>
                    </CardTitleRow>
                    <CardStatus>{translateLine(card.status)}</CardStatus>
                    {card.period && (
                      <CardProgress
                        aria-hidden
                        $remaining={remainingShare(card.period, now)}
                        $urgent={card.chip === "endsSoon"}
                      />
                    )}
                    {card.note && <CardNote>{translateLine(card.note)}</CardNote>}
                  </CardText>
                  {card.action && (
                    <Button
                      buttonText={t(`cards.actions.${card.action.key}`)}
                      href={card.action.href}
                      prefetch={false}
                      rel="nofollow"
                      size="sm"
                      width={card.action.key === "support" ? "240px" : "200px"}
                      analytics={getMyAccessActionAnalytics(card)}
                      {...(card.action.key === "support"
                        ? { target: "_blank", variant: "secondary" as const }
                        : {})}
                    />
                  )}
                </AccessCard>
              );
            })}
          </CardList>
        )}
        <HelpRow>
          <p>{t("help.text")}</p>
          <Button
            buttonText={t("help.button")}
            href={SUPPORT_TELEGRAM_URL}
            target="_blank"
            size="sm"
            variant="secondary"
            width="240px"
            analytics={{ id: "my_access_contact_support", placement: "my_access_footer" }}
          />
        </HelpRow>
      </AccessPanel>
    </AccessSection>
  );
}
