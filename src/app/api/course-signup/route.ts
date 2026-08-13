import {
  createEmailCampaignLead,
  FIRST_TOUCH_SALES_START_CAMPAIGN_KEY,
  getEmailCampaignPersistenceErrorDetails,
  isEmailCampaignPersistenceRateLimitError,
  isValidEmailCampaignEmail,
  normalizeEmailCampaignEmail,
} from "@/lib/email-campaigns";
import {
  getBrowserJsonRequestErrorResponse,
  jsonErrorNoStore,
  jsonNoStore,
  parseJsonBody,
} from "@/lib/http-security";
import { consumeRequestRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_COURSE_SIGNUP_BODY_BYTES = 8 * 1024;
const MAX_FIELD_LENGTH = 500;

type CourseSignupBody = {
  consentAccepted?: boolean;
  email?: string;
  fullName?: string;
  locale?: string;
  socialContact?: string;
};

const normalizeText = (value: unknown, maxLength = MAX_FIELD_LENGTH) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export async function POST(request: Request) {
  const requestErrorResponse = getBrowserJsonRequestErrorResponse(
    request,
    MAX_COURSE_SIGNUP_BODY_BYTES,
  );

  if (requestErrorResponse) {
    return requestErrorResponse;
  }

  const rateLimit = await consumeRequestRateLimit({
    keyPrefix: "course-signup",
    limit: 30,
    request,
    windowMs: 60_000,
  });

  if (rateLimit.limited) {
    return jsonErrorNoStore("rate_limited", {
      headers: {
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
      status: 429,
    });
  }

  const body = await parseJsonBody<CourseSignupBody>(request);

  if (!body) {
    return jsonErrorNoStore("invalid_request_body", { status: 400 });
  }

  const fullName = normalizeText(body.fullName, 120);
  const socialContact = normalizeText(body.socialContact, 160);
  const email = normalizeEmailCampaignEmail(normalizeText(body.email, 254));
  const locale = normalizeText(body.locale, 20);

  if (!fullName || !socialContact || !email) {
    return jsonErrorNoStore("missing_required_fields", { status: 400 });
  }

  if (!isValidEmailCampaignEmail(email)) {
    return jsonErrorNoStore("invalid_email", { status: 400 });
  }

  if (body.consentAccepted !== true) {
    return jsonErrorNoStore("missing_consent", { status: 400 });
  }

  try {
    const result = await createEmailCampaignLead({
      campaignKey: FIRST_TOUCH_SALES_START_CAMPAIGN_KEY,
      email,
      fullName,
      locale,
      socialContact,
    });

    if (result.duplicate) {
      return jsonErrorNoStore("duplicate_email", { status: 409 });
    }

    return jsonNoStore({
      status: "registered",
    });
  } catch (error) {
    if (isEmailCampaignPersistenceRateLimitError(error)) {
      return jsonErrorNoStore("rate_limited", {
        headers: {
          "Retry-After": "20",
        },
        status: 429,
      });
    }

    const persistenceErrorDetails = getEmailCampaignPersistenceErrorDetails(error);

    if (persistenceErrorDetails) {
      console.error(
        "Failed to store course signup lead in legacy persistence",
        persistenceErrorDetails,
      );

      return jsonErrorNoStore("course_signup_failed", { status: 500 });
    }

    console.error("Failed to store course signup lead", error);

    return jsonErrorNoStore("course_signup_failed", { status: 500 });
  }
}
