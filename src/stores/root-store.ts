import { PaymentStore } from "./payment-store";

export class RootStore {
  paymentStore: PaymentStore;

  constructor() {
    this.paymentStore = new PaymentStore();
  }
}
