import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import Button from "@/components/common/Button";
import TrackedAnchor from "@/components/common/TrackedAnchor";
import { INSTAGRAM_PROFILE_URL, SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { getDatabase } from "@/db/client";
import { readMyAccessSnapshot } from "@/db/my-access";
import { Link } from "@/i18n/navigation";
import { buildInvitationUrl } from "@/lib/access-invitations/link";
import { warsawDaysBetween } from "@/lib/inspiration-hub/calendar";
import {
  getAccessCardTitle,
  getAccessProductPagePath,
  getAccessProductTitle,
  readMyAccessNextStep,
  readMyAccessSales,
} from "@/lib/my-access/access.helpers";
import {
  getMyAccessActionAnalytics,
  getMyAccessAnalyticsProperties,
} from "@/lib/my-access/analytics";
import {
  buildMyAccessCalendarFeedPath,
  buildMyAccessCalendarHref,
  buildMyAccessCalendarSubscription,
  NEXT_CYCLE_EVENT,
} from "@/lib/my-access/calendar";
import {
  buildMyAccessCards,
  type MyAccessCard,
  type MyAccessLine,
} from "@/lib/my-access/cards";
import {
  buildMyAccessCount,
  getMyAccessCardDetail,
  getMyAccessCardNote,
} from "@/lib/my-access/count";
import { createAccessDates } from "@/lib/my-access/dates";
import {
  getDaypart,
  getFirstName,
  type GreetingPools,
  pickGreeting,
  resolveTimeZone,
} from "@/lib/my-access/greeting";
import { buildMyAccessJourney } from "@/lib/my-access/journey";
import {
  createMyAccessCalendarToken,
  isMyAccessLinkConfigured,
  verifyMyAccessToken,
} from "@/lib/my-access/link";
import { groupMyAccessCards, type MyAccessZone } from "@/lib/my-access/zones";
import { normalizedSiteUrl } from "@/lib/seo";

import {
  type AchievementStampData,
  AchievementStamps,
  CalendarSubscribe,
  CampaignInkStamp,
  FoldingCard,
  ReissueInvite,
  SavePageLink,
  ShareCourse,
} from "./access-actions";
import AccessAnalytics from "./access-analytics";
import {
  EmptyCard,
  HelpCard,
  JourneyList,
  JourneyStep,
  RequestCard,
  SideCard,
  SideText,
  SideTitle,
} from "./access-aside.styles";
import {
  AccessAside,
  AccessLayout,
  CalendarLink,
  CardActions,
  CardDetail,
  CardHead,
  CardList,
  CardMore,
  CardNote,
  CardSummary,
  CardTitle,
  QuietLink,
  StatusChip,
  Zone,
  ZoneHeader,
  ZoneList,
  ZoneTray,
} from "./access-cards.styles";
import { AccessCount } from "./access-count";
import {
  ACCESS_APPEAR_CSS,
  ACCESS_CANVAS_CSS,
  AccessHeader,
  AccessSection,
  Eyebrow,
  Facts,
  Greeting,
  Intro,
  VisuallyHidden,
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
/** The chips that ask for something; the count already tells how the time goes. */
const ATTENTION_CHIPS = new Set([
  "linkExpired",
  "notJoined",
  "confirmTelegram",
  "endsSoon",
]);

const AccessCanvas = ({
  children,
  daypart,
}: {
  children: React.ReactNode;
  daypart?: string;
}) => (
  <AccessSection data-analytics-private data-canvas="porcelain" data-daypart={daypart}>
    <style href="access-porcelain-canvas" precedence="default">
      {ACCESS_CANVAS_CSS + ACCESS_APPEAR_CSS}
    </style>
    {children}
  </AccessSection>
);

const CalendarIcon = () => (
  <svg
    aria-hidden
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
  >
    <rect x="2" y="3" width="12" height="11" rx="2.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
  </svg>
);

export default async function AccessPage({ searchParams }: AccessPageProps) {
  if (!isMyAccessLinkConfigured()) {
    notFound();
  }

  const [params, locale, t, productT, blackFridayT, requestHeaders] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("MyAccessPage"),
    getTranslations("SellableProducts"),
    getTranslations("BlackFriday"),
    headers(),
  ]);
  const rawToken = Array.isArray(params.k) ? params.k[0] : params.k;
  const customerId = verifyMyAccessToken(rawToken);
  const snapshot = customerId
    ? await readMyAccessSnapshot(getDatabase(), customerId)
    : null;

  if (!snapshot || !rawToken || !customerId) {
    return (
      <AccessCanvas>
        <AccessAnalytics
          properties={getMyAccessAnalyticsProperties(
            rawToken ? "invalid_link" : "link_required",
          )}
        />
        <AccessHeader>
          <Greeting>{t("title")}</Greeting>
          <Intro>{t(rawToken ? "request.invalidLink" : "request.lead")}</Intro>
        </AccessHeader>
        <RequestCard>
          <RequestLinkForm
            locale={locale}
            texts={{
              emailLabel: t("request.emailLabel"),
              emailSuggestion: t("request.emailSuggestion"),
              error: t("request.error"),
              invalid: t("request.invalid"),
              sent: t("request.sent"),
              submit: t("request.submit"),
            }}
          />
        </RequestCard>
      </AccessCanvas>
    );
  }

  const now = new Date();
  // The reader's hour by the time zone Vercel derives from the IP; Warsaw otherwise.
  const daypart = getDaypart(
    now,
    resolveTimeZone(requestHeaders.get("x-vercel-ip-timezone")),
  );
  const firstName = getFirstName(snapshot.customerFullName);
  // Raw pools: «{name}» is filled in here, after one greeting is picked.
  const greeting = pickGreeting(
    t.raw(firstName ? "greeting.withName" : "greeting.plain") as GreetingPools,
    daypart,
    firstName,
  );

  // A button appears only where the checkout would accept the payment right now.
  const sales = await readMyAccessSales();
  const cards = buildMyAccessCards(snapshot, now, sales);
  const nextStep = await readMyAccessNextStep(snapshot, now, sales.isOpen);
  const journey = buildMyAccessJourney(snapshot, cards).flatMap((step) => {
    const title = getAccessProductTitle(step.productExternalId, productT);
    return title ? [{ ...step, title }] : [];
  });

  const dates = createAccessDates(locale);
  const { dayMonth, formatDate, formatYear, keepTogether, monthAfterDay, purchaseDay } =
    dates;
  const translateLine = ({ key, values }: MyAccessLine) =>
    t(
      `cards.${key}`,
      Object.fromEntries(
        Object.entries(values ?? {}).map(([name, value]) => [
          name,
          DATE_VALUE_KEYS.has(name) && typeof value === "string"
            ? keepTogether(formatDate.format(new Date(value)))
            : value,
        ]),
      ),
    );
  const calendarHref = (eventId: string) =>
    buildMyAccessCalendarHref(rawToken, eventId, locale);

  // Facts for the header: since the first purchase, and how many purchases.
  const since = snapshot.purchases[0]?.boughtAt;

  const calendarToken = createMyAccessCalendarToken(customerId);
  const hasDates =
    cards.some((card) => card.calendar) || Boolean(nextStep && !nextStep.started);
  const subscription =
    calendarToken && hasDates
      ? buildMyAccessCalendarSubscription(
          normalizedSiteUrl,
          buildMyAccessCalendarFeedPath(calendarToken, locale),
        )
      : null;

  /**
   * The chip in a card's corner, short but saying what is wrong: which link
   * expired, where the reader is not yet, that it ends soon. The number of days
   * is the count's to say; the chip never repeats it.
   */
  const chipText = (card: MyAccessCard) => {
    if (card.chip === "notJoined") {
      const where =
        card.kind === "group" ? "Group" : card.kind === "hub" ? "Hub" : "Channel";
      return t(`cards.chips.notJoined${where}`);
    }
    return t(`cards.chips.${card.chip}`);
  };

  const renderCard = (card: MyAccessCard, zone: MyAccessZone) => {
    const counted = buildMyAccessCount(card, now);
    const detail = getMyAccessCardDetail(card);
    const note = getMyAccessCardNote(card);
    const title = getAccessCardTitle(card, t, productT);
    const detailsId = `access-card-${card.id}`;
    const summary = !counted && (detail ?? note);
    // Folding pays only when the open card shows more than the folded one.
    const foldable =
      Boolean(card.action || card.calendar) ||
      [detail, note].some((line) => line && line !== summary);

    return (
      <FoldingCard
        campaign={card.campaign === "black-friday"}
        // What waits on the reader stays open: its button must be in sight.
        defaultOpen={zone === "action"}
        detailsId={detailsId}
        foldable={foldable}
        key={card.id}
        label={title}
      >
        <CardHead>
          <CardTitle>
            {title}
            {card.count > 1 && (
              <span aria-label={t("cards.count", { count: card.count })}>
                × {card.count}
              </span>
            )}
          </CardTitle>
          {ATTENTION_CHIPS.has(card.chip) && (
            <StatusChip
              $tone={
                card.chip as "linkExpired" | "notJoined" | "confirmTelegram" | "endsSoon"
              }
            >
              {chipText(card)}
            </StatusChip>
          )}
        </CardHead>
        {summary && <CardSummary>{translateLine(summary)}</CardSummary>}
        {counted && <AccessCount count={counted} dates={dates} t={t} />}
        {card.campaign === "black-friday" && (
          <CampaignInkStamp label={blackFridayT("ribbon.title")} />
        )}
        <CardMore id={detailsId}>
          {detail && <CardDetail>{translateLine(detail)}</CardDetail>}
          {note && <CardNote>{translateLine(note)}</CardNote>}
          {(card.action || card.calendar) && (
            <CardActions>
              {card.action?.key === "reissue" ? (
                <ReissueInvite
                  cardId={card.id}
                  supportHref={card.action.href}
                  texts={{
                    button: t("cards.actions.reissue"),
                    failed: t("invite.failed"),
                    limited: t("invite.limited"),
                    sent: t("invite.sent"),
                    support: t("invite.support"),
                  }}
                  token={rawToken}
                />
              ) : card.action ? (
                <Button
                  analytics={getMyAccessActionAnalytics(card)}
                  buttonText={t(`cards.actions.${card.action.key}`)}
                  href={
                    card.action.key === "confirmTelegram"
                      ? (buildInvitationUrl(card.action.purchaseId ?? "", locale) ??
                        SUPPORT_TELEGRAM_URL)
                      : card.action.href
                  }
                  prefetch={false}
                  rel="nofollow"
                  size="xs"
                  width="max-content"
                  {...(card.action.key === "support"
                    ? { target: "_blank", variant: "secondary" as const }
                    : {})}
                />
              ) : null}
              {card.calendar && (
                <CalendarLink href={calendarHref(card.id)} rel="nofollow">
                  <CalendarIcon />
                  {t("calendar.add")}
                </CalendarLink>
              )}
            </CardActions>
          )}
        </CardMore>
      </FoldingCard>
    );
  };

  const zones = groupMyAccessCards(cards);

  // Shared only while the course is on sale (its page then sells it); the first
  // shareable step carries the «Нажми, чтобы поделиться» hint.
  const sharePaths = journey.map((step) =>
    sales.openProductIds.has(step.productExternalId)
      ? getAccessProductPagePath(step.productExternalId)
      : null,
  );
  const firstShare = sharePaths.findIndex(Boolean);

  const nextTerm =
    nextStep && !nextStep.started ? (
      <AccessCount
        count={{
          at: nextStep.startsAt,
          days: Math.max(0, warsawDaysBetween(now, new Date(nextStep.startsAt))),
          kind: "startsIn",
        }}
        dates={dates}
        t={t}
      />
    ) : null;

  const stamps: AchievementStampData[] = [];
  if (snapshot.legendCycles) {
    stamps.push({
      count: snapshot.legendCycles,
      ink: "wine",
      texts: {
        label: t("legend.label", { count: snapshot.legendCycles }),
        name: t("legend.name"),
        text: t("legend.text", { last: snapshot.legendCycles }),
        unit: t("legend.unit", { count: snapshot.legendCycles }),
      },
    });
  } else if (snapshot.cycleStreak) {
    stamps.push({
      count: snapshot.cycleStreak.count,
      ink: "black",
      texts: {
        label: t("inARow.label", snapshot.cycleStreak),
        name: t("inARow.name"),
        text: t("inARow.text", snapshot.cycleStreak),
        unit: t("inARow.unit", { count: snapshot.cycleStreak.count }),
      },
    });
  }
  if (snapshot.freshman) {
    stamps.push({
      ink: "olive",
      texts: {
        label: t("freshman.label"),
        name: t("freshman.name"),
        text: t("freshman.text"),
        unit: t("freshman.unit"),
      },
    });
  }

  return (
    <AccessCanvas daypart={daypart}>
      <AccessAnalytics
        properties={getMyAccessAnalyticsProperties(
          cards.length ? "ready" : "empty",
          cards,
        )}
      />
      <AccessHeader>
        <Eyebrow>{t("title")}</Eyebrow>
        <Greeting>{greeting}</Greeting>
        <Intro>{t("intro")}</Intro>
        {since && (
          <Facts>
            <li>
              <b>
                {t("facts.since", {
                  month: monthAfterDay(since),
                  year: formatYear.format(since),
                })}
              </b>
            </li>
            <li>{t("facts.purchases", { count: snapshot.purchases.length })}</li>
            <li>
              <SavePageLink
                texts={{
                  private: t("keep.private"),
                  save: t("keep.save"),
                  saved: t("keep.saved"),
                }}
                title={t("metaTitle")}
              />
            </li>
          </Facts>
        )}
        {stamps.length > 0 ? <AchievementStamps stamps={stamps} /> : null}
      </AccessHeader>

      <AccessLayout>
        {cards.length === 0 ? (
          <EmptyCard>
            <p>{t("empty.text")}</p>
            <Button
              analytics={{ id: "my_access_browse_catalog", placement: "my_access_empty" }}
              buttonText={t("empty.button")}
              href="/online"
              size="xs"
              width="max-content"
            />
          </EmptyCard>
        ) : (
          <ZoneList>
            {zones.map(({ cards: zoneCards, zone }) => (
              <Zone
                $tone={zone === "action" ? "action" : "calm"}
                aria-labelledby={`access-zone-${zone}`}
                key={zone}
              >
                <ZoneHeader id={`access-zone-${zone}`}>{t(`zones.${zone}`)}</ZoneHeader>
                <ZoneTray>
                  <CardList>{zoneCards.map((card) => renderCard(card, zone))}</CardList>
                </ZoneTray>
              </Zone>
            ))}
          </ZoneList>
        )}

        <AccessAside $belowZoneHeader={cards.length > 0}>
          {nextStep && (
            <SideCard aria-labelledby="access-next">
              <Eyebrow>{t("next.eyebrow")}</Eyebrow>
              <SideTitle id="access-next">{t("next.cohortTitle")}</SideTitle>
              {nextTerm ?? (
                <SideText>
                  {t("count.since", { date: dayMonth(nextStep.startsAt) })}
                </SideText>
              )}
              <SideText>
                {nextStep.kind === "renewal"
                  ? t("next.renewal")
                  : t("next.join", { weeks: nextStep.durationWeeks })}
              </SideText>
              <CardActions>
                <Button
                  analytics={{
                    id:
                      nextStep.kind === "renewal"
                        ? "my_access_renew_group"
                        : "my_access_explore_group",
                    placement: "my_access_next",
                  }}
                  buttonText={t(
                    nextStep.kind === "renewal" ? "next.renewButton" : "next.joinButton",
                  )}
                  href={nextStep.href}
                  prefetch={false}
                  size="xs"
                  width="max-content"
                />
                {!nextStep.started && (
                  <CalendarLink href={calendarHref(NEXT_CYCLE_EVENT)} rel="nofollow">
                    <CalendarIcon />
                    {t("calendar.add")}
                  </CalendarLink>
                )}
              </CardActions>
            </SideCard>
          )}
          {!nextStep && (
            <SideCard aria-labelledby="access-announcements">
              <Eyebrow id="access-announcements">{t("next.eyebrow")}</Eyebrow>
              <SideText>{t("next.announcements")}</SideText>
              <div>
                <QuietLink
                  href={INSTAGRAM_PROFILE_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("next.instagram")}
                </QuietLink>
              </div>
            </SideCard>
          )}

          {subscription && (
            <SideCard aria-labelledby="access-calendar">
              <Eyebrow id="access-calendar">{t("keep.calendarTitle")}</Eyebrow>
              <SideText>{t("keep.calendarText")}</SideText>
              <CalendarSubscribe
                links={subscription}
                texts={{
                  apple: t("keep.apple"),
                  appleLabel: t("keep.appleLabel"),
                  copied: t("keep.copied"),
                  copiedHint: t("keep.copiedHint"),
                  google: t("keep.google"),
                  googleLabel: t("keep.googleLabel"),
                  other: t("keep.other"),
                  otherLabel: t("keep.otherLabel"),
                }}
              />
            </SideCard>
          )}

          {journey.length > 0 && (
            <SideCard aria-labelledby="access-journey">
              <Eyebrow id="access-journey">{t("journey.eyebrow")}</Eyebrow>
              <JourneyList>
                {journey.map((step, index) => {
                  const pagePath = sharePaths[index];
                  return (
                    <JourneyStep $live={step.live} key={step.productExternalId}>
                      <i aria-hidden>{index + 1}</i>
                      <div>
                        <b>
                          {step.title}
                          {step.live && <em aria-hidden>LIVE</em>}
                        </b>
                        {step.completedCohorts ? (
                          <span>
                            {t("journey.completedCohorts", {
                              count: step.completedCohorts,
                            })}
                          </span>
                        ) : null}
                        <span>
                          {t(
                            step.purchasedAt === step.since
                              ? "journey.bought"
                              : "journey.lastBought",
                            { date: purchaseDay(step.purchasedAt) },
                          )}
                          {step.live && (
                            <VisuallyHidden> · {t("journey.live")}</VisuallyHidden>
                          )}
                        </span>
                      </div>
                      {pagePath && (
                        <ShareCourse
                          hint={index === firstShare ? t("journey.hint") : undefined}
                          label={t("journey.share", { title: step.title })}
                          texts={{ copied: t("journey.copied") }}
                          title={step.title}
                          url={`${normalizedSiteUrl}${pagePath}`}
                        />
                      )}
                    </JourneyStep>
                  );
                })}
              </JourneyList>
            </SideCard>
          )}

          <HelpCard>
            <p>{t("help.text")}</p>
            <div>
              <TrackedAnchor
                analytics={{
                  id: "my_access_contact_support",
                  placement: "my_access_footer",
                }}
                href={SUPPORT_TELEGRAM_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("help.button")}
              </TrackedAnchor>
              <Link href="/access" prefetch={false}>
                {t("help.resend")}
              </Link>
            </div>
          </HelpCard>
        </AccessAside>
      </AccessLayout>
    </AccessCanvas>
  );
}
