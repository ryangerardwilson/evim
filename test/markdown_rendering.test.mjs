import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineParts, parseMarkdown } from "../src/markdown.js";

test("plain vim lines stay as line-separated paragraph text", () => {
  assert.deepEqual(parseMarkdown("one\ntwo\nthree\n"), [
    { type: "paragraph", value: "one\ntwo\nthree" }
  ]);
});

test("quoted vim lines stay line-separated", () => {
  assert.deepEqual(parseMarkdown("> one\n> two\n"), [{ type: "quote", value: "one\ntwo" }]);
});

test("inline parsing keeps text newlines around inline markup", () => {
  assert.deepEqual(inlineParts("one\n`two`\n$three$"), [
    { type: "text", value: "one\n" },
    { type: "code", value: "two" },
    { type: "text", value: "\n" },
    { type: "math", value: "three" }
  ]);
});
