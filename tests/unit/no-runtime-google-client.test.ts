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
  const pending = filesUnder(join(root, "src/app"));
  const visited = new Set<string>();
  const googleClient = resolve(root, "src/lib/google-sheets.ts");
  const forbidden = new Set([
    googleClient,
    resolve(root, "src/lib/google-sheets-schema.ts"),
  ]);

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
      // Other record families are migrated in later DROP-04 slices. Payments
      // already own their contract; even type-only archive imports must not return.
      if (ts.isIdentifier(node)) {
        assert.notEqual(
          node.text,
          "PaymentSheetRecord",
          `${relative(root, file)} must use the independent payment record contract`,
        );
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        assert.notEqual(
          resolveLocalImport(node.moduleSpecifier.text, file),
          googleClient,
          `${relative(root, file)} imports the retired Google facade (including types)`,
        );
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
  ]) {
    assert.ok(
      visited.has(resolve(root, dependency)),
      `Guard did not reach ${dependency}`,
    );
  }
});
