import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("PROOFIT requires Node 24");
if (process.env.STRIPE_TEST_SECRET_KEY?.trim())
  throw new Error("Provider execution credentials cannot enter eve");
if (!process.env.NVIDIA_API_KEY?.trim() || !process.env.NVIDIA_MODEL_ID?.trim())
  throw new Error("NVIDIA configuration missing");
await mkdir(".local", { recursive: true });
const secretPath = resolve(".local/eve-service-secret");
let secret: string;
try {
  secret = await readFile(secretPath, "utf8");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  secret = randomBytes(32).toString("hex");
  await writeFile(secretPath, secret, { mode: 0o600, flag: "wx" });
}
if (!/^[a-f0-9]{64}$/.test(secret))
  throw new Error("Invalid local service secret");
const env: NodeJS.ProcessEnv = {};
for (const name of [
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "TEMP",
  "TMP",
  "PATH",
  "PATHEXT",
  "USERPROFILE",
  "LOCALAPPDATA",
  "APPDATA",
  "PROGRAMFILES",
  "ProgramFiles",
  "ComSpec",
])
  if (process.env[name]) env[name] = process.env[name];
env.PATH = resolve(process.execPath, "..") + ";" + (env.PATH ?? "");
Object.assign(env, {
  NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
  NVIDIA_MODEL_ID: process.env.NVIDIA_MODEL_ID,
  EVE_SERVICE_SECRET: secret,
  EVE_TELEMETRY_DISABLED: "1",
  EVE_TRACES: "false",
});
const child = spawn(
  process.execPath,
  [
    "node_modules/eve/bin/eve.js",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "4010",
    "--no-ui",
    "--no-default-extensions",
    "--logs",
    "none",
  ],
  { cwd: resolve("."), env, stdio: "inherit", windowsHide: true },
);
process.once("SIGINT", () => child.kill());
process.once("SIGTERM", () => child.kill());
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
