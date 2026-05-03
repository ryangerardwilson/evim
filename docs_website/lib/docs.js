import { sourceDocs } from "./source-docs";

export const site = {
  name: "evim",
  domain: "evim.ryangerardwilson.com",
  url: "https://evim.ryangerardwilson.com",
  repoUrl: "https://github.com/ryangerardwilson/evim"
};

export const docs = [
  {
    slug: "readme",
    label: "README.md",
    href: "/",
    path: "README.md"
  },
  {
    slug: "agents",
    label: "AGENTS.md",
    href: "/?doc=agents",
    path: "AGENTS.md"
  },
  {
    slug: "example",
    label: "EXAMPLE.md",
    href: "/?doc=example",
    path: "EXAMPLE.md"
  }
];

export function getDoc(slug = "readme") {
  const doc = docs.find((item) => item.slug === slug) || docs[0];
  return {
    ...doc,
    content: sourceDocs[doc.slug] || "",
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
    `- Example Markdown: ${site.url}/?doc=example`,
    "",
    "Primary source files:",
    `- README.md: ${site.repoUrl}/blob/main/README.md`,
    `- AGENTS.md: ${site.repoUrl}/blob/main/AGENTS.md`,
    `- EXAMPLE.md: ${site.repoUrl}/blob/main/EXAMPLE.md`,
    "",
    "Project summary:",
    "- evim is a CLI-launched local Markdown previewer with Vim-backed editing.",
    "- Documents stay as plain .md files.",
    "- The shared evim Markdown package is the source of truth for notes rendering.",
    "- evim supports images, block and inline LaTeX, and evim-plot equation plots."
  ].join("\n");
}
