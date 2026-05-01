#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { documentFileNameFromName, resolveNamedDocumentPath } from "../src/documentPaths.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const electronPath = require("electron");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const stateDir = path.join(os.homedir(), ".local", "state", "bvim");
const recentPath = path.join(stateDir, "recent.json");

const HELP = `bvim

flags:
  bvim -h
    show this help
  bvim -v
    print the installed version
  bvim -u
    upgrade through the installer

features:
  choose a recent Markdown document or create a new one
  # bvim
  bvim

  open or create a Markdown document preview
  # bvim <file.md>
  bvim notes.md
  bvim ~/Documents/notes.md

  run the development web server
  # npm run dev
  npm run dev
`;

function normalizeDocumentPath(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("missing file path");
  }
  const expanded = raw.startsWith("~/") ? path.join(process.env.HOME || "", raw.slice(2)) : raw;
  const absolute = path.resolve(process.cwd(), expanded);
  if (absolute.endsWith(".md")) {
    return absolute;
  }
  return `${absolute}.md`;
}

function stripDocumentExtension(value) {
  return value.replace(/\.md$/i, "");
}

function titleFromPath(filePath) {
  return stripDocumentExtension(path.basename(filePath)).replace(/[-_]+/g, " ");
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

function formatChoice(filePath) {
  const home = os.homedir();
  if (filePath === home) {
    return "~";
  }
  if (filePath.startsWith(`${home}${path.sep}`)) {
    return `~/${path.relative(home, filePath)}`;
  }
  return filePath;
}

async function rememberRecentDocument(filePath) {
  const current = await readRecentDocuments();
  const absolute = path.resolve(filePath);
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
    if (!absolute.endsWith(".md")) {
      continue;
    }
    try {
      const stats = await fs.stat(absolute);
      if (stats.isFile()) {
        documents.push({
          path: absolute,
          openedAt: entry.openedAt || stats.mtimeMs || 0
        });
      }
    } catch {
      // Ignore stale recent files.
    }
    if (documents.length >= 30) {
      break;
    }
  }

  return documents;
}

async function resolvePromptPath(rawPath, title) {
  const documentFileName = documentFileNameFromName(title);
  const defaultPath = path.resolve(process.cwd(), documentFileName);
  const value = String(rawPath || "").trim();
  if (!value) {
    return defaultPath;
  }

  return normalizeDocumentPath(resolveNamedDocumentPath(title, value));
}

function isTerminalEnterKey(key) {
  return (
    key.name === "return" ||
    key.name === "enter" ||
    key.sequence === "\r" ||
    (key.ctrl && key.name === "m")
  );
}

function renderDocumentPrompt({ step, title, rawPath, message = "" }) {
  const defaultPath = title ? path.resolve(process.cwd(), documentFileNameFromName(title)) : "";
  process.stdout.write("\x1b[2J\x1b[H");
  process.stdout.write("bvim new document\n\n");
  process.stdout.write(`document name: ${title}${step === "title" ? "_" : ""}\n`);
  if (step === "path") {
    process.stdout.write(`path [${formatChoice(defaultPath)}]: ${rawPath}_\n`);
  } else if (title) {
    process.stdout.write(`path [${formatChoice(defaultPath)}]:\n`);
  }
  process.stdout.write("\nenter next  esc back\n");
  if (message) {
    process.stdout.write(`${message}\n`);
  }
}

async function promptForDocument({ allowBack = false } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return { type: "back" };
  }

  let step = "title";
  let title = "";
  let rawPath = "";
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  renderDocumentPrompt({ step, title, rawPath });

  try {
    return await new Promise((resolve) => {
      const finish = async () => {
        const filePath = await resolvePromptPath(rawPath, title);
        process.stdin.off("keypress", onKeypress);
        resolve({ type: "document", filePath, title });
      };

      const onKeypress = (text, key) => {
        const activeValue = step === "title" ? title : rawPath;
        const setActiveValue = (nextValue) => {
          if (step === "title") {
            title = nextValue;
          } else {
            rawPath = nextValue;
          }
        };

        if (key.name === "escape") {
          if (step === "path") {
            step = "title";
            renderDocumentPrompt({ step, title, rawPath });
            return;
          }
          if (allowBack) {
            process.stdin.off("keypress", onKeypress);
            resolve({ type: "back" });
            return;
          }
          process.stdin.off("keypress", onKeypress);
          resolve(null);
          return;
        }

        if (key.ctrl && key.name === "c") {
          process.stdin.off("keypress", onKeypress);
          resolve(null);
          return;
        }

        if (isTerminalEnterKey(key)) {
          if (step === "title") {
            title = title.trim();
            if (!title) {
              renderDocumentPrompt({ step, title, rawPath, message: "document name required" });
              return;
            }
            step = "path";
            renderDocumentPrompt({ step, title, rawPath });
            return;
          }
          finish();
          return;
        }

        if (key.name === "backspace") {
          setActiveValue(activeValue.slice(0, -1));
          renderDocumentPrompt({ step, title, rawPath });
          return;
        }

        if (text && !key.ctrl && !key.meta && text >= " ") {
          setActiveValue(`${activeValue}${text}`);
          renderDocumentPrompt({ step, title, rawPath });
        }
      };

      process.stdin.on("keypress", onKeypress);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdout.write("\x1b[2J\x1b[H");
  }
}

async function selectLaunchAction(documents) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return { type: "new" };
  }

  const options = [{ type: "new", label: "new document" }].concat(
    documents.map((document) => ({
      type: "open",
      label: formatChoice(document.path),
      filePath: document.path
    }))
  );
  let index = 0;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  const render = () => {
    process.stdout.write("\x1b[2J\x1b[H");
    process.stdout.write("bvim\n\n");
    options.forEach((option, itemIndex) => {
      const marker = itemIndex === index ? ">" : " ";
      process.stdout.write(`${marker} ${option.label}\n`);
    });
    process.stdout.write("\nenter open  n new  j/k move  q quit\n");
  };

  try {
    render();
    return await new Promise((resolve) => {
      const onKeypress = (_text, key) => {
        if (key.name === "down" || key.name === "j") {
          index = Math.min(options.length - 1, index + 1);
          render();
          return;
        }
        if (key.name === "up" || key.name === "k") {
          index = Math.max(0, index - 1);
          render();
          return;
        }
        if (key.name === "n") {
          process.stdin.off("keypress", onKeypress);
          resolve({ type: "new" });
          return;
        }
        if (isTerminalEnterKey(key)) {
          process.stdin.off("keypress", onKeypress);
          resolve(options[index]);
          return;
        }
        if (key.name === "escape" || key.name === "q" || (key.ctrl && key.name === "c")) {
          process.stdin.off("keypress", onKeypress);
          resolve(null);
        }
      };
      process.stdin.on("keypress", onKeypress);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdout.write("\x1b[2J\x1b[H");
  }
}

function starterDocument(filePath, title) {
  const heading = title || titleFromPath(filePath);
  return `# ${heading}\n\n`;
}

async function createDocumentIfMissing(filePath, title) {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, starterDocument(filePath, title), "utf8");
    return true;
  }
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findPort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await portIsFree(port)) {
      return port;
    }
  }
  throw new Error(`no free port found from ${startPort} to ${startPort + 99}`);
}

function runElectron({ filePath, port, needsDocument = false, workspacePath = null }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      electronPath,
      [
        "--in-process-gpu",
        "--disable-gpu-sandbox",
        "--disable-vulkan",
        "--disable-features=Vulkan,VulkanFromANGLE",
        "electron/main.cjs"
      ],
      {
        cwd: appRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          BVIM_PORT: String(port),
          BVIM_WORKSPACE: workspacePath || (filePath ? path.dirname(filePath) : process.cwd()),
          BVIM_INITIAL_FILE: filePath || "",
          BVIM_NEEDS_DOCUMENT: needsDocument ? "1" : ""
        }
      }
    );

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code || 0);
    });
  });
}

function runInstallerUpgrade() {
  const installScript = process.env.BVIM_INSTALL_SCRIPT || path.join(appRoot, "install.sh");
  return new Promise((resolve, reject) => {
    const child = spawn(installScript, ["-u"], {
      cwd: appRoot,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code || 0);
    });
  });
}

async function main(argv) {
  if (argv.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }

  if (argv.includes("-v")) {
    process.stdout.write(`${packageJson.version}\n`);
    return 0;
  }

  if (argv.includes("-u")) {
    if (argv.length > 1) {
      throw new Error("-u cannot be combined with a file path");
    }
    return runInstallerUpgrade();
  }

  if (argv.length > 1) {
    throw new Error("expected one .md file path");
  }

  let filePath;
  if (argv.length === 0) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      const preferredPort = Number(process.env.BVIM_PORT || process.env.PORT || 8000);
      const port = await findPort(preferredPort);
      return runElectron({ filePath: null, port, needsDocument: true, workspacePath: os.homedir() });
    }

    const recentDocuments = await listRecentDocuments();
    const action = await selectLaunchAction(recentDocuments);
    if (!action) {
      return 0;
    }
    if (action.type === "new") {
      const prompted = await promptForDocument({ allowBack: recentDocuments.length > 0 });
      if (!prompted) {
        return 0;
      }
      if (prompted.type === "back") {
        return main([]);
      }
      filePath = prompted.filePath;
      await createDocumentIfMissing(filePath, prompted.title);
    } else {
      filePath = action.filePath;
    }
  } else {
    filePath = normalizeDocumentPath(argv[0]);
  }

  await rememberRecentDocument(filePath);
  const preferredPort = Number(process.env.BVIM_PORT || process.env.PORT || 8000);
  const port = await findPort(preferredPort);
  return runElectron({ filePath, port });
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`bvim: ${error.message}\n`);
    process.exit(1);
  });
