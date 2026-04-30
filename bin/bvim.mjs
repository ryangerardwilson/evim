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
  choose a recent document or create a new one
  # bvim
  bvim

  open or create a block document in the desktop editor
  # bvim <file.bvim>
  bvim notes.bvim
  bvim ~/Documents/notes.bvim

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
  if (absolute.endsWith(".bvim") || absolute.endsWith(".bvim.json")) {
    return absolute;
  }
  if (absolute.endsWith(".json")) {
    return absolute.replace(/\.json$/, ".bvim");
  }
  return `${absolute}.bvim`;
}

function stripDocumentExtension(value) {
  return value.replace(/\.bvim\.json$/i, "").replace(/\.bvim$/i, "");
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

function askLine(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
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

async function promptForDocument() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    process.stdout.write("bvim new document\n\n");
    let title = "";
    while (!title) {
      title = String(await askLine(rl, "document name: ")).trim();
    }

    const defaultPath = path.resolve(process.cwd(), documentFileNameFromName(title));
    const rawPath = await askLine(rl, `path [${formatChoice(defaultPath)}]: `);
    const filePath = await resolvePromptPath(rawPath, title);
    return { filePath, title };
  } finally {
    rl.close();
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
        if (key.name === "return") {
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
  return {
    app: "bvim",
    version: 1,
    file: path.basename(filePath),
    title: title || titleFromPath(filePath),
    savedAt: new Date().toISOString(),
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

async function createDocumentIfMissing(filePath, title) {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(starterDocument(filePath, title), null, 2)}\n`, "utf8");
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
    throw new Error("expected one .bvim file path");
  }

  let filePath;
  if (argv.length === 0) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      const preferredPort = Number(process.env.BVIM_PORT || process.env.PORT || 8000);
      const port = await findPort(preferredPort);
      return runElectron({ filePath: null, port, needsDocument: true, workspacePath: os.homedir() });
    }

    const action = await selectLaunchAction(await listRecentDocuments());
    if (!action) {
      return 0;
    }
    if (action.type === "new") {
      const prompted = await promptForDocument();
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
