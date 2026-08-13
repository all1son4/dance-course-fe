import { listAdminInviteLinkHistoryRecordsFromDatabase } from "./admin-invite-link-history";
import { createAdminOfferGrantInDatabase } from "./admin-offer-grants";
import {
  claimEmailCampaignLeadForDelivery,
  createEmailCampaignLeadInDatabase,
  excludeEmailCampaignLeadInDatabase,
  findMonthlyReportRunInDatabase,
  listEmailCampaignLeadsFromDatabase,
  markEmailCampaignLeadFailed,
  markEmailCampaignLeadSent,
  recordMonthlyReportRunInDatabase,
} from "./business-operation-jobs";
import { allocateInvoice, allocateInvoiceForPaymentIntent } from "./invoice-repository";
import { projectPaymentStateInTransaction } from "./payment-projection";
import {
  findLatestPaymentRecordByCheckoutSessionIdFromDatabase,
  findPaymentRecordByIntentIdFromDatabase,
  listPaymentRecordsFromDatabase,
} from "./payment-records";
import {
  findActiveTelegramUserBindingsFromDatabase,
  findEmailCampaignLeadByCampaignAndEmailFromDatabase,
  findLatestTelegramAccessTokenRecordByPaymentIntentIdFromDatabase,
  findMonthlySalesReportRunByKeyFromDatabase,
  findTelegramAccessTokenRecordByTokenHashFromDatabase,
  findTelegramAccessTokenRecordByTokenValueFromDatabase,
  findTelegramUserBindingByPaymentIntentIdFromDatabase,
  findTelegramUserBindingsByCustomerEmailFromDatabase,
  findTelegramUserBindingsByTelegramUserIdAndChatIdFromDatabase,
  findTelegramUserBindingsByTelegramUserIdFromDatabase,
  listEmailCampaignLeadRecordsFromDatabase,
} from "./sheet-records";
import {
  claimNextStripeInboxEvent,
  findStripeInboxReadModel,
  processNextStripeInboxEvent,
  recordVerifiedStripeEvent,
  replayStripeInboxEvent,
} from "./stripe-event-inbox";
import { updateTelegramAccessInDatabase } from "./telegram-access";
import {
  claimNextOutboxJob,
  claimOutboxJobByDeduplicationKey,
  enqueueOutboxJob,
  enqueueOutboxJobInTransaction,
  processNextOutboxJob,
  processOutboxJobByDeduplicationKey,
  replayOutboxJob,
} from "./transactional-outbox";

// This is the database-facing composition root for the domains introduced during
// the DB phase. Runtime routes choose a domain mode separately. Payment and Telegram
// reads deliberately retain flattened compatibility projections during the staged
// cutover; provider access stays outside this boundary.
export const domainRepositories = Object.freeze({
  adminInviteLinkHistory: Object.freeze({
    list: listAdminInviteLinkHistoryRecordsFromDatabase,
  }),
  adminOfferGrants: Object.freeze({ create: createAdminOfferGrantInDatabase }),
  businessOperationReads: Object.freeze({
    findCampaignLead: findEmailCampaignLeadByCampaignAndEmailFromDatabase,
    findMonthlyReportRun: findMonthlySalesReportRunByKeyFromDatabase,
    listCampaignLeads: listEmailCampaignLeadRecordsFromDatabase,
    listInvoicePayments: listPaymentRecordsFromDatabase,
  }),
  emailCampaigns: Object.freeze({
    claimLeadForDelivery: claimEmailCampaignLeadForDelivery,
    createLead: createEmailCampaignLeadInDatabase,
    excludeLead: excludeEmailCampaignLeadInDatabase,
    listLeads: listEmailCampaignLeadsFromDatabase,
    markLeadFailed: markEmailCampaignLeadFailed,
    markLeadSent: markEmailCampaignLeadSent,
  }),
  invoices: Object.freeze({
    allocate: allocateInvoice,
    allocateForPaymentIntent: allocateInvoiceForPaymentIntent,
  }),
  monthlyReports: Object.freeze({
    findRun: findMonthlyReportRunInDatabase,
    recordRun: recordMonthlyReportRunInDatabase,
  }),
  outbox: Object.freeze({
    claimByDeduplicationKey: claimOutboxJobByDeduplicationKey,
    claimNext: claimNextOutboxJob,
    enqueue: enqueueOutboxJob,
    enqueueInTransaction: enqueueOutboxJobInTransaction,
    processByDeduplicationKey: processOutboxJobByDeduplicationKey,
    processNext: processNextOutboxJob,
    replay: replayOutboxJob,
  }),
  paymentProjection: Object.freeze({
    projectInTransaction: projectPaymentStateInTransaction,
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
  telegramAccess: Object.freeze({
    update: updateTelegramAccessInDatabase,
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
    findTokenByValue: findTelegramAccessTokenRecordByTokenValueFromDatabase,
  }),
});
