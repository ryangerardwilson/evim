import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const documentsDir = path.join(__dirname, "documents");
const documentsRoot = path.resolve(documentsDir);
const workspaceRoot = path.resolve(process.env.BVIM_WORKSPACE || documentsDir);
const initialFile = process.env.BVIM_INITIAL_FILE ? path.resolve(process.env.BVIM_INITIAL_FILE) : null;
const port = Number(process.env.PORT || 8000);
const stateDir = path.join(os.homedir(), ".local", "state", "bvim");
const recentPath = path.join(stateDir, "recent.json");
const allowedRoots = Array.from(
  new Set([documentsRoot, workspaceRoot, initialFile ? path.dirname(initialFile) : null].filter(Boolean))
);

await fs.mkdir(documentsDir, { recursive: true });

function hasDocumentExtension(value) {
  return value.endsWith(".bvim") || value.endsWith(".bvim.json");
}

function withDocumentExtension(value) {
  if (hasDocumentExtension(value)) {
    return value;
  }
  if (value.endsWith(".json")) {
    return value.replace(/\.json$/, ".bvim");
  }
  return `${value}.bvim`;
}

function expandHome(value) {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function stripDocumentExtension(value) {
  return value.replace(/\.bvim\.json$/i, "").replace(/\.bvim$/i, "");
}

function titleFromFileName(file) {
  return stripDocumentExtension(path.basename(file)).replace(/[-_]+/g, " ") || "document";
}

function isInsideRoot(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function completionPathInfo(rawValue) {
  const raw = String(rawValue || "");
  const value = raw.trim();
  const home = os.homedir();

  if (!value || value === "~" || value === "~/") {
    return { lookupDir: home, partial: "", displayBase: "~/" };
  }

  const expanded = expandHome(value);
  const absolute = path.resolve(workspaceRoot, expanded);
  const endsWithSeparator = /[\\/]$/.test(value);

  if (endsWithSeparator) {
    return {
      lookupDir: absolute,
      partial: "",
      displayBase: value
    };
  }

  const partial = path.basename(expanded);
  const lookupDir = path.dirname(absolute);
  const displayBase = value.slice(0, Math.max(0, value.length - partial.length));
  return { lookupDir, partial, displayBase };
}

async function completePath(rawValue) {
  const { lookupDir, partial, displayBase } = completionPathInfo(rawValue);
  const resolvedDir = path.resolve(lookupDir);

  if (!allowedRoots.some((root) => isInsideRoot(resolvedDir, root))) {
    return [];
  }

  const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => entry.name.toLowerCase().startsWith(partial.toLowerCase()))
    .filter((entry) => entry.isDirectory() || hasDocumentExtension(entry.name) || entry.name.endsWith(".json"))
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
      value: `${displayBase}${entry.name}${entry.isDirectory() ? "/" : ""}`
    }))
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, 20);
}

function displayFileName(fullPath) {
  if (isInsideRoot(fullPath, documentsRoot)) {
    return path.basename(fullPath);
  }
  if (isInsideRoot(fullPath, workspaceRoot)) {
    const relative = path.relative(workspaceRoot, fullPath);
    return relative || path.basename(fullPath);
  }
  return fullPath;
}

function resolveDocumentPath(value) {
  const raw = String(value || initialFile || "").trim();
  if (!raw) {
    throw new Error("document path is required");
  }
  const input = expandHome(raw);
  const baseDir = initialFile ? path.dirname(initialFile) : workspaceRoot;
  const unresolved = path.isAbsolute(input) ? input : path.resolve(baseDir, input);
  const fullPath = path.resolve(withDocumentExtension(unresolved));

  if (!hasDocumentExtension(fullPath)) {
    throw new Error("bvim documents must end in .bvim");
  }

  if (!allowedRoots.some((root) => isInsideRoot(fullPath, root))) {
    throw new Error("document path is outside this bvim session");
  }

  return { file: displayFileName(fullPath), fullPath };
}

function createStarterDocument(file, title = titleFromFileName(file)) {
  return {
    app: "bvim",
    version: 1,
    file,
    title,
    savedAt: null,
    blocks: [
      {
        id: `block-${Date.now()}-text`,
        type: "text",
        content: "",
        meta: {}
      }
    ]
  };
}

async function readJsonFile(fullPath) {
  const raw = await fs.readFile(fullPath, "utf8");
  return JSON.parse(raw);
}

async function readRecentDocuments() {
  try {
    const raw = await fs.readFile(recentPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry) => entry && typeof entry.path === "string")
      .map((entry) => ({ path: entry.path, openedAt: Number(entry.openedAt || 0) }));
  } catch {
    return [];
  }
}

async function rememberRecentDocument(fullPath) {
  const current = await readRecentDocuments();
  const absolute = path.resolve(fullPath);
  const next = [
    { path: absolute, openedAt: Date.now() },
    ...current.filter((entry) => path.resolve(entry.path) !== absolute)
  ].slice(0, 100);
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(recentPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

async function listRecentDocuments() {
  const recent = await readRecentDocuments();
  const sorted = recent.slice().sort((a, b) => (b.openedAt || 0) - (a.openedAt || 0));
  const documents = [];

  for (const entry of sorted) {
    const absolute = path.resolve(entry.path);
    if (!allowedRoots.some((root) => isInsideRoot(absolute, root))) {
      continue;
    }
    try {
      const stats = await fs.stat(absolute);
      if (!stats.isFile()) {
        continue;
      }
      let title = titleFromFileName(absolute);
      try {
        const document = await readJsonFile(absolute);
        title = document.title || title;
      } catch {
        // A malformed file can still be opened; just fall back to the path title.
      }
      documents.push({
        path: absolute,
        file: displayFileName(absolute),
        title,
        openedAt: entry.openedAt || stats.mtimeMs || 0
      });
    } catch {
      // Ignore stale recent files.
    }
    if (documents.length >= 30) {
      break;
    }
  }

  return documents;
}

const app = express();
app.use(express.json({ limit: "40mb" }));

app.get("/api/documents", async (_req, res) => {
  const entries = await fs.readdir(documentsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && hasDocumentExtension(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  res.json({ files });
});

app.get("/api/health", (_req, res) => {
  res.json({ app: "bvim", ok: true });
});

app.get("/api/path-completions", async (req, res) => {
  try {
    const completions = await completePath(req.query.path);
    res.json({ completions });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES") {
      res.json({ completions: [] });
      return;
    }
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/recent-documents", async (_req, res) => {
  try {
    res.json({ documents: await listRecentDocuments() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/document", async (req, res) => {
  try {
    const { file, fullPath } = resolveDocumentPath(req.query.file);
    try {
      const document = await readJsonFile(fullPath);
      res.json({ ...document, file, exists: true });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      res.json({ ...createStarterDocument(file), exists: false });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/document", async (req, res) => {
  try {
    const { file, fullPath } = resolveDocumentPath(req.body?.file);
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
    const title = String(req.body?.title || titleFromFileName(file)).slice(0, 160);
    const document = {
      app: "bvim",
      version: 1,
      file,
      title,
      savedAt: new Date().toISOString(),
      blocks
    };
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await rememberRecentDocument(fullPath);
    res.json({ ok: true, file, savedAt: document.savedAt });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const vite = await createViteServer({
  root: __dirname,
  appType: "spa",
  server: {
    middlewareMode: true,
    hmr: {
      port: port + 10000
    }
  }
});

app.use(vite.middlewares);

app.listen(port, "127.0.0.1", () => {
  console.log(`bvim running at http://localhost:${port}`);
});
