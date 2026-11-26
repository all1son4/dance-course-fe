import assert from "node:assert/strict";
import test from "node:test";

import { getPaymentCustomerSchema } from "@/lib/checkout/payment.validation";

const valid = {
  address: "ul. Testowa 1",
  city: "Warszawa",
  country: "PL",
  email: "anna@gmail.com",
  fullName: "Anna Test",
  instagram: "anna.test",
  lessonLanguage: "ru",
  postalCode: "00-001",
};

const isValidEmail = (email: string) =>
  getPaymentCustomerSchema("ru").isValidSync({ ...valid, email });

test("checkout refuses an email whose domain has no dot", () => {
  assert.equal(isValidEmail("anna@gmail.com"), true);
  assert.equal(isValidEmail("anna.k@mail.co.uk"), true);
  assert.equal(isValidEmail("anna@gmailcom"), false);
  assert.equal(isValidEmail("anna@gmail"), false);
  assert.equal(isValidEmail("anna@gmail.c"), false);
});
