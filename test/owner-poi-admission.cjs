/** Test-only executable key-admission checks derived from the original owners. */
"use strict";
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");
const routes = Object.freeze({
  shield: ["railgun-own-poi-membership.js", "open", { transact: false }],
  transact: ["railgun-own-poi-membership.js", "open", { transact: true }],
  proof: ["railgun-own-poi-proof.js", "proveRailgunOwnPoi", {}],
  plan: [
    "railgun-poi-disclosure-plan.js",
    "prepareRailgunPoiDisclosurePlan",
    {},
  ],
  revalidate: [
    "railgun-poi-disclosure-plan.js",
    "revalidateRailgunPoiDisclosurePlan",
    {},
  ],
  submit: ["railgun-poi-disclosure-plan.js", "submitRailgunRetainedPoi", {}],
  preparedOutput: [
    "railgun-poi-output-recovery.js",
    "recover",
    { completed: true, attempted: false },
  ],
  attemptedOutput: [
    "railgun-poi-output-recovery.js",
    "recover",
    { completed: true, attempted: true },
  ],
  storePrepare: ["railgun-poi-intent-store.js", "prepare", {}],
});
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const child of value) walk(child, visit);
    else if (value && typeof value === "object") walk(value, visit);
  }
}
function evaluate(node, flags, input) {
  if (node.type === "StringLiteral" || node.type === "BooleanLiteral")
    return node.value;
  if (node.type === "Identifier") {
    assert.ok(Object.hasOwn(flags, node.name));
    return flags[node.name];
  }
  if (node.type === "UnaryExpression" && node.operator === "!")
    return !evaluate(node.argument, flags, input);
  if (node.type === "LogicalExpression" && node.operator === "&&")
    return (
      evaluate(node.left, flags, input) && evaluate(node.right, flags, input)
    );
  if (node.type === "ConditionalExpression")
    return evaluate(
      evaluate(node.test, flags, input) ? node.consequent : node.alternate,
      flags,
      input,
    );
  if (node.type === "ArrayExpression")
    return node.elements.flatMap((value) =>
      value.type === "SpreadElement"
        ? evaluate(value.argument, flags, input)
        : [evaluate(value, flags, input)],
    );
  if (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.name === "Object" &&
    node.callee.property.name === "hasOwn"
  ) {
    assert.ok(["input", "options"].includes(node.arguments[0].name));
    return Object.hasOwn(input, evaluate(node.arguments[1], flags, input));
  }
  throw Error("Unreviewed owner admission syntax: " + node.type);
}
function createAdmission(root) {
  const cache = new Map();
  return function admitted(route, input) {
    assert.ok(Object.hasOwn(routes, route));
    const [file, fn, flags] = routes[route];
    let array = cache.get(route);
    if (!array) {
      const ast = parse(fs.readFileSync(path.join(root, file), "utf8"), {
        sourceType: "script",
      });
      const functions = [];
      walk(ast, (node) => {
        if (node.type === "FunctionDeclaration" && node.id.name === fn)
          functions.push(node);
      });
      assert.equal(functions.length, 1, "one exact original owner function");
      const candidates = [];
      walk(functions[0].body, (node) => {
        if (node.type !== "CallExpression") return;
        if (
          ["shape", "options"].includes(node.callee.name) &&
          ["options", "input"].includes(node.arguments[0]?.name) &&
          node.arguments[1]?.type === "ArrayExpression"
        )
          candidates.push(node.arguments[1]);
        if (
          file === "railgun-own-poi-membership.js" &&
          node.callee.type === "MemberExpression" &&
          node.callee.object.name === "assert" &&
          node.callee.property.name === "deepEqual" &&
          node.arguments[1]?.type === "ArrayExpression"
        ) {
          const values = node.arguments[1].elements
            .filter((value) => value.type === "StringLiteral")
            .map((value) => value.value);
          if (
            values.includes("archive") &&
            values.includes("selector") &&
            values.includes("enrollment")
          )
            candidates.push(node.arguments[1]);
        }
      });
      assert.equal(
        candidates.length,
        1,
        "one exact source-derived key admission",
      );
      array = candidates[0];
      cache.set(route, array);
    }
    const allowed = evaluate(array, flags, input);
    // That original opener explicitly filters timeoutMs before its exact key
    // comparison; all current facade calls omit it, as asserted below.
    assert.ok(
      !Object.hasOwn(input, "timeoutMs"),
      "facade does not replace original owner budgets",
    );
    assert.deepEqual(
      Reflect.ownKeys(input).sort(),
      allowed.sort(),
      route + " original owner keys",
    );
    for (const key of allowed)
      assert.ok(
        Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), "value"),
      );
    return true;
  };
}
module.exports = { createAdmission };
