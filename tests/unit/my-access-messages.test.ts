import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import en from "@/messages/en.json";
import pl from "@/messages/pl.json";
import ru from "@/messages/ru.json";

// The message keys are not typed, so a key the page asks for but no locale has
// renders as its raw path («MyAccessPage.term.since» in the «Дальше» card, seen
// on prod 2026-11-26). Every literal key of the «Мой доступ» page must exist in
// all three languages; template keys (`cards.chips.${chip}`) are left to the
// card tests.
const ACCESS_DIR = path.join(process.cwd(), "src/app/[locale]/access");
const LITERAL_KEY = /\bt\("([^"]+)"/gu;

const hasMessage = (messages: unknown, key: string) =>
  typeof key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      messages,
    ) === "string";

test("every literal «Мой доступ» key exists in ru, pl and en", () => {
  const keys = new Set(
    readdirSync(ACCESS_DIR)
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) => [
        ...readFileSync(path.join(ACCESS_DIR, file), "utf8").matchAll(LITERAL_KEY),
      ])
      .map((match) => match[1]!),
  );

  assert.ok(
    keys.size > 50,
    `only ${keys.size} keys found: the pattern no longer matches`,
  );

  for (const [locale, messages] of Object.entries({ en, pl, ru })) {
    const missing = [...keys].filter((key) => !hasMessage(messages.MyAccessPage, key));
    assert.deepEqual(missing, [], `MyAccessPage keys missing in ${locale}`);
  }
});
