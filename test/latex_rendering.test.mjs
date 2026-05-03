import assert from "node:assert/strict";
import { test } from "node:test";
import { leftAlignedLatexRows } from "@ryangerardwilson/evim-markdown";

test("aligned latex blocks are flattened into left-aligned rows", () => {
  assert.deepEqual(
    leftAlignedLatexRows(String.raw`\begin{aligned}
a^2 + b^2 &= c^2 \\
x &= \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
\end{aligned}`),
    ["a^2 + b^2 = c^2", String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`]
  );
});

test("non-aligned latex blocks render normally", () => {
  assert.equal(leftAlignedLatexRows(String.raw`\int_0^1 x^2 dx`), null);
});
