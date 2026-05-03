import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const site = {
  name: "evim",
  domain: "evim.ryangerardwilson.com",
  url: "https://evim.ryangerardwilson.com",
  repoUrl: "https://github.com/ryangerardwilson/evim"
};

const ROOT = process.cwd();

function repoPath(fileName) {
  const candidates = [join(ROOT, "..", fileName), join(ROOT, fileName)];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

export const docs = [
  {
    slug: "readme",
    label: "README.md",
    eyebrow: "Human Guide",
    summary: "Install, launch, edit, render Markdown, and ship releases.",
    path: "README.md"
  },
  {
    slug: "agents",
    label: "AGENTS.md",
    eyebrow: "Agent Guide",
    summary: "Product boundaries, keyboard rules, and renderer constraints.",
    path: "AGENTS.md"
  },
  {
    slug: "markdown",
    label: "markdown.js",
    eyebrow: "Parser Truth",
    summary: "The shared Markdown parser used by the local app and notes site.",
    path: "packages/evim-markdown/src/markdown.js"
  },
  {
    slug: "plots",
    label: "plotFrame.js",
    eyebrow: "Plot Runtime",
    summary: "The sandboxed equation plotting runtime behind evim-plot fences.",
    path: "packages/evim-markdown/src/plotFrame.js"
  }
];

export function getDoc(slug = "readme") {
  const doc = docs.find((item) => item.slug === slug) || docs[0];
  return {
    ...doc,
    content: readFileSync(repoPath(doc.path), "utf8"),
    repoHref: `${site.repoUrl}/blob/main/${doc.path}`
  };
}

export function buildLlmsText() {
  return [
    "# evim",
    "",
    "AI-facing index for evim docs.",
    "",
    "Primary docs:",
    `- README: ${site.url}/`,
    `- AGENTS: ${site.url}/?doc=agents`,
    `- Markdown parser: ${site.url}/?doc=markdown`,
    `- Plot runtime: ${site.url}/?doc=plots`,
    "",
    "Primary source files:",
    `- README.md: ${site.repoUrl}/blob/main/README.md`,
    `- AGENTS.md: ${site.repoUrl}/blob/main/AGENTS.md`,
    `- packages/evim-markdown/src/markdown.js: ${site.repoUrl}/blob/main/packages/evim-markdown/src/markdown.js`,
    `- packages/evim-markdown/src/plotFrame.js: ${site.repoUrl}/blob/main/packages/evim-markdown/src/plotFrame.js`,
    "",
    "Project summary:",
    "- evim is a CLI-launched local Markdown previewer with Vim-backed editing.",
    "- Documents stay as plain .md files.",
    "- The shared evim Markdown package is the source of truth for notes rendering.",
    "- evim supports images, block and inline LaTeX, and evim-plot equation plots."
  ].join("\n");
}
