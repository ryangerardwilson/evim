import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installScript = path.join(appRoot, "install.sh");

function execInstall(args) {
  return new Promise((resolve, reject) => {
    execFile(installScript, args, { cwd: appRoot }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

test("install.sh -h prints installer help", async () => {
  const { stdout } = await execInstall(["-h"]);
  assert.match(stdout, /^bvim installer\n/);
  assert.match(stdout, /install\.sh -u/);
});

test("installer checks installed version with bvim -v", async () => {
  const source = await fs.readFile(installScript, "utf8");
  assert.match(source, /\$LAUNCHER" -v/);
});

test("installer installs electron for the desktop runtime", async () => {
  const source = await fs.readFile(installScript, "utf8");
  assert.match(source, /npm install --no-save electron@\^41\.3\.0/);
});
