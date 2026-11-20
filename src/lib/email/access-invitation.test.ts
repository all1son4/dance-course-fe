import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInvitationJoinEmail,
  buildInvitationLinksEmail,
  buildInvitationRenewalEmail,
} from "./access-invitation";

const base = {
  cohortTitle: "Online Group 3.0",
  firstName: "Ola",
  myAccessUrl: "https://example.test/ru/access?k=abc",
} as const;

test("the joining email names what is given and carries a button per link", () => {
  const email = buildInvitationJoinEmail({
    ...base,
    accesses: [
      { accessKey: "main-group", kind: "link", url: "https://t.me/+main" },
      { accessKey: "inspiration-hub", kind: "link", url: "https://t.me/+hub" },
    ],
    locale: "ru",
    product: "plus",
  });

  assert.equal(email.subject, "Приглашение: Online Group 3.0 · Plus с Inspiration Hub");
  assert.match(email.html, /Привет, Ola!/u);
  assert.match(email.html, /href="https:\/\/t\.me\/\+main"[^>]*>Войти в чат потока</u);
  assert.match(
    email.html,
    /href="https:\/\/t\.me\/\+hub"[^>]*>Открыть Inspiration Hub</u,
  );
  assert.match(email.text, /Войти в чат потока: https:\/\/t\.me\/\+main/u);
  assert.match(email.html, /Мой доступ/u);
  assert.match(email.html, /lang="ru"/u);
});

test("a Hub already running is told as extended, not given a link", () => {
  const email = buildInvitationJoinEmail({
    ...base,
    accesses: [
      {
        accessKey: "inspiration-hub",
        kind: "extended",
        until: new Date("2027-02-01T10:00:00Z"),
      },
    ],
    cohortTitle: null,
    locale: "en",
    product: "hub",
  });

  assert.equal(email.subject, "Your invitation: Inspiration Hub for 8 weeks");
  assert.match(
    email.text,
    /already in Inspiration Hub — your access is extended until 1 February 2027/u,
  );
  assert.doesNotMatch(email.html, /each works once/u);
});

test("the renewal email has one button to the page and the three steps", () => {
  const email = buildInvitationRenewalEmail({
    ...base,
    locale: "pl",
    pageUrl: "https://example.test/pl/invitation?k=token",
    product: "standard",
  });

  assert.equal(email.subject, "Przedłużenie: Online Group 3.0 · Standard");
  assert.equal(email.html.match(/background:#7c0002;border-radius:999px/gu)?.length, 1);
  assert.match(email.html, /href="https:\/\/example\.test\/pl\/invitation\?k=token"/u);
  assert.match(
    email.text,
    /1\. Potwierdź Telegram\n2\. Odbierz linki\n3\. Wejdź na czat/u,
  );
  // Nothing beside the page: «Mój dostęp» has no link to give before the check.
  assert.doesNotMatch(email.html, /\/access\?k=/u);
  assert.doesNotMatch(email.text, /\/access\?k=/u);
});

test("the links email holds only the links, and is skipped without any", () => {
  assert.equal(
    buildInvitationLinksEmail({
      ...base,
      accesses: [{ accessKey: "inspiration-hub", kind: "extended", until: null }],
      locale: "ru",
      product: "plus",
    }),
    null,
  );

  const email = buildInvitationLinksEmail({
    ...base,
    accesses: [
      { accessKey: "main-group", kind: "link", url: "https://t.me/+main" },
      { accessKey: "inspiration-hub", kind: "extended", until: null },
    ],
    locale: "ru",
    product: "plus",
  });
  assert.ok(email);
  assert.match(email!.html, /Войти в чат потока/u);
  assert.doesNotMatch(email!.html, /доступ продлён/u);
});

test("names and links are escaped", () => {
  const email = buildInvitationJoinEmail({
    ...base,
    accesses: [{ accessKey: "main-group", kind: "link", url: 'https://t.me/+a"b' }],
    firstName: "<b>Ola</b>",
    locale: "ru",
    product: "standard",
  });
  assert.doesNotMatch(email.html, /<b>Ola<\/b>/u);
  assert.match(email.html, /&lt;b&gt;Ola&lt;\/b&gt;/u);
  assert.match(email.html, /https:\/\/t\.me\/\+a&quot;b/u);
});
