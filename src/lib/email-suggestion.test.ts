import assert from "node:assert/strict";
import test from "node:test";

import { getEmailSuggestion } from "./email-suggestion";

test("a misspelt provider domain is offered back corrected", () => {
  assert.equal(getEmailSuggestion("anna@gmial.com"), "anna@gmail.com");
  assert.equal(getEmailSuggestion("anna@gmail.con"), "anna@gmail.com");
  assert.equal(getEmailSuggestion("anna@gmai.com"), "anna@gmail.com");
  assert.equal(getEmailSuggestion(" Anna.K@Hotmial.com "), "Anna.K@hotmail.com");
  assert.equal(getEmailSuggestion("anna@yandex.ry"), "anna@yandex.ru");
});

test("correct, unknown and unfinished addresses get no suggestion", () => {
  assert.equal(getEmailSuggestion("anna@gmail.com"), null);
  assert.equal(getEmailSuggestion("anna@GMAIL.COM"), null);
  assert.equal(getEmailSuggestion("anna@annastrok.com"), null);
  assert.equal(getEmailSuggestion("anna@"), null);
  assert.equal(getEmailSuggestion("anna@gmail"), null);
  assert.equal(getEmailSuggestion("anna"), null);
  assert.equal(getEmailSuggestion(""), null);
});

test("short Polish domains are not swapped for each other", () => {
  assert.equal(getEmailSuggestion("anna@o2.pl"), null);
  assert.equal(getEmailSuggestion("anna@op.pl"), null);
  assert.equal(getEmailSuggestion("anna@wp.pl"), null);
});
