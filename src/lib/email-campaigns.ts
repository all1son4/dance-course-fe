import { createHash } from "node:crypto";

import {
  DEFAULT_SITE_HOME_URL,
  INSTAGRAM_PROFILE_URL,
  PERSONAL_TELEGRAM_URL,
} from "@/constants/links";
import {
  buildCheckoutHref,
  getDefaultProductOffer,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { sendResendEmail } from "@/lib/email/resend";
import {
  type EmailCampaignLeadSheetRecord,
  findEmailCampaignLeadByCampaignAndEmail,
  listEmailCampaignLeadRecords,
  upsertEmailCampaignLeadRecord,
} from "@/lib/google-sheets";
import { toUtcIso } from "@/lib/time";

export const FIRST_TOUCH_SALES_START_CAMPAIGN_KEY = "first_touch_sales_start";

export type CreateEmailCampaignLeadInput = {
  campaignKey: string;
  email: string;
  fullName: string;
  locale: string;
  socialContact: string;
};

export type CreateEmailCampaignLeadResult =
  | {
      duplicate: true;
      lead: EmailCampaignLeadSheetRecord;
    }
  | {
      duplicate: false;
      lead: EmailCampaignLeadSheetRecord;
    };

export type EmailCampaignStats = {
  excluded: number;
  failed: number;
  pending: number;
  sent: number;
  total: number;
};

export type EmailCampaignAudienceLead = {
  createdAt: string;
  email: string;
  fullName: string;
  leadId: string;
  locale: string;
  socialContact: string;
  status: "failed" | "pending";
};

export type EmailCampaignAdminSnapshot = {
  audience: EmailCampaignAudienceLead[];
  stats: EmailCampaignStats;
};

export type EmailCampaignExclusionScope = "campaign" | "global";

export type ExcludeEmailCampaignLeadResult =
  | {
      scope: EmailCampaignExclusionScope;
      snapshot: EmailCampaignAdminSnapshot;
      status: "excluded";
    }
  | {
      status: "delivery_in_progress";
    }
  | {
      status: "not_actionable";
    }
  | {
      status: "not_found";
    };

export type EmailCampaignDeliveryResult = EmailCampaignStats & {
  attempted: number;
};

const SITE_HOME_URL =
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  DEFAULT_SITE_HOME_URL;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const pendingEmailCampaignLeadCreates = new Map<
  string,
  Promise<CreateEmailCampaignLeadResult>
>();
let pendingFirstTouchSalesStartCampaignDelivery: Promise<EmailCampaignDeliveryResult> | null =
  null;

export const normalizeEmailCampaignEmail = (value: string) =>
  value.trim().toLowerCase().slice(0, 254);

export const isValidEmailCampaignEmail = (value: string) =>
  EMAIL_RE.test(normalizeEmailCampaignEmail(value));

const getEmailCampaignLeadDedupeKey = ({
  campaignKey,
  email,
}: {
  campaignKey: string;
  email: string;
}) => `${campaignKey.trim()}:${normalizeEmailCampaignEmail(email)}`;

const createLeadId = ({ campaignKey, email }: { campaignKey: string; email: string }) =>
  `lead_${createHash("sha256")
    .update(getEmailCampaignLeadDedupeKey({ campaignKey, email }))
    .digest("hex")
    .slice(0, 24)}`;

const getGloballyBlockedEmails = (rows: EmailCampaignLeadSheetRecord[]) =>
  new Set(
    rows
      .filter((row) => row.email_send_status.trim() === "blocked")
      .map((row) => normalizeEmailCampaignEmail(row.email))
      .filter(Boolean),
  );

const buildEmailCampaignAdminSnapshot = ({
  campaignKey,
  rows,
}: {
  campaignKey: string;
  rows: EmailCampaignLeadSheetRecord[];
}): EmailCampaignAdminSnapshot => {
  const normalizedCampaignKey = campaignKey.trim();
  const globallyBlockedEmails = getGloballyBlockedEmails(rows);
  const campaignRows = rows.filter(
    (row) => row.campaign_key.trim() === normalizedCampaignKey,
  );
  const stats = campaignRows.reduce<EmailCampaignStats>(
    (result, row) => {
      const status = row.email_send_status.trim();
      const isGloballyBlocked = globallyBlockedEmails.has(
        normalizeEmailCampaignEmail(row.email),
      );

      result.total += 1;

      if (status === "sent") {
        result.sent += 1;
      } else if (status === "excluded" || status === "blocked" || isGloballyBlocked) {
        result.excluded += 1;
      } else if (status === "failed") {
        result.failed += 1;
      } else {
        result.pending += 1;
      }

      return result;
    },
    {
      excluded: 0,
      failed: 0,
      pending: 0,
      sent: 0,
      total: 0,
    },
  );
  const audience = campaignRows
    .filter((row) => {
      const status = row.email_send_status.trim();

      return (
        (status === "pending" || status === "failed") &&
        !globallyBlockedEmails.has(normalizeEmailCampaignEmail(row.email))
      );
    })
    .map<EmailCampaignAudienceLead>((row) => ({
      createdAt: row.created_at,
      email: row.email,
      fullName: row.full_name,
      leadId: row.lead_id,
      locale: row.locale,
      socialContact: row.social_contact,
      status: row.email_send_status.trim() === "failed" ? "failed" : "pending",
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return { audience, stats };
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeSiteOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return DEFAULT_SITE_HOME_URL;
  }
};

const getFirstTouchCheckoutUrl = () => {
  const product = SELLABLE_PRODUCTS["first-touch"];
  const offer = getDefaultProductOffer(product);
  const checkoutHref = buildCheckoutHref({
    offerId: offer.id,
    productId: product.id,
  });

  return `${normalizeSiteOrigin(SITE_HOME_URL)}${checkoutHref}`;
};

const getFirstTouchEmailCopy = (locale: string) => {
  const normalizedLocale = locale.trim().toLowerCase();

  if (normalizedLocale.startsWith("en")) {
    return {
      button: "Go to payment",
      contactIntro:
        "If you have any questions, your plans change, or you are not sure which step to take next, message us and we will help.",
      contactInstagramButton: "Message on Instagram",
      contactTelegramButton: "Message on Telegram",
      description: [
        "First Touch is a beginner course for those who have never danced but want to learn body awareness, confidence and movement.",
        "Inside the course we work on basic technique, footwork, emotions, and by the end you will learn your first choreography.",
      ],
      intro:
        "First Touch is ready to start. You can now pay for your place and join the course.",
      steps: [
        "After payment, we will confirm your place in the group.",
        "Next, we will add you to the Telegram group for this First Touch stream.",
        "Inside the group you will receive instructions, lessons, homework and feedback details.",
      ],
      stepsTitle: "What happens after payment",
      subject: "Pay for First Touch and join the course",
      title: "Pay for First Touch",
    };
  }

  if (normalizedLocale.startsWith("pl")) {
    return {
      button: "Przejdź do płatności",
      contactIntro:
        "Jeśli masz pytania, zmieniły Ci się plany albo nie wiesz, jaki jest kolejny krok, napisz do nas - pomożemy.",
      contactInstagramButton: "Napisz na Instagramie",
      contactTelegramButton: "Napisz na Telegramie",
      description: [
        "First Touch to kurs dla początkujących osób, które nigdy nie tańczyły, ale chcą nauczyć się czucia ciała, pewności siebie i ruchu.",
        "Na kursie pracujemy nad bazową techniką, stopami i emocjami, a na końcu poznasz swoją pierwszą choreografię.",
      ],
      intro:
        "First Touch jest gotowy do startu. Możesz już opłacić swoje miejsce i dołączyć do kursu.",
      steps: [
        "Po płatności potwierdzimy Twoje miejsce w grupie.",
        "Następnie dodamy Cię do grupy Telegram tego streamu First Touch.",
        "W grupie otrzymasz instrukcje, lekcje, zadania domowe i informacje o feedbacku.",
      ],
      stepsTitle: "Co wydarzy się po płatności",
      subject: "Opłać First Touch i dołącz do kursu",
      title: "Opłać First Touch",
    };
  }

  return {
    button: "Перейти к оплате",
    contactIntro:
      "Если есть вопросы, изменились планы или ты не уверена в следующем шаге, напиши нам - поможем.",
    contactInstagramButton: "Написать в Instagram",
    contactTelegramButton: "Написать в Telegram",
    description: [
      "First Touch - курс для тех, кто никогда не танцевал, но хочет научиться чувствовать тело, уверенность и движение.",
      "На курсе мы работаем над базовой техникой, стопами, эмоциями и в конце учим твою первую хореографию.",
    ],
    intro:
      "First Touch готов к старту. Сейчас можно оплатить свое место и стать частью курса.",
    steps: [
      "После оплаты мы закрепим за тобой место в группе.",
      "Дальше мы добавим тебя в Telegram-группу этого потока First Touch.",
      "В группе будут инструкции, уроки, домашние задания и детали по обратной связи.",
    ],
    stepsTitle: "Что будет после оплаты",
    subject: "Оплатить First Touch и войти в курс",
    title: "Оплатить First Touch",
  };
};

const buildFirstTouchSalesStartEmail = (lead: EmailCampaignLeadSheetRecord) => {
  const copy = getFirstTouchEmailCopy(lead.locale);
  const checkoutUrl = getFirstTouchCheckoutUrl();
  const safeCheckoutUrl = escapeHtml(checkoutUrl);
  const safeTitle = escapeHtml(copy.title);
  const safeIntro = escapeHtml(copy.intro);
  const safeButton = escapeHtml(copy.button);
  const safeContactIntro = escapeHtml(copy.contactIntro);
  const safeContactInstagramButton = escapeHtml(copy.contactInstagramButton);
  const safeContactTelegramButton = escapeHtml(copy.contactTelegramButton);
  const safeDescription = copy.description.map((item) => escapeHtml(item));
  const safeInstagramUrl = escapeHtml(INSTAGRAM_PROFILE_URL);
  const safeStepsTitle = escapeHtml(copy.stepsTitle);
  const safeSteps = copy.steps.map((item) => escapeHtml(item));
  const safeTelegramUrl = escapeHtml(PERSONAL_TELEGRAM_URL);

  return {
    html: `
      <div style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#121212;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid rgba(18,18,18,0.08);border-radius:24px;padding:32px;">
          <p style="margin:0 0 10px 0;font-size:12px;line-height:18px;letter-spacing:0.1em;text-transform:uppercase;color:#7c0002;font-weight:700;">Frame Up Strip</p>
          <h1 style="margin:0 0 12px 0;font-size:28px;line-height:34px;font-weight:700;color:#121212;">${safeTitle}</h1>
          <p style="margin:0 0 18px 0;font-size:15px;line-height:24px;color:#444444;">${safeIntro}</p>
          ${safeDescription
            .map(
              (item) =>
                `<p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:#444444;">${item}</p>`,
            )
            .join("")}
          <p style="margin:20px 0 8px 0;font-size:16px;line-height:24px;color:#121212;font-weight:700;">${safeStepsTitle}</p>
          <ul style="margin:0 0 24px 20px;padding:0;color:#444444;font-size:15px;line-height:24px;">
            ${safeSteps.map((item) => `<li style="margin:0 0 6px 0;">${item}</li>`).join("")}
          </ul>
          <a href="${safeCheckoutUrl}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#7c0002;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;line-height:20px;border:1px solid #7c0002;">${safeButton}</a>
          <p style="margin:28px 0 12px 0;font-size:15px;line-height:24px;color:#444444;">${safeContactIntro}</p>
          <div style="display:block;margin:0;">
            <a href="${safeTelegramUrl}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:999px;background:#ffffff;color:#7c0002;text-decoration:none;font-weight:700;font-size:14px;line-height:20px;border:1px solid #7c0002;">${safeContactTelegramButton}</a>
            <a href="${safeInstagramUrl}" style="display:inline-block;margin:0 0 8px 0;padding:11px 18px;border-radius:999px;background:#ffffff;color:#7c0002;text-decoration:none;font-weight:700;font-size:14px;line-height:20px;border:1px solid #7c0002;">${safeContactInstagramButton}</a>
          </div>
        </div>
      </div>
    `,
    subject: copy.subject,
    text: [
      copy.title,
      "",
      copy.intro,
      "",
      ...copy.description,
      "",
      copy.stepsTitle,
      ...copy.steps.map((step) => `- ${step}`),
      "",
      checkoutUrl,
      "",
      copy.contactIntro,
      `${copy.contactTelegramButton}: ${PERSONAL_TELEGRAM_URL}`,
      `${copy.contactInstagramButton}: ${INSTAGRAM_PROFILE_URL}`,
    ].join("\n"),
  };
};

const createEmailCampaignLeadInternal = async ({
  campaignKey,
  email,
  fullName,
  locale,
  socialContact,
}: CreateEmailCampaignLeadInput): Promise<CreateEmailCampaignLeadResult> => {
  const normalizedEmail = normalizeEmailCampaignEmail(email);
  const existingLead = await findEmailCampaignLeadByCampaignAndEmail({
    campaignKey,
    email: normalizedEmail,
  });

  if (existingLead) {
    return {
      duplicate: true,
      lead: existingLead,
    };
  }

  const now = toUtcIso();
  const rows = await listEmailCampaignLeadRecords({ cacheTtlMs: 0 });
  const isGloballyBlocked = getGloballyBlockedEmails(rows).has(normalizedEmail);
  const lead: EmailCampaignLeadSheetRecord = {
    campaign_key: campaignKey.trim(),
    created_at: now,
    email: normalizedEmail,
    email_send_attempts: "0",
    email_send_status: isGloballyBlocked ? "blocked" : "pending",
    email_sent_at: "",
    full_name: fullName.trim().slice(0, 120),
    last_email_error: "",
    lead_id: createLeadId({
      campaignKey,
      email: normalizedEmail,
    }),
    locale: locale.trim().slice(0, 20),
    social_contact: socialContact.trim().slice(0, 160),
  };

  await upsertEmailCampaignLeadRecord(lead);

  return {
    duplicate: false,
    lead,
  };
};

export const createEmailCampaignLead = async (
  input: CreateEmailCampaignLeadInput,
): Promise<CreateEmailCampaignLeadResult> => {
  const dedupeKey = getEmailCampaignLeadDedupeKey({
    campaignKey: input.campaignKey,
    email: input.email,
  });
  const pendingCreate = pendingEmailCampaignLeadCreates.get(dedupeKey);

  if (pendingCreate) {
    const result = await pendingCreate;

    return {
      duplicate: true,
      lead: result.lead,
    };
  }

  const createPromise = createEmailCampaignLeadInternal(input).finally(() => {
    pendingEmailCampaignLeadCreates.delete(dedupeKey);
  });

  pendingEmailCampaignLeadCreates.set(dedupeKey, createPromise);

  return createPromise;
};

export const getEmailCampaignAdminSnapshot = async (
  campaignKey: string,
): Promise<EmailCampaignAdminSnapshot> => {
  const rows = await listEmailCampaignLeadRecords({
    cacheTtlMs: 0,
  });

  return buildEmailCampaignAdminSnapshot({ campaignKey, rows });
};

export const getEmailCampaignStats = async (campaignKey: string) =>
  (await getEmailCampaignAdminSnapshot(campaignKey)).stats;

export const excludeEmailCampaignLead = async ({
  campaignKey,
  leadId,
  scope,
}: {
  campaignKey: string;
  leadId: string;
  scope: EmailCampaignExclusionScope;
}): Promise<ExcludeEmailCampaignLeadResult> => {
  if (pendingFirstTouchSalesStartCampaignDelivery) {
    return { status: "delivery_in_progress" };
  }

  const normalizedCampaignKey = campaignKey.trim();
  const normalizedLeadId = leadId.trim();
  const rows = await listEmailCampaignLeadRecords({ cacheTtlMs: 0 });
  const lead = rows.find(
    (row) =>
      row.lead_id.trim() === normalizedLeadId &&
      row.campaign_key.trim() === normalizedCampaignKey,
  );

  if (!lead) {
    return { status: "not_found" };
  }

  const currentStatus = lead.email_send_status.trim();

  if (currentStatus !== "pending" && currentStatus !== "failed") {
    return { status: "not_actionable" };
  }

  await upsertEmailCampaignLeadRecord({
    ...lead,
    email_send_status: scope === "global" ? "blocked" : "excluded",
    last_email_error: "",
  });

  return {
    scope,
    snapshot: await getEmailCampaignAdminSnapshot(normalizedCampaignKey),
    status: "excluded",
  };
};

const deliverFirstTouchSalesStartCampaignInternal =
  async (): Promise<EmailCampaignDeliveryResult> => {
    const rows = await listEmailCampaignLeadRecords({
      cacheTtlMs: 0,
    });
    const globallyBlockedEmails = getGloballyBlockedEmails(rows);
    const deliverableRows = rows.filter(
      (row) =>
        row.campaign_key.trim() === FIRST_TOUCH_SALES_START_CAMPAIGN_KEY &&
        (row.email_send_status.trim() === "pending" ||
          row.email_send_status.trim() === "failed") &&
        !globallyBlockedEmails.has(normalizeEmailCampaignEmail(row.email)),
    );
    let attempted = 0;

    for (const lead of deliverableRows) {
      attempted += 1;
      const attempts = Number.parseInt(lead.email_send_attempts, 10) || 0;
      const now = toUtcIso();

      try {
        const emailPayload = buildFirstTouchSalesStartEmail(lead);
        await sendResendEmail({
          html: emailPayload.html,
          subject: emailPayload.subject,
          text: emailPayload.text,
          to: lead.email,
        });

        await upsertEmailCampaignLeadRecord({
          ...lead,
          email_send_attempts: String(attempts + 1),
          email_send_status: "sent",
          email_sent_at: now,
          last_email_error: "",
        });
      } catch (error) {
        await upsertEmailCampaignLeadRecord({
          ...lead,
          email_send_attempts: String(attempts + 1),
          email_send_status: "failed",
          last_email_error:
            error instanceof Error ? error.message.slice(0, 500) : "unknown_error",
        });
      }
    }

    return {
      ...(await getEmailCampaignStats(FIRST_TOUCH_SALES_START_CAMPAIGN_KEY)),
      attempted,
    };
  };

export const deliverFirstTouchSalesStartCampaign =
  async (): Promise<EmailCampaignDeliveryResult> => {
    if (pendingFirstTouchSalesStartCampaignDelivery) {
      return pendingFirstTouchSalesStartCampaignDelivery;
    }

    pendingFirstTouchSalesStartCampaignDelivery =
      deliverFirstTouchSalesStartCampaignInternal().finally(() => {
        pendingFirstTouchSalesStartCampaignDelivery = null;
      });

    return pendingFirstTouchSalesStartCampaignDelivery;
  };
