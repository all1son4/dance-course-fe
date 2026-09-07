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

test("application entry points cannot load the retired Google client transitively", () => {
  const pending = filesUnder(join(root, "src/app"));
  const visited = new Set<string>();
  const forbidden = resolve(root, "src/lib/google-sheets.ts");

  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    assert.notEqual(
      file,
      forbidden,
      "An application import chain reaches the retired Google client",
    );
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const follow = (specifier: string) => {
      const dependency = resolveLocalImport(specifier, file);
      assert.notEqual(
        dependency,
        forbidden,
        `${relative(root, file)} imports the retired Google client`,
      );
      if (dependency) pending.push(dependency);
    };
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause;
        if (clause?.isTypeOnly) return;
        const bindings = clause?.namedBindings;
        if (
          !clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((element) => element.isTypeOnly)
        )
          return;
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
    "src/lib/retired-export-outbox.ts",
  ]) {
    assert.ok(
      visited.has(resolve(root, dependency)),
      `Guard did not reach ${dependency}`,
    );
  }
});
