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
  claimNextStripeInboxEvent,
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
// the DB phase. Runtime routes choose a domain mode separately and never reach
// through this boundary to Google Sheets DTOs.
export const domainRepositories = Object.freeze({
  adminOfferGrants: Object.freeze({ create: createAdminOfferGrantInDatabase }),
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
  stripeInbox: Object.freeze({
    claimNext: claimNextStripeInboxEvent,
    processNext: processNextStripeInboxEvent,
    recordVerified: recordVerifiedStripeEvent,
    replay: replayStripeInboxEvent,
  }),
  telegramAccess: Object.freeze({
    update: updateTelegramAccessInDatabase,
  }),
});
