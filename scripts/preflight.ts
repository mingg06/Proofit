import { existsSync } from "node:fs";
// Configuration checks only; no inference, remote access, passwords or provider writes.
const compatible = Number(process.versions.node.split(".")[0]) === 24;
console.log(
  JSON.stringify({
    node: process.version,
    compatible,
    profile: "STANDALONE_REVIEW",
  }),
);
const databaseFilePresent = existsSync(
  process.env.DATABASE_PATH?.trim() || ".local/proofit.sqlite",
);
console.log(
  JSON.stringify({
    service: "backend",
    databaseFilePresent,
    sessionMode: "OPAQUE_PERSISTENT_TOKENS",
  }),
);
const missing = ["NVIDIA_API_KEY", "NVIDIA_MODEL_ID"].filter(
  (name) => !process.env[name]?.trim(),
);
console.log(
  JSON.stringify({
    service: "nvidia",
    required: true,
    configuration: missing.length ? "MISSING" : "PRESENT",
    missing,
    liveAccess: "NOT_TESTED",
  }),
);
const supportConfigured =
  !!(
    process.env.PROOFIT_SUPPORT_EMAIL?.trim() &&
    process.env.PROOFIT_SUPPORT_PASSWORD
  ) ||
  (!process.env.PROOFIT_SUPPORT_EMAIL &&
    !process.env.PROOFIT_SUPPORT_PASSWORD &&
    existsSync(".local/test-accounts.json"));
console.log(
  JSON.stringify({
    service: "support-account",
    configuration: supportConfigured ? "PRESENT" : "MISSING",
    authentication: "NOT_TESTED",
  }),
);
console.log(
  JSON.stringify({
    service: "evidence-and-memory",
    storage: "LOCAL_SQLITE",
    sourceApproval: "CHECKED_PER_INVESTIGATION",
    sponsorCredentialsRequired: false,
  }),
);
for (const [service, names] of Object.entries({
  zetaris: ["ZETARIS_BASE_URL", "ZETARIS_TOKEN"],
  executor: ["STRIPE_TEST_SECRET_KEY", "EXECUTOR_SERVICE_SECRET"],
})) {
  const absent = names.filter((name) => !process.env[name]?.trim());
  console.log(
    JSON.stringify({
      service,
      required: false,
      configuration: absent.length ? "MISSING" : "PRESENT",
      liveAccess: "NOT_TESTED",
    }),
  );
}
const forbiddenExecutionKey = !!process.env.STRIPE_TEST_SECRET_KEY?.trim();
if (forbiddenExecutionKey)
  console.log(
    JSON.stringify({
      error:
        "Execution credentials must not enter the standalone model/backend process",
    }),
  );
if (
  !compatible ||
  !databaseFilePresent ||
  missing.length ||
  !supportConfigured ||
  forbiddenExecutionKey
)
  process.exitCode = 1;
