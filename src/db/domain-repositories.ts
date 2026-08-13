import { createAdminOfferGrantInDatabase } from "./admin-offer-grants";
import { allocateInvoice } from "./invoice-repository";
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
  enqueueOutboxJob,
  enqueueOutboxJobInTransaction,
  processNextOutboxJob,
  replayOutboxJob,
} from "./transactional-outbox";

// This is the database-facing composition root for the domains introduced during
// the DB phase. Runtime routes choose a domain mode separately and never reach
// through this boundary to Google Sheets DTOs.
export const domainRepositories = Object.freeze({
  adminOfferGrants: Object.freeze({ create: createAdminOfferGrantInDatabase }),
  invoices: Object.freeze({ allocate: allocateInvoice }),
  outbox: Object.freeze({
    claimNext: claimNextOutboxJob,
    enqueue: enqueueOutboxJob,
    enqueueInTransaction: enqueueOutboxJobInTransaction,
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
