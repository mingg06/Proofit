import { mkdir, writeFile } from "node:fs/promises";
import { runDevelopmentCases } from "../fixtures/development-trials.ts";
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("PROOFIT requires Node 24");
try {
  const result = await runDevelopmentCases();
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/development-case-results.json",
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
  if (result.passedCaseCount !== result.caseCount) process.exitCode = 1;
} catch {
  console.error(
    "Controlled development-case runner failed. No provider execution was enabled; inspect local tests. Raw errors withheld.",
  );
  process.exitCode = 1;
}
