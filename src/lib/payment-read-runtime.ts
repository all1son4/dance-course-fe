import { domainRepositories } from "@/db/domain-repositories";
import type { PaymentSheetRecord } from "@/lib/google-sheets-schema";

type PaymentRecord = PaymentSheetRecord | null;

export type PaymentReadDependencies = {
  database: {
    findByCheckoutSessionId: (checkoutSessionId: string) => Promise<PaymentRecord>;
    findByPaymentIntentId: (paymentIntentId: string) => Promise<PaymentRecord>;
  };
};

const defaultDependencies: PaymentReadDependencies = {
  database: {
    findByCheckoutSessionId: domainRepositories.paymentReads.findByCheckoutSessionId,
    findByPaymentIntentId: domainRepositories.paymentReads.findByPaymentIntentId,
  },
};

const resolveAccessPaymentRecord = async ({
  checkoutSessionId,
  paymentIntentId,
  source,
}: {
  checkoutSessionId: string;
  paymentIntentId: string;
  source: PaymentReadDependencies["database"];
}) => {
  const paymentIntentRecord = paymentIntentId
    ? await source.findByPaymentIntentId(paymentIntentId)
    : null;

  if (paymentIntentRecord) {
    return paymentIntentRecord;
  }

  const checkoutRecord = await source.findByCheckoutSessionId(checkoutSessionId);

  return checkoutRecord?.outcome === "succeeded" ? checkoutRecord : null;
};

export const findPaymentAccessRecord = ({
  checkoutSessionId,
  dependencies = defaultDependencies,
  paymentIntentId,
}: {
  checkoutSessionId: string;
  dependencies?: PaymentReadDependencies;
  paymentIntentId: string;
}): Promise<PaymentRecord> =>
  resolveAccessPaymentRecord({
    checkoutSessionId,
    paymentIntentId,
    source: dependencies.database,
  });
