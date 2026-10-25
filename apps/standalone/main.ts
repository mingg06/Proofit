import { readFile } from "node:fs/promises";
import { z } from "zod";
import { config } from "../backend/config.ts";
import { Store } from "../backend/database.ts";
import { Foundation } from "../backend/foundation.ts";
import { createApi } from "../backend/http.ts";
import {
  createNvidiaModel,
  createNvidiaProposer,
} from "../investigator/nvidia-model.ts";
import { prepareStandaloneFixtures } from "./fixtures.ts";
import { standaloneReview } from "./runtime.ts";

let store: Store | undefined;
let stage = "runtime configuration";
try {
  const settings = config();
  if (settings.bindHost !== "127.0.0.1")
    throw new Error("Standalone development runs on loopback only");
  const key = z.string().trim().min(1).parse(process.env.NVIDIA_API_KEY);
  const modelId = z.string().trim().min(1).parse(process.env.NVIDIA_MODEL_ID);
  let account: { email: string; password: string };
  stage = "support-account configuration";
  if (
    process.env.PROOFIT_SUPPORT_EMAIL ||
    process.env.PROOFIT_SUPPORT_PASSWORD
  ) {
    account = z
      .object({ email: z.email(), password: z.string().min(1) })
      .parse({
        email: process.env.PROOFIT_SUPPORT_EMAIL,
        password: process.env.PROOFIT_SUPPORT_PASSWORD,
      });
  } else {
    // Local seed shortcut only; all credentials still authenticate against the stored account/role.
    const accounts = z
      .array(
        z.object({
          email: z.string(),
          password: z.string(),
          role: z.string(),
          tenant: z.string(),
        }),
      )
      .parse(JSON.parse(await readFile(".local/test-accounts.json", "utf8")));
    const seeded = accounts.find(
      (a) =>
        a.email === "support.a@proofit.test" &&
        a.tenant === "tenant_synthetic_a" &&
        a.role === "SUPPORT",
    );
    if (!seeded) throw new Error("Local support account unavailable");
    account = { email: seeded.email, password: seeded.password };
  }
  stage = "database migration and fixture preparation";
  store = new Store(settings.databasePath);
  store.migrate();
  prepareStandaloneFixtures(store);
  const foundation = new Foundation(store, () => new Date(), true);
  stage = "model setup and support authentication";
  const runtime = await standaloneReview(foundation, account, {
    model: createNvidiaModel(key, modelId),
    proposer: createNvidiaProposer(key, modelId),
  });
  const server = createApi(foundation, settings.origin, {
    gateway: runtime.gateway,
    investigator: runtime.investigator,
  });
  stage = "loopback server startup";
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(settings.port, settings.bindHost, resolve);
  });
  console.log(
    "PROOFIT standalone: " +
      settings.origin +
      ". Direct NVIDIA and local evidence; provider execution disabled. Seed records remain synthetic.",
  );
  const stop = new AbortController();
  stage = "automatic review processing";
  const shutdown = () => stop.abort();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    while (!stop.signal.aborted) {
      await runtime.pipeline.runNext(runtime.token);
      if (!stop.signal.aborted)
        await new Promise<void>((resolve) => {
          const wake = () => {
            clearTimeout(timer);
            stop.signal.removeEventListener("abort", wake);
            resolve();
          };
          const timer = setTimeout(wake, 1500);
          stop.signal.addEventListener("abort", wake, { once: true });
        });
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
    runtime.close();
  }
} catch {
  console.error(
    "Standalone stopped during " +
      stage +
      ". See docs/STANDALONE.md. Raw errors withheld.",
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
