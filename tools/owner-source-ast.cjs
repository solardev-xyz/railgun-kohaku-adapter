'use strict';
// Build-time parser only. TYPESCRIPT_PATH names the already installed review
// tool; it is not a runtime dependency and no target module is evaluated.
const fs = require('fs');
const ts = require(process.env.TYPESCRIPT_PATH);
const inputs = JSON.parse(fs.readFileSync(0, 'utf8'));
const output = {};
for (const [name, text] of Object.entries(inputs)) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edges = [], dynamic = [], literals = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (expression === 'require' || expression === 'require.resolve' || expression === 'import') {
        if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
          const literal = node.arguments[0];
          edges.push({kind: expression, request: literal.text, start: literal.getStart(source), end: literal.end,
            callStart: node.getStart(source), callEnd: node.end,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1});
        } else dynamic.push({expression: node.getText(source), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1});
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (/^(?:railgun[-:]|Freedom |freedom[.:])/.test(node.text)) literals.push(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  output[name] = {edges, dynamic, literals: [...new Set(literals)].sort(), syntaxDiagnostics: source.parseDiagnostics.length};
}
process.stdout.write(JSON.stringify(output));
