import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import TrackedAnchor from "@/components/common/TrackedAnchor";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { readInvitationPage } from "@/lib/access-invitations/service";

import {
  ACCESS_APPEAR_CSS,
  ACCESS_CANVAS_CSS,
  AccessHeader,
  AccessSection,
  Eyebrow,
  Greeting,
  HelpCard,
  Intro,
} from "../access/page.styles";
import { InvitationColumn } from "./invitation.styles";
import InvitationAnalytics from "./invitation-analytics";
import InvitationFlow, { type InvitationTexts } from "./invitation-flow";

// A personal link: rendered per request, never cached, never indexed.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("InvitationPage");

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

type InvitationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ERROR_KEYS = {
  expired: "expired",
  invalid: "invalid",
  revoked: "revoked",
  unavailable: "unavailable",
} as const;

export default async function InvitationPage({ searchParams }: InvitationPageProps) {
  const [params, locale, t] = await Promise.all([
    searchParams,
    getLocale(),
    getTranslations("InvitationPage"),
  ]);
  const token = (Array.isArray(params.k) ? params.k[0] : params.k) ?? "";
  const state = await readInvitationPage(token);

  const help = (
    <HelpCard>
      <div>
        <TrackedAnchor
          analytics={{ id: "invitation_contact_support", placement: "invitation_footer" }}
          href={SUPPORT_TELEGRAM_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("support")}
        </TrackedAnchor>
      </div>
    </HelpCard>
  );

  const canvas = (children: React.ReactNode) => (
    <AccessSection data-analytics-private data-canvas="porcelain">
      <style href="access-porcelain-canvas" precedence="default">
        {ACCESS_CANVAS_CSS + ACCESS_APPEAR_CSS}
      </style>
      {children}
    </AccessSection>
  );

  if (state.status !== "ready" && state.status !== "verified") {
    const key = ERROR_KEYS[state.status];
    return canvas(
      <>
        <InvitationAnalytics properties={{ status: state.status }} />
        <AccessHeader>
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <Greeting>{t(`errors.${key}Title`)}</Greeting>
          <Intro>{t(`errors.${key}`)}</Intro>
        </AccessHeader>
        <InvitationColumn>{help}</InvitationColumn>
      </>,
    );
  }

  const { summary } = state;
  const texts: InvitationTexts = {
    steps: {
      label: t("steps.label"),
      confirm: t("steps.confirm"),
      confirmHint: t("steps.confirmHint"),
      links: t("steps.links"),
      linksHint: t("steps.linksHint"),
      join: t("steps.join"),
      joinHint: t("steps.joinHint"),
    },
    confirm: {
      lead: t("confirm.lead"),
      button: t("confirm.button"),
      opening: t("confirm.opening"),
      checking: t("confirm.checking"),
      noWindow: t("confirm.noWindow"),
      closed: t("confirm.closed"),
      nonceRefreshed: t("confirm.nonceRefreshed"),
      network: t("confirm.network"),
      failed: t("confirm.failed"),
      otherAccount: t("errors.otherAccount"),
      expired: t("errors.expired"),
      revoked: t("errors.revoked"),
    },
    result: {
      title: t("result.title"),
      lead: t("result.lead"),
      mainTitle: t("result.mainTitle"),
      hubTitle: t("result.hubTitle"),
      mainButton: t("result.mainButton"),
      hubButton: t("result.hubButton"),
      linkNote: t("result.linkNote"),
      member: t("result.member"),
      // Filled in by the page with the reader's date format.
      extended: t("result.extended", { date: "{date}" }),
      extendedPlain: t("result.extendedPlain"),
      scheduled: t("result.scheduled", { date: "{date}" }),
      scheduledPlain: t("result.scheduledPlain"),
      unavailable: t("result.unavailable"),
      expired: t("result.expired"),
      retry: t("result.retry"),
      newLink: t("result.newLink"),
      limited: t("result.limited"),
      retryFailed: t("result.retryFailed"),
      emailed: t("result.emailed"),
      myAccess: t("result.myAccess"),
    },
  };

  return canvas(
    <>
      <InvitationAnalytics
        properties={{ invitation_product: summary.product, status: state.status }}
      />
      <AccessHeader>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <Greeting>
          {summary.firstName
            ? t("greeting.withName", { name: summary.firstName })
            : t("greeting.plain")}
        </Greeting>
        <Intro>
          {t(`intro.${summary.product}`, {
            cohort: summary.cohortTitle ?? "Online Group",
          })}
        </Intro>
      </AccessHeader>
      <InvitationColumn>
        <InvitationFlow
          clientId={state.status === "ready" ? state.clientId : ""}
          initial={
            state.status === "verified"
              ? { lines: state.lines, myAccessPath: state.myAccessPath }
              : null
          }
          locale={locale}
          nonce={state.status === "ready" ? state.nonce : ""}
          product={summary.product}
          texts={texts}
          token={token}
        />
        {help}
      </InvitationColumn>
    </>,
  );
}
