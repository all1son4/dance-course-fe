export const ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW = "admin-offer-link";

export const isAdminOfferAccessWorkflow = (accessWorkflow: string | null | undefined) =>
  (accessWorkflow ?? "").trim().toLowerCase() === ADMIN_TELEGRAM_OFFER_ACCESS_WORKFLOW;
