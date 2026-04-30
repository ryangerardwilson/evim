import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launcher = path.join(appRoot, "bvim");

function execLauncher(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(launcher, args, { cwd: appRoot, ...options }, (error, stdout, stderr) => {
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

test("-h prints human help", async () => {
  const { stdout } = await execLauncher(["-h"]);
  assert.match(stdout, /^bvim\n/);
  assert.match(stdout, /features:/);
  assert.doesNotMatch(stdout, /Usage:/);
});

test("-v prints package version only", async () => {
  const { stdout } = await execLauncher(["-v"]);
  const packageJson = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
  assert.equal(stdout, `${packageJson.version}\n`);
});

test("-u delegates to installer upgrade mode", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "bvim-test-"));
  const installer = path.join(tmp, "install.sh");
  const log = path.join(tmp, "args.txt");
  await fs.writeFile(
    installer,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > "${log}"\n`,
    "utf8"
  );
  await fs.chmod(installer, 0o755);
  await execLauncher(["-u"], {
    env: { ...process.env, BVIM_INSTALL_SCRIPT: installer }
  });
  assert.equal((await fs.readFile(log, "utf8")).trim(), "-u");
});
