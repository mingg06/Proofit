import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "../backend/config.ts";
import { Store } from "../backend/database.ts";
import { Foundation } from "../backend/foundation.ts";
import { Gateway } from "../backend/gateway.ts";
import { ReviewPipeline } from "../backend/review-pipeline.ts";
import { Investigator } from "../investigator/runner.ts";
import type { RuntimeFactory } from "./runtime.ts";
let store: Store | undefined;
try {
  const settings = config();
  const modulePath = process.env.PROOFIT_RUNTIME_MODULE?.trim();
  if (!modulePath)
    throw new Error("Verified integration module is not configured");
  store = new Store(settings.databasePath);
  store.migrate();
  const foundation = new Foundation(store, () => new Date(), true);
  // Operator-selected code only. No public route/model argument can choose this module.
  const imported = (await import(pathToFileURL(resolve(modulePath)).href)) as {
    createRuntime?: RuntimeFactory;
  };
  if (typeof imported.createRuntime !== "function")
    throw new Error("Invalid integration module");
  const runtime = await imported.createRuntime({ foundation });
  if (
    runtime.model.provenance !== "LIVE" ||
    runtime.proposer.provenance !== "LIVE"
  )
    throw new Error("Controlled models cannot activate this worker");
  const gateway = new Gateway(store, { reader: runtime.providerReader });
  gateway.staff(foundation.auth.session(runtime.staffToken).actor);
  const investigator = new Investigator(gateway, {
    model: runtime.model,
    retrieval: runtime.retrieval,
  });
  const pipeline = new ReviewPipeline(
    foundation,
    investigator,
    runtime.proposer,
    runtime.execution,
  );
  let stopping = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopping = true;
    if (timer) clearTimeout(timer);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  console.log(
    "PROOFIT automatic review worker started. Integration access/phase evidence must be verified separately.",
  );
  while (!stopping) {
    await pipeline.runNext(runtime.staffToken);
    if (!stopping)
      await new Promise<void>((done) => {
        const wake = () => {
          if (timer) clearTimeout(timer);
          process.removeListener("SIGINT", wake);
          process.removeListener("SIGTERM", wake);
          done();
        };
        timer = setTimeout(wake, 2000);
        process.once("SIGINT", wake);
        process.once("SIGTERM", wake);
      });
  }
} catch {
  console.error(
    "Automatic review worker stopped: verified runtime configuration, current staff authentication, or processing is unavailable. See docs/MANUAL_SETUP.md. Raw errors withheld.",
  );
  process.exitCode = 1;
} finally {
  store?.close();
}
