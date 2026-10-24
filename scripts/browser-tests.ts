import { spawn } from "node:child_process";
import { resolve } from "node:path";
const command =
  process.argv[2] === "install"
    ? ["install", "chromium"]
    : [
        "test",
        "--config",
        "e2e/playwright.config.ts",
        ...process.argv.slice(2),
      ];
const child = spawn(
  process.execPath,
  [resolve("node_modules/playwright/cli.js"), ...command],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: resolve(".local/pw-browsers"),
    },
  },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", () => {
  console.error("Unable to start the browser test runner.");
  process.exitCode = 1;
});
