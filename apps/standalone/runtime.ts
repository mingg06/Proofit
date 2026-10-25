import { Gateway } from "../backend/gateway.ts";
import {
  ReviewPipeline,
  type ProposingModel,
} from "../backend/review-pipeline.ts";
import type { Foundation } from "../backend/foundation.ts";
import { Investigator } from "../investigator/runner.ts";
import { LocalEvidence } from "../investigator/local-evidence.ts";
import type { InvestigationModel } from "../../packages/contracts/investigation.ts";

export async function standaloneReview(
  foundation: Foundation,
  account: { email: string; password: string },
  models: { model: InvestigationModel; proposer: ProposingModel },
) {
  if (
    models.model.provenance !== "LIVE" ||
    models.proposer.provenance !== "LIVE"
  )
    throw new Error("Standalone startup requires real models");
  const session = await foundation.auth.login({
    email: account.email,
    password: account.password,
  });
  const actor = foundation.auth.session(session.token).actor;
  if (actor.role !== "SUPPORT") {
    foundation.auth.logout(session.token);
    throw new Error("A support service account is required");
  }
  const gateway = new Gateway(foundation.store, { now: foundation.now });
  // No provider reader or execution service: local review cannot invent provider state.
  const investigator = new Investigator(gateway, {
    model: models.model,
    retrieval: new LocalEvidence(),
    memory: false,
    preloadEvidence: true,
  });
  const pipeline = new ReviewPipeline(
    foundation,
    investigator,
    models.proposer,
  );
  return {
    gateway,
    investigator,
    pipeline,
    token: session.token,
    close() {
      foundation.auth.logout(session.token);
    },
  };
}
