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

test("a misspelt ending or name is corrected, a swap of two letters too", () => {
  assert.equal(getEmailSuggestion("anna@gmail.cmo"), "anna@gmail.com");
  assert.equal(getEmailSuggestion("anna@gmail.ocm"), "anna@gmail.com");
  assert.equal(getEmailSuggestion("anna@gmail.comm"), "anna@gmail.com");
  assert.equal(getEmailSuggestion("anna@gamil.com"), "anna@gmail.com");
  assert.equal(getEmailSuggestion("anna@gmial.con"), "anna@gmail.com");
  assert.equal(getEmailSuggestion("anna@outlok.com"), "anna@outlook.com");
  assert.equal(getEmailSuggestion("anna@wp.pll"), "anna@wp.pl");
});

test("real addresses that look like a known provider are left alone", () => {
  for (const domain of [
    "mail.com",
    "ymail.com",
    "email.com",
    "yandex.by",
    "yandex.ua",
    "yandex.kz",
    "mail.ua",
    "mail.de",
    "inbox.lv",
    "inbox.lt",
    "list.ua",
    "rambler.ua",
    "go2.pl",
    "vp.pl",
    "int.pl",
    "onet.eu",
    "interia.eu",
    "protonmail.ch",
    "live.ru",
    "live.fr",
    "outlook.at",
    "yahoo.de",
    "hotmail.co.uk",
    "gmx.at",
    "seznam.cz",
    "mac.com",
    "msn.com",
  ]) {
    assert.equal(getEmailSuggestion(`anna@${domain}`), null, domain);
  }
});

test("an ending still being typed waits until the person leaves the field", () => {
  for (const domain of [
    "gmail.c",
    "gmail.co",
    "mail.r",
    "yandex.r",
    "wp.p",
    "proton.m",
  ]) {
    assert.equal(getEmailSuggestion(`anna@${domain}`, { isTyping: true }), null, domain);
  }
  assert.equal(getEmailSuggestion("anna@gmail.co"), "anna@gmail.com");
  assert.equal(
    getEmailSuggestion("anna@gmail.con", { isTyping: true }),
    "anna@gmail.com",
  );
  assert.equal(getEmailSuggestion("anna@mail."), null);
});
