import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, "..");
const repoRoot = join(docsRoot, "..");
const outputPath = join(docsRoot, "lib", "source-docs.js");

const files = [
  ["readme", "README.md"],
  ["agents", "AGENTS.md"],
  ["markdown", "packages/evim-markdown/src/markdown.js"],
  ["plots", "packages/evim-markdown/src/plotFrame.js"]
];

const existingGenerated = existsSync(outputPath) ? await fs.readFile(outputPath, "utf8") : "";
const sources = {};
let missing = false;

for (const [slug, relativePath] of files) {
  const sourcePath = join(repoRoot, relativePath);
  if (!existsSync(sourcePath)) {
    missing = true;
    break;
  }
  sources[slug] = await fs.readFile(sourcePath, "utf8");
}

if (missing) {
  if (!existingGenerated) {
    throw new Error("source docs are unavailable and lib/source-docs.js does not exist");
  }
  process.exit(0);
}

const body = [
  "export const sourceDocs = ",
  JSON.stringify(sources, null, 2),
  ";\n"
].join("");

await fs.writeFile(outputPath, body, "utf8");
