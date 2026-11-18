import type { ManagedPaymentIntentOutcome } from "@/app/api/stripe/payment-intent/lib";

export type SuccessPageOutcomeAction =
  "redirect_failed" | "show_pending" | "show_success" | "verification_unavailable";

export const resolveSuccessPageOutcomeAction = (
  outcome: ManagedPaymentIntentOutcome | null | undefined,
): SuccessPageOutcomeAction => {
  if (outcome === "succeeded") {
    return "show_success";
  }

  if (outcome === "failed" || outcome === "canceled") {
    return "redirect_failed";
  }

  if (outcome === "processing" || outcome === "requires_action") {
    return "show_pending";
  }

  return "verification_unavailable";
};

/**
 * Puts a long date into a sentence. Russian long dates end in «г.», so a
 * sentence that ends on the date gets no second full stop («2026 г.. В этот…»).
 */
export const insertSuccessDate = (template: string, date: string) =>
  template.replace(/\{date\}(\.?)/u, (_, stop: string) =>
    stop && date.endsWith(".") ? date : `${date}${stop}`,
  );
