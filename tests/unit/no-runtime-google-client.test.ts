import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";

import ts from "typescript";

const root = process.cwd();
const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.[cm]?[jt]sx?$/u.test(path) && !path.endsWith(".test.ts") ? [path] : [];
  });

const resolveLocalImport = (specifier: string, importer: string) => {
  const base = specifier.startsWith("@/")
    ? resolve(root, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importer), specifier)
      : null;
  if (!base) return null;
  return (
    ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"]
      .map((suffix) => base + suffix)
      .find((path) => existsSync(path) && statSync(path).isFile()) ?? null
  );
};

test("application entry points cannot load Google code or archive headers transitively", () => {
  const telegramRoot = join(root, "src/lib/telegram");
  // Include independent type-only modules as roots so their contracts are checked too.
  const telegramFiles = new Set(filesUnder(telegramRoot));
  const independentFiles = new Set([
    ...telegramFiles,
    resolve(root, "src/lib/monthly-sales-report.ts"),
    resolve(root, "src/lib/monthly-sales-report-record.ts"),
    resolve(root, "src/lib/email-campaigns.ts"),
    resolve(root, "src/lib/email-campaign-record.ts"),
    resolve(root, "src/lib/business-operation-read-runtime.ts"),
    resolve(root, "src/lib/admin-invite-link-history-read-runtime.ts"),
    resolve(root, "src/lib/admin-invite-link-history-record.ts"),
  ]);
  const pending = [...filesUnder(join(root, "src/app")), ...independentFiles];
  const visited = new Set<string>();
  const googleClient = resolve(root, "src/lib/google-sheets.ts");
  const archiveSchema = resolve(root, "src/lib/google-sheets-schema.ts");
  const retiredRecordTypes = new Set([
    "PaymentSheetRecord",
    "TelegramAccessTokenSheetRecord",
    "TelegramUserBindingSheetRecord",
    "MonthlySalesReportRunSheetRecord",
    "EmailCampaignLeadSheetRecord",
    "AdminInviteLinkHistorySourceRecord",
  ]);
  const forbidden = new Set([googleClient, archiveSchema]);

  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    assert.ok(
      !forbidden.has(file),
      "An application value import chain reaches Google code or archive headers",
    );
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const follow = (specifier: string) => {
      const dependency = resolveLocalImport(specifier, file);
      assert.ok(
        !dependency || !forbidden.has(dependency),
        `${relative(root, file)} loads Google code or archive headers`,
      );
      if (dependency) pending.push(dependency);
    };
    const visit = (node: ts.Node) => {
      // Other record families are migrated in later DROP-04 slices. Payments,
      // Telegram, reports, campaigns and admin history already own their
      // contracts, including types.
      if (ts.isIdentifier(node)) {
        assert.ok(
          !retiredRecordTypes.has(node.text),
          `${relative(root, file)} must use the independent record contract`,
        );
      }
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const dependency = resolveLocalImport(node.moduleSpecifier.text, file);
        assert.notEqual(
          dependency,
          googleClient,
          `${relative(root, file)} imports the retired Google facade (including types)`,
        );
        if (independentFiles.has(file)) {
          assert.notEqual(
            dependency,
            archiveSchema,
            `${relative(root, file)} imports the archive schema (including types)`,
          );
        }
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) {
          ts.forEachChild(node, visit);
          return;
        }
        const bindings = clause?.namedBindings;
        if (
          !clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((element) => element.isTypeOnly)
        ) {
          ts.forEachChild(node, visit);
          return;
        }
        follow(node.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const clause = node.exportClause;
        if (
          clause &&
          ts.isNamedExports(clause) &&
          clause.elements.length > 0 &&
          clause.elements.every((element) => element.isTypeOnly)
        )
          return;
        follow(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      ) {
        const [argument] = node.arguments;
        if (argument && ts.isStringLiteral(argument)) follow(argument.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  for (const dependency of [
    "src/db/payment-records.ts",
    "src/lib/payment-record.ts",
    "src/lib/retired-export-outbox.ts",
    "src/db/record-values.ts",
    "src/db/purchase-lookups.ts",
    "src/db/telegram-access-token-records.ts",
    "src/db/telegram-user-binding-records.ts",
    "src/db/monthly-report-run-records.ts",
    "src/db/email-campaign-lead-records.ts",
    "src/lib/telegram/access-records.ts",
    "src/lib/telegram/access-read-runtime.ts",
    "src/lib/telegram/access-persistence.ts",
    "src/lib/monthly-sales-report.ts",
    "src/lib/monthly-sales-report-record.ts",
    "src/lib/business-operation-read-runtime.ts",
    "src/lib/email-campaigns.ts",
    "src/lib/email-campaign-record.ts",
    "src/lib/admin-invite-link-history-read-runtime.ts",
    "src/db/admin-invite-link-history.ts",
  ]) {
    assert.ok(
      visited.has(resolve(root, dependency)),
      `Guard did not reach ${dependency}`,
    );
  }
});
