import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPlotSvg } from "@ryangerardwilson/bvim-markdown";

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

test("plot renderer uses the requested layout width for readable compact labels", () => {
  const { html } = renderPlotSvg(
    [
      {
        title: "Compact",
        series: [
          {
            label: "x",
            points: [
              [0, 0],
              [1, 1]
            ]
          }
        ]
      }
    ],
    { width: 380 }
  );

  assert.match(html, /viewBox="0 0 380 /);
  assert.match(html, /font-size="13">Compact<\/text>/);
  assert.match(html, /font-size="12">0<\/text>/);
  assert.match(html, /font-size="13">x<\/text>/);
});

test("plot renderer can show latex legend labels", () => {
  const rendered = renderPlotSvg(
    [
      {
        kind: "cartesian",
        series: [
          {
            label: "quadratic",
            labelLatex: "y=x^2",
            color: "cyan",
            points: [
              [-1, 1],
              [0, 0],
              [1, 1]
            ]
          }
        ]
      }
    ],
    { width: 520 }
  );

  assert.match(rendered.html, /foreignObject/);
  assert.match(rendered.html, /katex/);
});
