const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const port = Number(process.env.BVIM_PORT || process.env.PORT || 8000);
const initialFile = process.env.BVIM_INITIAL_FILE || "";
const workspaceRoot = process.env.BVIM_WORKSPACE || process.cwd();
const serverUrl = `http://127.0.0.1:${port}`;
let serverProcess = null;

app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-vulkan");
app.commandLine.appendSwitch("disable-features", "Vulkan,VulkanFromANGLE");

async function serverIsReady() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const response = await fetch(`${serverUrl}/api/health`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => ({}));
    return payload.app === "bvim";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await serverIsReady()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`bvim server did not become ready on port ${port}`);
}

async function ensureServer() {
  if (await serverIsReady()) {
    return;
  }

  serverProcess = spawn("node", ["server.mjs"], {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(port),
      BVIM_WORKSPACE: workspaceRoot,
      BVIM_INITIAL_FILE: initialFile
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
  serverProcess.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`bvim server exited with code ${code}`);
    }
  });

  await waitForServer();
}

function forwardReservedEditorKeys(window) {
  window.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    if (input.control && !input.alt && !input.meta && key === "q") {
      event.preventDefault();
      app.quit();
      return;
    }
    if ((input.control || input.meta) && !input.alt && key === "w") {
      event.preventDefault();
      window.webContents.send("bvim-control-key", "w");
    }
  });
}

async function createWindow() {
  await ensureServer();
  Menu.setApplicationMenu(null);

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,
    minHeight: 360,
    backgroundColor: "#00000000",
    transparent: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  forwardReservedEditorKeys(window);
  const targetUrl = initialFile
    ? `${serverUrl}/?file=${encodeURIComponent(initialFile)}`
    : serverUrl;
  await window.loadURL(targetUrl);
  window.focus();
}

app.whenReady().then(() => {
  ipcMain.on("bvim-quit", () => app.quit());
  createWindow().catch((error) => {
    console.error(error);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }
});
