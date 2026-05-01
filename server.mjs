import express from "express";
import { spawn } from "node:child_process";
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
  return String(value || "").endsWith(".md");
}

function withDocumentExtension(value) {
  if (hasDocumentExtension(value)) {
    return value;
  }
  return `${value}.md`;
}

function expandHome(value) {
  return String(value || "").startsWith("~/") ? path.join(os.homedir(), String(value).slice(2)) : value;
}

function stripDocumentExtension(value) {
  return String(value || "").replace(/\.md$/i, "");
}

function titleFromMarkdown(markdown, fallback) {
  const heading = String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim())
    .find(Boolean);
  return heading || titleFromFileName(fallback);
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
    .filter((entry) => entry.isDirectory() || hasDocumentExtension(entry.name))
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
    throw new Error("bvim documents must end in .md");
  }

  if (!allowedRoots.some((root) => isInsideRoot(fullPath, root))) {
    throw new Error("document path is outside this bvim session");
  }

  return { file: displayFileName(fullPath), fullPath };
}

function createStarterMarkdown(file, title = titleFromFileName(file)) {
  return `# ${title}\n\n`;
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
    if (!hasDocumentExtension(absolute) || !allowedRoots.some((root) => isInsideRoot(absolute, root))) {
      continue;
    }
    try {
      const stats = await fs.stat(absolute);
      if (!stats.isFile()) {
        continue;
      }
      const markdown = await fs.readFile(absolute, "utf8");
      documents.push({
        path: absolute,
        file: displayFileName(absolute),
        title: titleFromMarkdown(markdown, absolute),
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

function resolveAssetPath(fileValue, assetValue) {
  const { fullPath } = resolveDocumentPath(fileValue);
  const rawAsset = String(assetValue || "").trim();
  if (!rawAsset || /^[a-z][a-z0-9+.-]*:/i.test(rawAsset)) {
    throw new Error("asset path must be relative to the markdown file");
  }
  const assetPath = path.resolve(path.dirname(fullPath), rawAsset);
  const documentDir = path.dirname(fullPath);
  if (!isInsideRoot(assetPath, documentDir)) {
    throw new Error("asset path is outside the markdown directory");
  }
  return assetPath;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function editorLineFromRequest(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const line = Number(value);
  if (!Number.isInteger(line) || line < 1) {
    throw new Error("line must be a positive integer");
  }
  return line;
}

function buildEditorCommand(editor, fullPath, line) {
  const lineArgs = line ? ` +${line} +${shellQuote("normal! zz")}` : "";
  return `${editor}${lineArgs} ${shellQuote(fullPath)}`;
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-lc", `command -v ${shellQuote(command)} >/dev/null 2>&1`], {
      stdio: "ignore"
    });
    child.on("exit", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function resolveTerminalCommand({ workdir, title, command }) {
  const preferred = process.env.BVIM_TERMINAL || process.env.TERMINAL || "";
  const preferredName = path.basename(preferred);

  if (preferredName && (await commandExists(preferredName))) {
    if (preferredName.includes("alacritty")) {
      return {
        executable: preferredName,
        args: ["--working-directory", workdir, "--title", title, "-e", "sh", "-lc", command]
      };
    }
    if (preferredName.includes("xdg-terminal-exec")) {
      return {
        executable: preferredName,
        args: ["sh", "-lc", `cd ${shellQuote(workdir)} && ${command}`]
      };
    }
    return {
      executable: preferredName,
      args: ["-e", "sh", "-lc", `cd ${shellQuote(workdir)} && ${command}`]
    };
  }

  if (await commandExists("alacritty")) {
    return {
      executable: "alacritty",
      args: ["--working-directory", workdir, "--title", title, "-e", "sh", "-lc", command]
    };
  }

  if (await commandExists("kitty")) {
    return {
      executable: "kitty",
      args: ["--directory", workdir, "--title", title, "sh", "-lc", command]
    };
  }

  if (await commandExists("wezterm")) {
    return {
      executable: "wezterm",
      args: ["start", "--cwd", workdir, "--", "sh", "-lc", command]
    };
  }

  if (await commandExists("foot")) {
    return {
      executable: "foot",
      args: ["--working-directory", workdir, "--title", title, "sh", "-lc", command]
    };
  }

  if (await commandExists("xterm")) {
    return {
      executable: "xterm",
      args: ["-T", title, "-e", "sh", "-lc", `cd ${shellQuote(workdir)} && ${command}`]
    };
  }

  if (await commandExists("xdg-terminal-exec")) {
    return {
      executable: "xdg-terminal-exec",
      args: ["sh", "-lc", `cd ${shellQuote(workdir)} && ${command}`]
    };
  }

  throw new Error("no supported terminal found");
}

function launchTerminal({ executable, args, workdir }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workdir,
      detached: true,
      stdio: "ignore"
    });

    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    const timer = setTimeout(() => {
      child.unref();
      finish(resolve);
    }, 500);

    child.once("error", (error) => {
      finish(reject, error);
    });

    child.once("exit", (code, signal) => {
      finish(
        reject,
        new Error(`${executable} exited before opening the editor${signal ? ` (${signal})` : ` (${code})`}`)
      );
    });
  });
}

async function openTerminalEditor(fullPath, line = null) {
  const editor = process.env.BVIM_EDITOR || process.env.VISUAL || process.env.EDITOR || "vim";
  const workdir = path.dirname(fullPath);
  const command = buildEditorCommand(editor, fullPath, line);
  const title = `bvim ${path.basename(fullPath)}`;
  const terminal = await resolveTerminalCommand({ workdir, title, command });
  await launchTerminal({ ...terminal, workdir });
  return terminal.executable;
}

const app = express();
app.use(express.json({ limit: "4mb" }));

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
      const stats = await fs.stat(fullPath);
      const markdown = await fs.readFile(fullPath, "utf8");
      res.json({
        file,
        fullPath,
        title: titleFromMarkdown(markdown, fullPath),
        markdown,
        mtimeMs: stats.mtimeMs,
        exists: true
      });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      const markdown = createStarterMarkdown(file);
      res.json({
        file,
        fullPath,
        title: titleFromMarkdown(markdown, fullPath),
        markdown,
        mtimeMs: null,
        exists: false
      });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/document", async (req, res) => {
  try {
    const { file, fullPath } = resolveDocumentPath(req.body?.file);
    const markdown = String(req.body?.markdown ?? createStarterMarkdown(file));
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, markdown, "utf8");
    await rememberRecentDocument(fullPath);
    const stats = await fs.stat(fullPath);
    res.json({
      ok: true,
      file,
      title: titleFromMarkdown(markdown, fullPath),
      mtimeMs: stats.mtimeMs
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/open-editor", async (req, res) => {
  try {
    const { file, fullPath } = resolveDocumentPath(req.body?.file);
    const line = editorLineFromRequest(req.body?.line);
    try {
      await fs.access(fullPath);
    } catch {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, createStarterMarkdown(fullPath), "utf8");
    }
    await rememberRecentDocument(fullPath);
    const terminal = await openTerminalEditor(fullPath, line);
    res.json({ ok: true, file, terminal, line });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/asset", (req, res) => {
  try {
    const assetPath = resolveAssetPath(req.query.file, req.query.path);
    res.sendFile(assetPath);
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
