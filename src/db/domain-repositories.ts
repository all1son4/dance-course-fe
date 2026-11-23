import { listAdminInviteLinkHistoryRecordsFromDatabase } from "./admin-invite-link-history";
import { listEmailCampaignLeadRecordsFromDatabase } from "./email-campaign-lead-records";
import { findMonthlySalesReportRunByKeyFromDatabase } from "./monthly-report-run-records";
import {
  findLatestPaymentRecordByCheckoutSessionIdFromDatabase,
  findPaymentRecordByIntentIdFromDatabase,
} from "./payment-records";
import {
  claimNextStripeInboxEvent,
  findStripeInboxReadModel,
  processNextStripeInboxEvent,
  recordVerifiedStripeEvent,
  replayStripeInboxEvent,
} from "./stripe-event-inbox";
import {
  findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase,
  findTelegramAccessTokenRecordByTokenHashFromDatabase,
} from "./telegram-access-token-records";
import {
  findActiveTelegramUserBindingsFromDatabase,
  findTelegramUserBindingByPaymentIntentIdFromDatabase,
  findTelegramUserBindingsByCustomerEmailFromDatabase,
  findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase,
  findTelegramUserBindingsByTelegramUserIdFromDatabase,
} from "./telegram-user-binding-records";

// This is the database-facing composition root for the domains introduced during
// the DB phase. Runtime provider access stays outside this boundary. Payment and
// Telegram reads return the flat record shapes their callers were written against.
export const domainRepositories = Object.freeze({
  adminInviteLinkHistory: Object.freeze({
    list: listAdminInviteLinkHistoryRecordsFromDatabase,
  }),
  businessOperationReads: Object.freeze({
    findMonthlyReportRun: findMonthlySalesReportRunByKeyFromDatabase,
    listCampaignLeads: listEmailCampaignLeadRecordsFromDatabase,
  }),
  paymentReads: Object.freeze({
    findByCheckoutSessionId: findLatestPaymentRecordByCheckoutSessionIdFromDatabase,
    findByPaymentIntentId: findPaymentRecordByIntentIdFromDatabase,
  }),
  stripeInbox: Object.freeze({
    claimNext: claimNextStripeInboxEvent,
    findReadModel: findStripeInboxReadModel,
    processNext: processNextStripeInboxEvent,
    recordVerified: recordVerifiedStripeEvent,
    replay: replayStripeInboxEvent,
  }),
  telegramAccessReads: Object.freeze({
    findActiveBindings: findActiveTelegramUserBindingsFromDatabase,
    findBindingByPaymentIntentId: findTelegramUserBindingByPaymentIntentIdFromDatabase,
    findBindingsByCustomerEmail: findTelegramUserBindingsByCustomerEmailFromDatabase,
    findBindingsByTelegramUserId: findTelegramUserBindingsByTelegramUserIdFromDatabase,
    findBindingsByTelegramUserIdAndChatId:
      findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase,
    findLatestTokenByPaymentIntentId:
      findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase,
    findTokenByHash: findTelegramAccessTokenRecordByTokenHashFromDatabase,
  }),
});
