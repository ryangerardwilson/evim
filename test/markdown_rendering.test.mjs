import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineParts, parseMarkdown } from "../src/markdown.js";

test("plain vim lines stay as line-separated paragraph text", () => {
  assert.deepEqual(parseMarkdown("one\ntwo\nthree\n"), [
    {
      type: "paragraph",
      line: 1,
      lineNumbers: [1, 2, 3],
      lines: ["one", "two", "three"],
      value: "one\ntwo\nthree"
    }
  ]);
});

test("quoted vim lines stay line-separated", () => {
  assert.deepEqual(parseMarkdown("> one\n> two\n"), [
    {
      type: "quote",
      line: 1,
      lineNumbers: [1, 2],
      lines: ["one", "two"],
      value: "one\ntwo"
    }
  ]);
});

test("line numbers follow source lines across markdown nodes", () => {
  const nodes = parseMarkdown("# title\n\none\ntwo\n\n- item\n");
  assert.deepEqual(
    nodes.map((node) => ({
      type: node.type,
      line: node.line,
      lineNumbers: node.lineNumbers,
      itemLines: node.items?.map((item) => item.line)
    })),
    [
      { type: "heading", line: 1, lineNumbers: undefined, itemLines: undefined },
      { type: "paragraph", line: 3, lineNumbers: [3, 4], itemLines: undefined },
      { type: "list", line: 6, lineNumbers: undefined, itemLines: [6] }
    ]
  );
});

test("inline parsing keeps text newlines around inline markup", () => {
  assert.deepEqual(inlineParts("one\n`two`\n$three$"), [
    { type: "text", value: "one\n" },
    { type: "code", value: "two" },
    { type: "text", value: "\n" },
    { type: "math", value: "three" }
  ]);
});
