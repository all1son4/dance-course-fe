import { allocateInvoice } from "./invoice-repository";
import { projectPaymentStateInTransaction } from "./payment-projection";
import {
  claimNextStripeInboxEvent,
  processNextStripeInboxEvent,
  recordVerifiedStripeEvent,
} from "./stripe-event-inbox";
import {
  claimNextOutboxJob,
  enqueueOutboxJob,
  enqueueOutboxJobInTransaction,
  processNextOutboxJob,
} from "./transactional-outbox";

// This is the database-facing composition root for the domains introduced during
// the DB phase. Runtime routes choose a domain mode separately and never reach
// through this boundary to Google Sheets DTOs.
export const domainRepositories = Object.freeze({
  invoices: Object.freeze({ allocate: allocateInvoice }),
  outbox: Object.freeze({
    claimNext: claimNextOutboxJob,
    enqueue: enqueueOutboxJob,
    enqueueInTransaction: enqueueOutboxJobInTransaction,
    processNext: processNextOutboxJob,
  }),
  paymentProjection: Object.freeze({
    projectInTransaction: projectPaymentStateInTransaction,
  }),
  stripeInbox: Object.freeze({
    claimNext: claimNextStripeInboxEvent,
    processNext: processNextStripeInboxEvent,
    recordVerified: recordVerifiedStripeEvent,
  }),
});
