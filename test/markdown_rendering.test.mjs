import assert from "node:assert/strict";
import { test } from "node:test";
import { headingIndexFromNodes, inlineParts, parseMarkdown } from "@ryangerardwilson/bvim-markdown";

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
      { type: "blank", line: 2, lineNumbers: undefined, itemLines: undefined },
      { type: "paragraph", line: 3, lineNumbers: [3, 4], itemLines: undefined },
      { type: "blank", line: 5, lineNumbers: undefined, itemLines: undefined },
      { type: "list", line: 6, lineNumbers: undefined, itemLines: [6] }
    ]
  );
});

test("blank source lines are numbered without adding a fake trailing row", () => {
  assert.deepEqual(parseMarkdown("one\n\nthree\n"), [
    {
      type: "paragraph",
      line: 1,
      lineNumbers: [1],
      lines: ["one"],
      value: "one"
    },
    { type: "blank", line: 2 },
    {
      type: "paragraph",
      line: 3,
      lineNumbers: [3],
      lines: ["three"],
      value: "three"
    }
  ]);
});

test("heading index preserves nested heading levels", () => {
  const nodes = parseMarkdown("# one\n\n### deep\n\n## two\n\n#### deeper\n\n# next\n");
  assert.deepEqual(headingIndexFromNodes(nodes), [
    { id: "1-0", line: 1, level: 1, depth: 0, title: "one" },
    { id: "3-1", line: 3, level: 3, depth: 1, title: "deep" },
    { id: "5-2", line: 5, level: 2, depth: 1, title: "two" },
    { id: "7-3", line: 7, level: 4, depth: 2, title: "deeper" },
    { id: "9-4", line: 9, level: 1, depth: 0, title: "next" }
  ]);
});

test("latex block tracks source range without preserving fence whitespace", () => {
  const nodes = parseMarkdown("before\n\n$$\na &= b\nc &= d\n$$\n");
  assert.deepEqual(nodes[2], {
    type: "latex",
    line: 3,
    lineNumbers: [3, 4, 5, 6],
    value: "a &= b\nc &= d"
  });
});

test("bvim plot fences render as plot nodes across their source range", () => {
  const nodes = parseMarkdown("```bvim-plot\nplot.func({ y: x => x * x })\n```\n");
  assert.deepEqual(nodes, [
    {
      type: "plot",
      line: 1,
      lineNumbers: [1, 2, 3],
      lines: ["plot.func({ y: x => x * x })"],
      language: "bvim-plot",
      value: "plot.func({ y: x => x * x })"
    }
  ]);
});

test("inline parsing keeps text newlines around inline markup", () => {
  assert.deepEqual(inlineParts("one\n`two`\n$three$"), [
    { type: "text", value: "one\n" },
    { type: "code", value: "two" },
    { type: "text", value: "\n" },
    { type: "math", value: "three" }
  ]);
});

test("inline parsing supports dollar and paren latex delimiters", () => {
  assert.deepEqual(inlineParts("growth like \\(e^t\\), then $\\ln(x)$."), [
    { type: "text", value: "growth like " },
    { type: "math", value: "e^t" },
    { type: "text", value: ", then " },
    { type: "math", value: "\\ln(x)" },
    { type: "text", value: "." }
  ]);
});

test("inline parsing leaves escaped dollars as text", () => {
  assert.deepEqual(inlineParts("cost \\$5 and $x^2$"), [
    { type: "text", value: "cost \\$5 and " },
    { type: "math", value: "x^2" }
  ]);
});
