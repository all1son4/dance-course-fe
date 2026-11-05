import assert from "node:assert/strict";
import { test } from "node:test";

import en from "@/messages/en.json";
import pl from "@/messages/pl.json";
import ru from "@/messages/ru.json";

import { parseLegalText } from "./parse-legal-text";

const flatten = (text: string): string[] =>
  parseLegalText(text).flatMap((block) => {
    if (block.kind === "paragraph") {
      return [block.text];
    }

    if (block.kind === "bullets") {
      return block.items;
    }

    return block.items.flatMap((item) => [`${item.mark} ${item.text}`, ...item.bullets]);
  });

/** What must survive: every non-empty line, minus only its "- " list marker. */
const expectedLines = (text: string): string[] =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.replace(/^-\s+/, ""));

test("list formatting keeps every word of the published policies", () => {
  for (const messages of [ru, en, pl]) {
    for (const page of [messages.PrivacyPolicyPage, messages.CookiePolicyPage]) {
      for (const item of Object.values(page.items)) {
        assert.deepEqual(flatten(item.text), expectedLines(item.text));
      }
    }
  }
});

test("lettered lines become a list and their dashes nest under them", () => {
  assert.deepEqual(parseLegalText("Intro:\na) one\n- nested\nb) two\nOutro"), [
    { kind: "paragraph", text: "Intro:" },
    {
      kind: "lettered",
      items: [
        { mark: "a)", text: "one", bullets: ["nested"] },
        { mark: "b)", text: "two", bullets: [] },
      ],
    },
    { kind: "paragraph", text: "Outro" },
  ]);
});
