"use strict";
// Build-time parser only. TYPESCRIPT_PATH names the already installed review
// tool; it is not a runtime dependency and no target module is evaluated.
const fs = require("fs");
const ts = require(process.env.TYPESCRIPT_PATH);
const inputs = JSON.parse(fs.readFileSync(0, "utf8"));
const output = {};
for (const [name, text] of Object.entries(inputs)) {
  const source = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const edges = [],
    dynamic = [],
    literals = [],
    hostFamilies = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (
        expression === "require" ||
        expression === "require.resolve" ||
        expression === "import"
      ) {
        if (
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const literal = node.arguments[0];
          if (expression === "require" && literal.text === "./host-bindings") {
            const parent = node.parent;
            if (
              ts.isPropertyAccessExpression(parent) &&
              parent.expression === node
            )
              hostFamilies.push(parent.name.text);
            else if (
              ts.isVariableDeclaration(parent) &&
              ts.isObjectBindingPattern(parent.name)
            ) {
              for (const item of parent.name.elements) {
                if (
                  item.dotDotDotToken ||
                  !ts.isIdentifier(item.propertyName || item.name)
                )
                  throw Error("Unreviewed host family binding in " + name);
                hostFamilies.push((item.propertyName || item.name).text);
              }
            } else
              throw Error("Unreviewed whole/dynamic host binding in " + name);
          }
          edges.push({
            kind: expression,
            request: literal.text,
            start: literal.getStart(source),
            end: literal.end,
            callStart: node.getStart(source),
            callEnd: node.end,
            line:
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1,
          });
        } else
          dynamic.push({
            expression: node.getText(source),
            line:
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1,
          });
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (/^(?:railgun[-:]|Freedom |freedom[.:])/.test(node.text))
        literals.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  output[name] = {
    edges,
    dynamic,
    hostFamilies: [...new Set(hostFamilies)].sort(),
    literals: [...new Set(literals)].sort(),
    syntaxDiagnostics: source.parseDiagnostics.length,
  };
}
process.stdout.write(JSON.stringify(output));
