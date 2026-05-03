import katex from "katex";

function scriptJson(value) {
  return JSON.stringify(String(value ?? ""))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const WORKER_SOURCE = String.raw`
const RESERVED_KEYS = new Set([
  "x",
  "domain",
  "samples",
  "sampleCount",
  "title",
  "label",
  "labelLatex",
  "latexLabel",
  "legendLatex",
  "name",
  "color",
  "stroke",
  "lineColor",
  "strokeWidth",
  "lineWidth",
  "width",
  "xLabel",
  "yLabel",
  "y",
  "ys",
  "series",
  "f",
  "fn",
  "t",
  "points"
]);

for (const name of Object.getOwnPropertyNames(Math)) {
  globalThis[name] = Math[name];
}

function fail(message) {
  throw new Error(message);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rangeFrom(value, fallback) {
  if (Array.isArray(value) && value.length >= 2) {
    const min = finite(value[0]);
    const max = finite(value[1]);
    if (min !== null && max !== null && min !== max) {
      return min < max ? [min, max] : [max, min];
    }
  }
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    const limit = Math.abs(value);
    return [-limit, limit];
  }
  return fallback.slice();
}

function samplesFrom(value) {
  const samples = Math.round(Number(value || 300));
  if (!Number.isFinite(samples)) {
    return 300;
  }
  return Math.max(2, Math.min(2000, samples));
}

function generatedX(domain, samples, index) {
  if (samples <= 1) {
    return domain[0];
  }
  return domain[0] + ((domain[1] - domain[0]) * index) / (samples - 1);
}

function pointFrom(x, y) {
  const nextX = finite(x);
  const nextY = finite(y);
  return [nextX, nextY];
}

function normalizePointPairs(points) {
  if (!Array.isArray(points)) {
    fail("points must be an array of [x, y] pairs");
  }
  return points.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return [null, null];
    }
    return pointFrom(point[0], point[1]);
  });
}

function sampleFunction(fn, domain, samples) {
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const x = generatedX(domain, samples, index);
    points.push(pointFrom(x, fn(x, index)));
  }
  return points;
}

function stripOuterParens(value) {
  let output = String(value || "").trim();
  while (output.startsWith("(") && output.endsWith(")")) {
    let depth = 0;
    let wraps = true;
    for (let index = 0; index < output.length; index += 1) {
      const char = output[index];
      if (char === "(") {
        depth += 1;
      }
      if (char === ")") {
        depth -= 1;
      }
      if (depth === 0 && index < output.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) {
      break;
    }
    output = output.slice(1, -1).trim();
  }
  return output;
}

function functionExpression(fn) {
  const source = Function.prototype.toString.call(fn).trim();
  const arrow = source.indexOf("=>");
  if (arrow >= 0) {
    const body = source.slice(arrow + 2).trim();
    if (body.startsWith("{")) {
      const match = body.match(/return\s+([^;]+);?/);
      return match ? match[1].trim() : "";
    }
    return stripOuterParens(body.replace(/;$/, ""));
  }
  const match = source.match(/return\s+([^;]+);?/);
  return match ? match[1].trim() : "";
}

function latexFromFunction(fn) {
  let latex = functionExpression(fn);
  if (!latex) {
    return "";
  }

  latex = stripOuterParens(latex)
    .replace(/Math\./g, "")
    .replace(/\blog10\s*\(\s*([^)]+)\s*\)/g, "\\log_{10}($1)")
    .replace(/\blog\s*\(\s*([^)]+)\s*\)/g, "\\ln($1)");

  for (let index = 0; index < 6; index += 1) {
    latex = latex.replace(
      /(\([^()]+\)|\b[A-Za-z]\w*\b|\d+(?:\.\d+)?)\s*\*\*\s*(\([^()]+\)|\b[A-Za-z]\w*\b|\d+(?:\.\d+)?)/g,
      (_, base, exponent) => stripOuterParens(base) + "^{" + stripOuterParens(exponent) + "}"
    );
  }

  latex = latex
    .replace(/\bE\b/g, "e")
    .replace(/\s*\*\s*/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*([+=-])\s*/g, "$1")
    .replace(/\+\-/g, "-");

  return latex ? "y=" + latex : "";
}

function seriesStyle(source, fallbackLatex = undefined) {
  if (!source || typeof source !== "object") {
    return fallbackLatex ? { labelLatex: fallbackLatex } : {};
  }
  const color = source.color ?? source.stroke ?? source.lineColor;
  const labelLatex = source.labelLatex ?? source.latexLabel ?? source.legendLatex ?? fallbackLatex;
  const strokeWidth = source.strokeWidth ?? source.lineWidth ?? source.width;
  return {
    ...(labelLatex === undefined ? {} : { labelLatex: String(labelLatex) }),
    ...(color === undefined ? {} : { color: String(color) }),
    ...(strokeWidth === undefined ? {} : { strokeWidth })
  };
}

function withSeriesStyle(series, source, fallbackLatex = undefined) {
  return { ...series, ...seriesStyle(source, fallbackLatex) };
}

function seriesFromValue(label, value, domain, samples, styleSource = null) {
  if (typeof value === "function") {
    return withSeriesStyle({ label, points: sampleFunction(value, domain, samples) }, styleSource, latexFromFunction(value));
  }

  if (typeof value === "number") {
    return withSeriesStyle(
      {
        label,
        points: Array.from({ length: samples }, (_, index) => pointFrom(generatedX(domain, samples, index), value))
      },
      styleSource,
      "y=" + String(value)
    );
  }

  if (Array.isArray(value)) {
    const pairLike = value.every((item) => Array.isArray(item) && item.length >= 2);
    if (pairLike) {
      return withSeriesStyle({ label, points: normalizePointPairs(value) }, styleSource);
    }
    return withSeriesStyle(
      {
        label,
        points: value.map((y, index) => pointFrom(generatedX(domain, value.length || samples, index), y))
      },
      styleSource
    );
  }

  if (value && typeof value === "object") {
    const nextLabel = value.label || value.name || label;
    const y = value.y ?? value.fn ?? value.f ?? value.values ?? value.points;
    return seriesFromValue(String(nextLabel || label), y, domain, samples, value);
  }

  fail("series must be a function, number, y-value array, point array, or object");
}

function collectNamedSeries(config, domain, samples) {
  return Object.entries(config || {})
    .filter(([key]) => !RESERVED_KEYS.has(key))
    .map(([key, value]) => seriesFromValue(key, value, domain, samples));
}

function normalizeSeries(input, config, domain, samples) {
  if (input === undefined || input === null) {
    const named = collectNamedSeries(config, domain, samples);
    if (!named.length) {
      fail("plot.func needs y, series, fn, or named y functions");
    }
    return named;
  }

  if (typeof input === "function" || typeof input === "number") {
    return [seriesFromValue(config.label || config.name || "f(x)", input, domain, samples, config)];
  }

  if (Array.isArray(input)) {
    const seriesList = input.every((item) => item && typeof item === "object" && !Array.isArray(item));
    if (seriesList) {
      return input.map((item, index) => seriesFromValue(item.label || item.name || "series " + (index + 1), item, domain, samples, item));
    }
    return [seriesFromValue(config.label || config.name || "series", input, domain, samples, config)];
  }

  if (input && typeof input === "object") {
    return Object.entries(input).map(([label, value]) => seriesFromValue(label, value, domain, samples));
  }

  fail("plot.func y value is not supported");
}

function createPlotApi(plots) {
  function add(plot) {
    plots.push(plot);
    return plot;
  }

  return {
    func(input = {}) {
      const config = typeof input === "function" ? { y: input } : input || {};
      const domain = rangeFrom(config.x ?? config.domain, [-10, 10]);
      const samples = samplesFrom(config.samples ?? config.sampleCount);
      const y = config.y ?? config.ys ?? config.series ?? config.fn ?? config.f;
      return add({
        kind: "cartesian",
        title: String(config.title || ""),
        xLabel: String(config.xLabel || "x"),
        yLabel: String(config.yLabel || "y"),
        series: normalizeSeries(y, config, domain, samples)
      });
    },

    points(input = {}, options = {}) {
      const config = Array.isArray(input) ? { ...options, points: input } : input || {};
      return add({
        kind: "cartesian",
        title: String(config.title || ""),
        xLabel: String(config.xLabel || "x"),
        yLabel: String(config.yLabel || "y"),
        series: [
          {
            label: String(config.label || config.name || "points"),
            points: normalizePointPairs(config.points || []),
            ...seriesStyle(config)
          }
        ]
      });
    },

    coords(...coords) {
      return this.points(coords);
    },

    coord(...coords) {
      return this.points(coords);
    },

    parametric(config = {}) {
      if (typeof config.x !== "function" || typeof config.y !== "function") {
        fail("plot.parametric needs x(t) and y(t) functions");
      }
      const domain = rangeFrom(config.t ?? config.domain, [0, Math.PI * 2]);
      const samples = samplesFrom(config.samples ?? config.sampleCount);
      const points = [];
      for (let index = 0; index < samples; index += 1) {
        const t = generatedX(domain, samples, index);
        points.push(pointFrom(config.x(t, index), config.y(t, index)));
      }
      return add({
        kind: "cartesian",
        title: String(config.title || ""),
        xLabel: String(config.xLabel || "x"),
        yLabel: String(config.yLabel || "y"),
        series: [
          {
            label: String(config.label || config.name || "parametric"),
            points,
            ...seriesStyle(config)
          }
        ]
      });
    },

    linspace(min, max, count = 100) {
      const domain = rangeFrom([min, max], [0, 1]);
      const samples = samplesFrom(count);
      return Array.from({ length: samples }, (_, index) => generatedX(domain, samples, index));
    }
  };
}

self.onmessage = (event) => {
  const plots = [];
  try {
    const source = String(event.data?.source || "");
    const plot = createPlotApi(plots);
    const runner = new Function("plot", "Math", '"use strict";\n' + source);
    const result = runner(plot, Math);
    if (!plots.length && result && typeof result === "object" && Array.isArray(result.series)) {
      plots.push(result);
    }
    if (!plots.length) {
      fail("plot block did not call plot.func, plot.points, or plot.parametric");
    }
    self.postMessage({ ok: true, plots });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || String(error) });
  }
};
`;

const IFRAME_RUNTIME = String.raw`
function postResult(payload) {
  parent.postMessage({ type: "bvim-plot-result", id: BLOCK_ID, ...payload }, "*");
}

try {
  const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  const timeout = window.setTimeout(() => {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    postResult({ ok: false, error: "plot timed out" });
  }, 1600);
  worker.onmessage = (event) => {
    window.clearTimeout(timeout);
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    if (event.data?.ok) {
      postResult({ ok: true, plots: event.data.plots || [] });
    } else {
      postResult({ ok: false, error: event.data?.error || "render failed" });
    }
  };
  worker.onerror = (event) => {
    window.clearTimeout(timeout);
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    postResult({ ok: false, error: event.message || "worker failed" });
  };
  worker.postMessage({ source: USER_SOURCE });
} catch (error) {
  postResult({ ok: false, error: error?.message || String(error) });
}
`;

const PLOT_PALETTE = {
  ink: "#f2f2f2",
  muted: "#a6a6a6",
  faint: "#707070",
  grid: "#2a2a2a",
  axis: "#8c8c8c",
  strokes: ["#ffffff", "#d6d6d6", "#ababab", "#828282", "#eeeeee", "#bfbfbf"]
};

const NAMED_COLORS = {
  white: "#ffffff",
  gray: "#a3a3a3",
  grey: "#a3a3a3",
  red: "#f87171",
  orange: "#fb923c",
  yellow: "#facc15",
  green: "#4ade80",
  cyan: "#22d3ee",
  blue: "#60a5fa",
  violet: "#a78bfa",
  purple: "#c084fc",
  pink: "#f472b6"
};

function escapeSvg(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function legendLatexSource(item) {
  const source = item?.labelLatex ?? item?.latexLabel ?? item?.legendLatex;
  return typeof source === "string" && source.trim() ? source.trim() : "";
}

function renderLegendLatex(source) {
  try {
    return katex.renderToString(source, {
      displayMode: false,
      throwOnError: false,
      strict: false
    });
  } catch {
    return escapeSvg(source);
  }
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function domainFromPoints(series, axis) {
  const values = [];
  for (const item of series) {
    for (const point of item.points || []) {
      const value = finite(point?.[axis]);
      if (value !== null) {
        values.push(value);
      }
    }
  }
  if (!values.length) {
    return [-1, 1];
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min || 1);
    min -= pad;
    max += pad;
  } else {
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
  }
  return [min, max];
}

function ticks(min, max, target = 6) {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) {
    return [];
  }
  const rawStep = span / target;
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / power;
  const step = (residual >= 5 ? 5 : residual >= 2 ? 2 : 1) * power;
  const first = Math.ceil(min / step) * step;
  const output = [];
  for (let value = first; value <= max + step * 0.5 && output.length < 20; value += step) {
    output.push(Math.abs(value) < step / 1000 ? 0 : value);
  }
  return output;
}

function formatTick(value) {
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 10000 || abs < 0.001)) {
    return value.toExponential(1);
  }
  return String(Number(value.toFixed(3)));
}

function safeColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const color = value.trim();
  const lower = color.toLowerCase();
  if (NAMED_COLORS[lower]) {
    return NAMED_COLORS[lower];
  }
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color)) {
    return color;
  }
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
  if (rgb) {
    const channels = rgb.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))));
    if (rgb[4] !== undefined) {
      const alpha = Math.max(0, Math.min(1, Number(rgb[4])));
      return `rgba(${channels.join(", ")}, ${alpha})`;
    }
    return `rgb(${channels.join(", ")})`;
  }
  return fallback;
}

function safeStrokeWidth(value, fallback = 2.2) {
  const width = Number(value);
  if (!Number.isFinite(width)) {
    return fallback;
  }
  return Math.max(1, Math.min(6, width));
}

function safePlotWidth(value) {
  const width = Math.round(Number(value));
  if (!Number.isFinite(width)) {
    return 820;
  }
  return Math.max(300, Math.min(920, width));
}

function plotMetrics(width, seriesCount, hasLatexLegend = false) {
  const compact = width < 560;
  const cramped = width < 420;
  return {
    titleFont: compact ? 13 : 12,
    tickFont: compact ? 12 : 10,
    legendFont: compact ? 13 : 12,
    left: cramped ? 42 : compact ? 48 : 52,
    right: compact ? 10 : 18,
    top: compact ? 32 : 30,
    gridHeight: cramped ? 220 : compact ? 238 : 230,
    legendColumns: hasLatexLegend || compact || seriesCount < 2 ? 1 : 2,
    legendRowHeight: hasLatexLegend ? (compact ? 34 : 30) : compact ? 28 : 24,
    legendGap: hasLatexLegend ? (compact ? 60 : 56) : compact ? 54 : 48
  };
}

function pathFromPoints(points, xScale, yScale) {
  let path = "";
  let open = false;
  for (const point of points || []) {
    const x = finite(point?.[0]);
    const y = finite(point?.[1]);
    if (x === null || y === null) {
      open = false;
      continue;
    }
    path += `${open ? "L" : "M"}${xScale(x).toFixed(2)} ${yScale(y).toFixed(2)} `;
    open = true;
  }
  return path.trim();
}

function circlesFromPoints(points, xScale, yScale, color) {
  if (!points || points.length > 80) {
    return "";
  }
  return points
    .map((point) => {
      const x = finite(point?.[0]);
      const y = finite(point?.[1]);
      if (x === null || y === null) {
        return "";
      }
      return `<circle cx="${xScale(x).toFixed(2)}" cy="${yScale(y).toFixed(2)}" r="2.4" fill="${color}" />`;
    })
    .join("");
}

function plotHeight(plot, width) {
  const seriesCount = (plot.series || []).length;
  const hasLatexLegend = (plot.series || []).some((item) => legendLatexSource(item));
  const metrics = plotMetrics(width, seriesCount, hasLatexLegend);
  const legendRows = Math.ceil(seriesCount / metrics.legendColumns);
  const titleHeight = plot.title ? 32 : 16;
  const axisAndTicks = 36;
  const legendHeight = seriesCount ? 26 + legendRows * metrics.legendRowHeight : 0;
  return titleHeight + metrics.gridHeight + axisAndTicks + legendHeight;
}

function renderPlot(plot, offsetY, width, height) {
  const series = plot.series || [];
  const hasLatexLegend = series.some((item) => legendLatexSource(item));
  const metrics = plotMetrics(width, series.length, hasLatexLegend);
  const legendRows = Math.ceil(series.length / metrics.legendColumns);
  const legendHeight = series.length ? 26 + legendRows * metrics.legendRowHeight : 0;
  const margin = {
    top: plot.title ? metrics.top : 14,
    right: metrics.right,
    bottom: 34 + legendHeight,
    left: metrics.left
  };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xDomain = domainFromPoints(series, 0);
  const yDomain = domainFromPoints(series, 1);
  const xScale = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerWidth;
  const yScale = (value) => margin.top + innerHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerHeight;
  const xTicks = ticks(xDomain[0], xDomain[1]);
  const yTicks = ticks(yDomain[0], yDomain[1]);
  const title = plot.title
    ? `<text x="${width / 2}" y="16" text-anchor="middle" fill="${PLOT_PALETTE.ink}" font-size="${metrics.titleFont}">${escapeSvg(plot.title)}</text>`
    : "";
  const xAxis = yDomain[0] <= 0 && yDomain[1] >= 0 ? yScale(0) : margin.top + innerHeight;
  const yAxis = xDomain[0] <= 0 && xDomain[1] >= 0 ? xScale(0) : margin.left;
  const grid = [
    ...xTicks.map((value) => `<line x1="${xScale(value).toFixed(2)}" y1="${margin.top}" x2="${xScale(value).toFixed(2)}" y2="${margin.top + innerHeight}" stroke="${PLOT_PALETTE.grid}" stroke-width="1" />`),
    ...yTicks.map((value) => `<line x1="${margin.left}" y1="${yScale(value).toFixed(2)}" x2="${margin.left + innerWidth}" y2="${yScale(value).toFixed(2)}" stroke="${PLOT_PALETTE.grid}" stroke-width="1" />`)
  ].join("");
  const xTickY = margin.top + innerHeight + 21;
  const tickLabels = [
    ...xTicks.map((value) => `<text x="${xScale(value).toFixed(2)}" y="${xTickY}" text-anchor="middle" fill="${PLOT_PALETTE.faint}" font-size="${metrics.tickFont}">${escapeSvg(formatTick(value))}</text>`),
    ...yTicks.map((value) => `<text x="${margin.left - 8}" y="${(yScale(value) + 4).toFixed(2)}" text-anchor="end" fill="${PLOT_PALETTE.faint}" font-size="${metrics.tickFont}">${escapeSvg(formatTick(value))}</text>`)
  ].join("");
  const paths = series
    .map((item, index) => {
      const color = safeColor(item.color, PLOT_PALETTE.strokes[index % PLOT_PALETTE.strokes.length]);
      const strokeWidth = safeStrokeWidth(item.strokeWidth);
      const path = pathFromPoints(item.points, xScale, yScale);
      if (!path) {
        return "";
      }
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />${circlesFromPoints(item.points, xScale, yScale, color)}`;
    })
    .join("");
  const legendTop = margin.top + innerHeight + metrics.legendGap;
  const legendColumnWidth = metrics.legendColumns === 2 ? Math.max(220, (innerWidth - 28) / 2) : innerWidth;
  const legend = series
    .map((item, index) => {
      const column = index % metrics.legendColumns;
      const row = Math.floor(index / metrics.legendColumns);
      const x = margin.left + column * legendColumnWidth;
      const y = legendTop + row * metrics.legendRowHeight;
      const color = safeColor(item.color, PLOT_PALETTE.strokes[index % PLOT_PALETTE.strokes.length]);
      const latex = legendLatexSource(item);
      const labelWidth = Math.max(120, legendColumnWidth - 44);
      const label = latex
        ? `<foreignObject x="${x + 38}" y="${y - 14}" width="${labelWidth}" height="${metrics.legendRowHeight + 8}"><div xmlns="http://www.w3.org/1999/xhtml" class="plot-legend-latex">${renderLegendLatex(latex)}</div></foreignObject>`
        : `<text x="${x + 38}" y="${y + 5}" fill="${PLOT_PALETTE.ink}" font-size="${metrics.legendFont}">${escapeSvg(item.label || "series")}</text>`;
      return `<g><line x1="${x}" y1="${y}" x2="${x + 28}" y2="${y}" stroke="${color}" stroke-width="3.2" stroke-linecap="round" />${label}</g>`;
    })
    .join("");
  return `<g transform="translate(0 ${offsetY})">${title}${grid}<line x1="${margin.left}" y1="${xAxis.toFixed(2)}" x2="${margin.left + innerWidth}" y2="${xAxis.toFixed(2)}" stroke="${PLOT_PALETTE.axis}" stroke-width="1.2" /><line x1="${yAxis.toFixed(2)}" y1="${margin.top}" x2="${yAxis.toFixed(2)}" y2="${margin.top + innerHeight}" stroke="${PLOT_PALETTE.axis}" stroke-width="1.2" />${tickLabels}${paths}${legend}</g>`;
}

export function renderPlotSvg(plots = [], options = {}) {
  const width = safePlotWidth(options.width);
  const gap = 18;
  const heights = plots.map((plot) => plotHeight(plot, width));
  let offset = 0;
  const groups = plots
    .map((plot, index) => {
      const rendered = renderPlot(plot, offset, width, heights[index]);
      offset += heights[index] + gap;
      return rendered;
    })
    .join("");
  const totalHeight = heights.reduce((sum, height) => sum + height, 0) + Math.max(0, plots.length - 1) * gap;
  return {
    height: totalHeight,
    html: `<svg class="plot-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${totalHeight}" role="img">${groups}</svg>`
  };
}

export function plotFrameSource(source, id) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none';" />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: transparent;
        color: #f2f2f2;
        font: 12px "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      }

      #mount {
        min-width: 0;
      }

      .plot-svg {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
        background: transparent;
      }
    </style>
  </head>
  <body>
    <script>
      const BLOCK_ID = ${scriptJson(id)};
      const USER_SOURCE = ${scriptJson(source)};
      const WORKER_SOURCE = ${scriptJson(WORKER_SOURCE)};
      ${IFRAME_RUNTIME}
    </script>
  </body>
</html>`;
}
