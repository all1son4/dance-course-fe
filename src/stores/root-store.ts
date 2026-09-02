import { PaymentStore, type PaymentStoreInitialization } from "./payment-store";

export class RootStore {
  paymentStore: PaymentStore;

  constructor(paymentInitialization?: PaymentStoreInitialization) {
    this.paymentStore = new PaymentStore(paymentInitialization);
  }
}
