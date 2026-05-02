import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPlotSvg } from "../src/plotFrame.js";

test("plot renderer keeps the svg transparent and uses safe series colors", () => {
  const { html } = renderPlotSvg([
    {
      title: "Equations",
      series: [
        {
          label: "sin(x)",
          color: "cyan",
          points: [
            [0, 0],
            [1, 1]
          ]
        },
        {
          label: "unsafe",
          color: "\" onload=\"alert(1)",
          points: [
            [0, 1],
            [1, 0]
          ]
        }
      ]
    }
  ]);

  assert.match(html, /<svg class="plot-svg"/);
  assert.match(html, /stroke="#22d3ee"/);
  assert.match(html, /font-size="12">sin\(x\)<\/text>/);
  assert.doesNotMatch(html, /onload/);
  assert.doesNotMatch(html, /<rect/);
});
