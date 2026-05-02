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
  "name",
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

function seriesFromValue(label, value, domain, samples) {
  if (typeof value === "function") {
    return { label, points: sampleFunction(value, domain, samples) };
  }

  if (typeof value === "number") {
    return {
      label,
      points: Array.from({ length: samples }, (_, index) => pointFrom(generatedX(domain, samples, index), value))
    };
  }

  if (Array.isArray(value)) {
    const pairLike = value.every((item) => Array.isArray(item) && item.length >= 2);
    if (pairLike) {
      return { label, points: normalizePointPairs(value) };
    }
    return {
      label,
      points: value.map((y, index) => pointFrom(generatedX(domain, value.length || samples, index), y))
    };
  }

  if (value && typeof value === "object") {
    const nextLabel = value.label || value.name || label;
    const y = value.y ?? value.fn ?? value.f ?? value.values ?? value.points;
    return seriesFromValue(String(nextLabel || label), y, domain, samples);
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
    return [seriesFromValue(config.label || config.name || "f(x)", input, domain, samples)];
  }

  if (Array.isArray(input)) {
    const seriesList = input.every((item) => item && typeof item === "object" && !Array.isArray(item));
    if (seriesList) {
      return input.map((item, index) => seriesFromValue(item.label || item.name || "series " + (index + 1), item, domain, samples));
    }
    return [seriesFromValue(config.label || config.name || "series", input, domain, samples)];
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
            points: normalizePointPairs(config.points || [])
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
            points
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
const mount = document.getElementById("mount");
const palette = {
  ink: "#f2f2f2",
  muted: "#a6a6a6",
  faint: "#707070",
  grid: "#2a2a2a",
  axis: "#8c8c8c",
  strokes: ["#ffffff", "#d6d6d6", "#ababab", "#828282", "#eeeeee", "#bfbfbf"]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    path += (open ? "L" : "M") + xScale(x).toFixed(2) + " " + yScale(y).toFixed(2) + " ";
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
      return '<circle cx="' + xScale(x).toFixed(2) + '" cy="' + yScale(y).toFixed(2) + '" r="2.4" fill="' + color + '" />';
    })
    .join("");
}

function renderPlot(plot, offsetY, width, height) {
  const margin = { top: plot.title ? 32 : 18, right: 18, bottom: 38, left: 52 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const xDomain = domainFromPoints(plot.series || [], 0);
  const yDomain = domainFromPoints(plot.series || [], 1);
  const xScale = (value) => margin.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerWidth;
  const yScale = (value) => margin.top + innerHeight - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerHeight;
  const xTicks = ticks(xDomain[0], xDomain[1]);
  const yTicks = ticks(yDomain[0], yDomain[1]);
  const title = plot.title
    ? '<text x="' + width / 2 + '" y="15" text-anchor="middle" fill="' + palette.ink + '" font-size="12">' + escapeHtml(plot.title) + '</text>'
    : "";
  const xAxis = yDomain[0] <= 0 && yDomain[1] >= 0 ? yScale(0) : margin.top + innerHeight;
  const yAxis = xDomain[0] <= 0 && xDomain[1] >= 0 ? xScale(0) : margin.left;
  const grid = [
    ...xTicks.map((value) => '<line x1="' + xScale(value).toFixed(2) + '" y1="' + margin.top + '" x2="' + xScale(value).toFixed(2) + '" y2="' + (margin.top + innerHeight) + '" stroke="' + palette.grid + '" stroke-width="1" />'),
    ...yTicks.map((value) => '<line x1="' + margin.left + '" y1="' + yScale(value).toFixed(2) + '" x2="' + (margin.left + innerWidth) + '" y2="' + yScale(value).toFixed(2) + '" stroke="' + palette.grid + '" stroke-width="1" />')
  ].join("");
  const tickLabels = [
    ...xTicks.map((value) => '<text x="' + xScale(value).toFixed(2) + '" y="' + (height - 17) + '" text-anchor="middle" fill="' + palette.faint + '" font-size="10">' + escapeHtml(formatTick(value)) + '</text>'),
    ...yTicks.map((value) => '<text x="' + (margin.left - 8) + '" y="' + (yScale(value) + 3).toFixed(2) + '" text-anchor="end" fill="' + palette.faint + '" font-size="10">' + escapeHtml(formatTick(value)) + '</text>')
  ].join("");
  const paths = (plot.series || [])
    .map((series, index) => {
      const color = palette.strokes[index % palette.strokes.length];
      const path = pathFromPoints(series.points, xScale, yScale);
      if (!path) {
        return "";
      }
      return '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' + circlesFromPoints(series.points, xScale, yScale, color);
    })
    .join("");
  const legend = (plot.series || [])
    .slice(0, 6)
    .map((series, index) => {
      const x = margin.left + index * 118;
      const y = height - 4;
      const color = palette.strokes[index % palette.strokes.length];
      return '<g><line x1="' + x + '" y1="' + (y - 4) + '" x2="' + (x + 14) + '" y2="' + (y - 4) + '" stroke="' + color + '" stroke-width="2" /><text x="' + (x + 19) + '" y="' + y + '" fill="' + palette.muted + '" font-size="10">' + escapeHtml(series.label || "series") + '</text></g>';
    })
    .join("");
  return '<g transform="translate(0 ' + offsetY + ')">' + title + grid + '<line x1="' + margin.left + '" y1="' + xAxis.toFixed(2) + '" x2="' + (margin.left + innerWidth) + '" y2="' + xAxis.toFixed(2) + '" stroke="' + palette.axis + '" stroke-width="1.2" /><line x1="' + yAxis.toFixed(2) + '" y1="' + margin.top + '" x2="' + yAxis.toFixed(2) + '" y2="' + (margin.top + innerHeight) + '" stroke="' + palette.axis + '" stroke-width="1.2" />' + tickLabels + paths + legend + '</g>';
}

function renderPlots(plots) {
  const width = 820;
  const plotHeight = 300;
  const gap = 18;
  const totalHeight = plots.length * plotHeight + Math.max(0, plots.length - 1) * gap;
  const groups = plots.map((plot, index) => renderPlot(plot, index * (plotHeight + gap), width, plotHeight)).join("");
  return {
    height: totalHeight,
    html: '<svg class="plot-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + totalHeight + '" role="img">' + groups + '</svg>'
  };
}

function postHeight(height) {
  parent.postMessage({ type: "bvim-plot-height", id: BLOCK_ID, height }, "*");
}

function renderError(message) {
  mount.innerHTML = '<div class="plot-error">plot error: ' + escapeHtml(message) + '</div>';
  requestAnimationFrame(() => postHeight(Math.max(54, document.body.scrollHeight)));
}

function renderOk(plots) {
  const rendered = renderPlots(plots);
  mount.innerHTML = rendered.html;
  requestAnimationFrame(() => postHeight(Math.max(120, rendered.height)));
}

try {
  const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
  const worker = new Worker(workerUrl);
  const timeout = window.setTimeout(() => {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    renderError("plot timed out");
  }, 1600);
  worker.onmessage = (event) => {
    window.clearTimeout(timeout);
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    if (event.data?.ok) {
      renderOk(event.data.plots || []);
    } else {
      renderError(event.data?.error || "render failed");
    }
  };
  worker.onerror = (event) => {
    window.clearTimeout(timeout);
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
    renderError(event.message || "worker failed");
  };
  worker.postMessage({ source: USER_SOURCE });
} catch (error) {
  renderError(error?.message || String(error));
}
`;

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
        background: #000000;
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
      }

      .plot-error {
        padding: 10px 12px;
        border-left: 2px solid rgba(255, 255, 255, 0.32);
        background: rgba(0, 0, 0, 0.32);
        color: #d8d8d8;
        line-height: 1.5;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <div id="mount"></div>
    <script>
      const BLOCK_ID = ${scriptJson(id)};
      const USER_SOURCE = ${scriptJson(source)};
      const WORKER_SOURCE = ${scriptJson(WORKER_SOURCE)};
      ${IFRAME_RUNTIME}
    </script>
  </body>
</html>`;
}
